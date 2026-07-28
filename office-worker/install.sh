#!/bin/bash
# Office Worker 一键安装脚本（适配 Alibaba Cloud Linux 3 / RHEL 8+）
# 以 root 身份运行：bash install.sh
set -e

echo "== Office Worker 安装脚本 =="

# 1. 系统依赖
echo "[1/6] 安装系统依赖..."
dnf update -y
PACKAGES=(
    python3 python3-pip python3-venv git wget curl
    atk cups-libs libxkbcommon-x11 libXcomposite libXcursor libXdamage
    libXext libXi libXrandr libXtst pango alsa-lib nss
    mesa-libgbm mesa-libglapi mesa-dri-drivers gtk3
    libdrm libgbm libnsl libXScrnSaver
    ipa-gothic-fonts xorg-x11-fonts-Type1 fonts-noto-cjk
)
for pkg in "${PACKAGES[@]}"; do
    dnf install -y "$pkg" || true
done

# 2. 创建用户和目录
echo "[2/6] 创建 office 用户..."
useradd -r -s /bin/false -d /opt/office-worker office 2>/dev/null || true
mkdir -p /opt/office-worker/work /opt/office-worker/out /opt/office-worker/logs
chown -R office:office /opt/office-worker

# 3. 写入 worker.py
echo "[3/6] 写入 worker.py ..."
cat > /opt/office-worker/worker.py <<'PYEOF'
#!/usr/bin/env python3
"""
Office Worker — 浏览器智能体后端
运行在 VPS（如阿里云 ECS 中国香港）上，接收 Supabase office 函数派发的任务，
用 Playwright + LLM（agnes-proxy）完成「打开网址 → 思考 → 操作 → 产出文件」的 agent loop。
"""

import base64
import json
import os
import queue
import re
import subprocess
import sys
import threading
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright
from pydantic import BaseModel, Field

# ---------- 配置 ----------
WORK = Path(os.environ.get("OFFICE_WORK_DIR", "/opt/office-worker/work"))
OUT = Path(os.environ.get("OFFICE_OUT_DIR", "/opt/office-worker/out"))
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Office Worker")

# 单线程 worker loop，保证 Playwright page 始终在同一线程使用
task_queue: queue.Queue = queue.Queue(maxsize=1)  # 当前 + 一个排队
current_job_id: str = ""
_browser: Optional[Browser] = None
_context: Optional[BrowserContext] = None
_page: Optional[Page] = None
_playwright = None


class TaskPayload(BaseModel):
    jobId: str
    deviceId: str
    task: str
    officeUrl: str
    agnesProxyUrl: str
    model: str = "agnes-2.0-flash"
    files: List[Dict[str, Any]] = Field(default_factory=list)


# ---------- 浏览器 ----------
def get_page() -> Page:
    global _page, _context, _browser, _playwright
    if _page is None or _page.is_closed():
        print("[browser] launching Chromium...", flush=True)
        _playwright = sync_playwright().start()
        _browser = _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-setuid-sandbox",
                "--no-first-run",
                "--no-default-browser-check",
            ],
        )
        _context = _browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        _page = _context.new_page()
        _page.set_default_navigation_timeout(30000)
        _page.set_default_timeout(10000)
    return _page


def reset_browser_state():
    """任务之间清理 cookies / storage，避免互相污染。"""
    page = get_page()
    try:
        page.context.clear_cookies()
        page.evaluate("localStorage.clear(); sessionStorage.clear();")
        page.goto("about:blank", wait_until="networkidle")
    except Exception as e:
        print("[browser reset error]", e, flush=True)


def close_browser():
    global _page, _context, _browser, _playwright
    try:
        if _page:
            _page.close()
        if _context:
            _context.close()
        if _browser:
            _browser.close()
        if _playwright:
            _playwright.stop()
    except Exception as e:
        print("[browser close error]", e, flush=True)
    _page = _context = _browser = _playwright = None


# ---------- Supabase 交互 ----------
def report(office_url: str, job_id: str, device_id: str, **kwargs):
    payload = {"jobId": job_id, "deviceId": device_id}
    payload.update(kwargs)
    try:
        requests.post(
            f"{office_url.rstrip('/')}/report",
            json=payload,
            timeout=30,
        )
    except Exception as e:
        print("[report failed]", e, flush=True)


def get_upload_url(office_url: str, job_id: str, device_id: str, name: str, size: int):
    r = requests.post(
        f"{office_url.rstrip('/')}/files-upload",
        json={"jobId": job_id, "deviceId": device_id, "name": name, "size": size},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def upload_artifact(office_url: str, job_id: str, device_id: str, out_path: Path):
    data = out_path.read_bytes()
    up = get_upload_url(office_url, job_id, device_id, out_path.name, len(data))
    requests.put(
        up["url"],
        data=data,
        headers={"Content-Type": "application/octet-stream"},
        timeout=180,
    )
    return {
        "name": out_path.name,
        "path": up["path"],
        "size": len(data),
        "kind": out_path.suffix.lstrip(".").lower() or "file",
    }


# ---------- LLM ----------
def llm(agnes_proxy_url: str, model: str, messages: List[Dict[str, str]], max_tokens: int = 2000):
    r = requests.post(
        f"{agnes_proxy_url.rstrip('/')}/v1/chat/completions",
        json={
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": False,
        },
        timeout=180,
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


# ---------- 代码执行 ----------
def extract_code(text: str):
    s = text.find("<CODE>")
    if s == -1:
        return text.strip(), "python"
    e = text.find("</CODE>", s)
    body = text[s + 6 : e] if e != -1 else text[s + 6 :]
    code = body.strip()
    low = code[:40].lower()
    kind = "bash" if any(x in low for x in ["bash", "sh", "shell"]) else "python"
    return code, kind


def run_code(
    code: str,
    kind: str,
    page: Page,
    office_url: str,
    job_id: str,
    device_id: str,
    agnes_proxy_url: str,
    model: str,
):
    ext = "py" if kind == "python" else "sh"
    fn = WORK / f"_step.{ext}"
    fn.write_text(code, encoding="utf-8")

    if kind == "bash":
        result = subprocess.run(
            ["bash", str(fn)],
            cwd=WORK,
            capture_output=True,
            text=True,
            timeout=120,
        )
        return (result.stdout or "") + (result.stderr or "")

    sandbox_globals = {
        "__builtins__": __builtins__,
        "page": page,
        "WORK": str(WORK),
        "OUT": str(OUT),
        "job_id": job_id,
        "device_id": device_id,
        "office_url": office_url,
        "agnes_proxy_url": agnes_proxy_url,
        "model": model,
        "llm": lambda msgs, max_t=2000: llm(agnes_proxy_url, model, msgs, max_t),
        "report": lambda **kw: report(office_url, job_id, device_id, **kw),
        "upload_artifact": lambda p: upload_artifact(
            office_url, job_id, device_id, Path(p)
        ),
        "requests": requests,
        "json": json,
        "os": os,
        "sys": sys,
        "subprocess": subprocess,
        "Path": Path,
        "re": re,
        "base64": base64,
        "print": print,
    }
    try:
        exec(compile(code, str(fn), "exec"), sandbox_globals)
        return "[python executed successfully]"
    except Exception as e:
        return f"[python error] {e}\n{traceback.format_exc()[-2000:]}"


# ---------- Agent Loop ----------
def parse_plan(text: str):
    a = text.find("[")
    b = text.rfind("]")
    if a != -1 and b != -1 and b > a:
        try:
            arr = json.loads(text[a : b + 1])
            if isinstance(arr, list):
                return [str(x) for x in arr][:8]
        except Exception:
            pass
    lines = [l.strip("-* ").strip() for l in text.split("\n") if l.strip()]
    return lines[:6] or ["执行任务"]


def mark_plan(plan: List[str], done_idx: int):
    return [{"title": t, "done": i <= done_idx} for i, t in enumerate(plan)]


def save_files(files: List[Dict[str, Any]]):
    for f in files[:20]:
        name = f.get("name", "file")
        content = f.get("content", "")
        if not content:
            continue
        try:
            data = base64.b64decode(content)
            (WORK / name).write_bytes(data)
        except Exception as e:
            print("[save file error]", name, e, flush=True)


def clean_dir(p: Path):
    if not p.exists():
        return
    for child in p.iterdir():
        try:
            if child.is_file():
                child.unlink()
            elif child.is_dir():
                subprocess.run(["rm", "-rf", str(child)], check=False)
        except Exception:
            pass


PLAN_SYS = """你是一个办公任务规划器。用户会给你一个办公目标以及已有文件清单。
请把它拆解成 3-6 个清晰的执行步骤（每步一个短标题，中文），用于逐步产出最终交付物。
只输出一个 JSON 数组，例如 ["步骤1","步骤2"]，不要任何解释。"""

EXEC_SYS = """你是一个会在云端 VPS 里真正执行代码的办公助手，当前已经打开了一个 headless Chromium 浏览器实例。
你可以使用 Python 代码操作浏览器、处理文件、生成数据。

可用全局对象和函数：
- page: Playwright Page 对象。你可以调用 page.goto(url)、page.click(selector)、page.fill(selector, value)、page.inner_text(selector)、page.screenshot(path=...) 等。
- WORK: 工作目录字符串，用户上传的文件都在这里。
- OUT: 输出目录字符串，最终交付物必须写到这里。
- llm(messages, max_tokens=2000): 调用大模型继续思考。
- report(status=None, plan=None, logs=None, artifacts=None): 向 Supabase 汇报进度。
- upload_artifact(path): 上传一个文件到 Supabase Storage，返回 {name, path, size, kind}。
- requests, json, os, subprocess, Path, re 等常见库已可用。
- 需要生成 Office 文件时可用 python-pptx、python-docx、openpyxl。

请根据任务步骤写出要执行的代码。只输出一个 <CODE> ... </CODE> 代码块（python 或 bash），不要解释。
如果步骤需要浏览器操作，请写 python 代码使用 page 对象；如果只需要本地处理/生成文件，写 python 或 bash 均可。
所有中间产物写到 WORK 目录。不要写最终交付文件，那一步会单独处理。"""

FINALIZE_SYS = """你是一个会在云端 VPS 里生成最终交付物的办公助手。
当前已经打开了一个 headless Chromium 浏览器实例（全局 page 可用），并且常见 Python 文档库已导入。

可用全局对象和函数：
- page: Playwright Page 对象
- WORK: 工作目录字符串
- OUT: 输出目录字符串（最终交付物必须写到这里）
- llm(messages), report(...), upload_artifact(path)
- python-pptx, python-docx, openpyxl, requests 等库

请根据完整任务与之前步骤的执行输出，写出一个 Python 脚本，在 OUT 目录生成最终交付文件
（例如 报告.html / 总结.docx / 演示.pptx / 数据.xlsx / 项目.zip）。
脚本里必须自己把文件写到 OUT 目录，不要只 print 内容。
只输出一个 <CODE>python ... </CODE> 代码块，不要解释。"""


def run_agent(payload: TaskPayload):
    global current_job_id
    current_job_id = payload.jobId
    office_url = payload.officeUrl.rstrip("/")
    agnes_url = payload.agnesProxyUrl.rstrip("/")
    job_id = payload.jobId
    device_id = payload.deviceId
    task = payload.task
    model = payload.model

    try:
        clean_dir(WORK)
        clean_dir(OUT)
        WORK.mkdir(parents=True, exist_ok=True)
        OUT.mkdir(parents=True, exist_ok=True)
        save_files(payload.files)

        report(office_url, job_id, device_id, status="planning", logs="理解任务，制定计划中…")

        plan_text = llm(
            agnes_url,
            model,
            [
                {"role": "system", "content": PLAN_SYS},
                {
                    "role": "user",
                    "content": f"任务：{task}\n已有文件：{[f.get('name') for f in payload.files]}",
                },
            ],
        )
        plan = parse_plan(plan_text)
        report(
            office_url,
            job_id,
            device_id,
            status="planning",
            plan=[{"title": t, "done": False} for t in plan],
            logs="计划：" + " / ".join(plan),
        )

        page = get_page()
        reset_browser_state()

        report(office_url, job_id, device_id, status="running")
        ctx = ""
        for i, step in enumerate(plan):
            report(
                office_url,
                job_id,
                device_id,
                plan=mark_plan(plan, i),
                logs=f"[步骤 {i+1}/{len(plan)}] {step}",
            )
            code, kind = extract_code(
                llm(
                    agnes_url,
                    model,
                    [
                        {"role": "system", "content": EXEC_SYS},
                        {
                            "role": "user",
                            "content": f"任务：{task}\n当前步骤：{step}\n已完成步骤输出：\n{ctx}\nWORK={WORK}, OUT={OUT}",
                        },
                    ],
                )
            )
            out = run_code(code, kind, page, office_url, job_id, device_id, agnes_url, model)
            ctx += f"步骤{i+1}「{step}」输出:\n{out[-1500:]}\n"
            report(office_url, job_id, device_id, logs=out[-2000:])

        report(office_url, job_id, device_id, status="generating", logs="生成最终交付物…")
        final_code, _ = extract_code(
            llm(
                agnes_url,
                model,
                [
                    {"role": "system", "content": FINALIZE_SYS},
                    {
                        "role": "user",
                        "content": f"任务：{task}\n之前步骤输出：\n{ctx}\n请把最终交付物写到 {OUT}。",
                    },
                ],
            )
        )
        run_code(final_code, "python", page, office_url, job_id, device_id, agnes_url, model)

        artifacts = []
        for p in OUT.iterdir():
            if p.is_file():
                try:
                    artifacts.append(upload_artifact(office_url, job_id, device_id, p))
                except Exception as e:
                    print("[upload artifact error]", p, e, flush=True)

        report(
            office_url,
            job_id,
            device_id,
            status="done",
            artifacts=artifacts,
            logs="已完成，交付物已生成。" if artifacts else "已完成，但未产生文件。",
        )
    except Exception as e:
        err = f"{e}\n{traceback.format_exc()[-2000:]}"
        try:
            report(
                office_url,
                job_id,
                device_id,
                status="error",
                error=err,
                logs=f"[出错] {e}",
            )
        except Exception:
            pass
    finally:
        current_job_id = ""


def worker_loop():
    while True:
        try:
            payload = task_queue.get()
            run_agent(payload)
        except Exception as e:
            print("[worker_loop fatal]", e, flush=True)
        finally:
            try:
                task_queue.task_done()
            except Exception:
                pass


threading.Thread(target=worker_loop, daemon=True).start()


@app.post("/task")
async def receive_task(payload: TaskPayload):
    try:
        task_queue.put(payload, block=False)
        return JSONResponse({"ok": True, "jobId": payload.jobId}, status_code=202)
    except queue.Full:
        return JSONResponse({"error": "worker busy, try again later"}, status_code=503)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "browser_ready": _page is not None and not _page.is_closed(),
        "busy": current_job_id != "",
        "queued": task_queue.qsize(),
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
PYEOF

# 4. 写入 requirements.txt
cat > /opt/office-worker/requirements.txt <<'REQEOF'
fastapi
uvicorn[standard]
pydantic
playwright
requests
python-pptx
python-docx
openpyxl
Pillow
REQEOF

chown -R office:office /opt/office-worker

# 5. Python 虚拟环境与依赖
echo "[4/6] 安装 Python 依赖..."
python3 -m venv /opt/office-worker/venv
/opt/office-worker/venv/bin/pip install -U pip
/opt/office-worker/venv/bin/pip install -r /opt/office-worker/requirements.txt
/opt/office-worker/venv/bin/playwright install chromium

# 6. 安装 cloudflared
echo "[5/6] 安装 cloudflared ..."
curl -L --output /tmp/cloudflared.rpm https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-x86_64.rpm
dnf install -y /tmp/cloudflared.rpm

# 7. systemd 服务
echo "[6/6] 配置 systemd 服务..."
cat > /etc/systemd/system/office-worker.service <<'SVCEOF'
[Unit]
Description=Office Worker
After=network.target

[Service]
Type=simple
User=office
Group=office
WorkingDirectory=/opt/office-worker
Environment=PATH=/opt/office-worker/venv/bin:/usr/local/bin:/usr/bin
Environment=OFFICE_WORK_DIR=/opt/office-worker/work
Environment=OFFICE_OUT_DIR=/opt/office-worker/out
ExecStart=/opt/office-worker/venv/bin/python -m uvicorn worker:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVCEOF

cat > /etc/systemd/system/office-tunnel.service <<'SVCEOF'
[Unit]
Description=Cloudflare Tunnel for Office Worker
After=network.target office-worker.service

[Service]
Type=simple
User=office
Group=office
ExecStart=/usr/bin/cloudflared tunnel --url http://127.0.0.1:8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable office-worker office-tunnel
systemctl start office-worker office-tunnel

# 8. 获取隧道 URL
sleep 15
echo ""
echo "=================================================="
echo "Cloudflare 隧道 URL（复制下面这行给 AI）："
journalctl -u office-tunnel -n 30 --no-pager | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
echo "=================================================="
echo ""
echo "如果上面为空，请等待 10 秒后执行："
echo "  journalctl -u office-tunnel -n 50 | grep trycloudflare"
echo ""
echo "查看 worker 日志："
echo "  journalctl -u office-worker -f"
