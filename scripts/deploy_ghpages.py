"""
部署 dist/ 到 GitHub Pages（gh-pages 分支），通过 GitHub REST Contents API。
用法：GH_PAT=xxx python scripts/deploy_ghpages.py
- 自动确保 gh-pages 分支存在（不存在则从默认分支创建）
- 顺序上传 dist 下所有文件；已存在则带 sha 更新，不存在则新建
- 失败的文件会打印并继续，最后汇总
"""
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

TOKEN = os.environ.get("GH_PAT")
if not TOKEN:
    print("ERROR: 需要环境变量 GH_PAT")
    sys.exit(1)

REPO = "lwl555/ai-director-canvas"
BRANCH = "gh-pages"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根
DIST = os.path.join(ROOT, "dist")

API = f"https://api.github.com/repos/{REPO}"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json",
    "User-Agent": "lingjing-deploy",
    "X-GitHub-Api-Version": "2022-11-28",
}


def api(method, path, data=None):
    url = API + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers=HEADERS)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            if e.code in (429, 502, 503) and attempt < 3:
                wait = 2 ** attempt + 1
                print(f"  rate/retry {e.code}, wait {wait}s")
                time.sleep(wait)
                continue
            return e.code, {"error": txt}
        except Exception as e:  # noqa
            if attempt < 3:
                time.sleep(2)
                continue
            return 0, {"error": str(e)}
    return 0, {"error": "exhausted"}


def ensure_branch():
    st, _ = api("GET", f"/branches/{BRANCH}")
    if st == 200:
        return
    # 从默认分支创建
    st, data = api("GET", "")
    default = data.get("default_branch", "master")
    st2, bdata = api("GET", f"/branches/{default}")
    sha = bdata.get("commit", {}).get("sha")
    if not sha:
        print("ERROR: 无法获取默认分支 HEAD，无法创建 gh-pages")
        sys.exit(1)
    r = api("POST", "/git/refs", {"ref": f"refs/heads/{BRANCH}", "sha": sha})
    print("  创建 gh-pages 分支:", r[0])


def upload(relpath, full):
    with open(full, "rb") as f:
        content = base64.b64encode(f.read()).decode()
    # 取得已有 sha
    st, data = api("GET", f"/contents/{relpath}?ref={BRANCH}")
    sha = data.get("sha") if st == 200 else None
    payload = {
        "message": f"deploy: {relpath}",
        "content": content,
        "branch": BRANCH,
    }
    if sha:
        payload["sha"] = sha
    st2, _ = api("PUT", f"/contents/{relpath}", payload)
    ok = st2 in (200, 201)
    print(f"  [{'OK' if ok else 'FAIL'}] {st2} {relpath}")
    return ok


def write_version():
    # 注入部署时间戳，供 App 端 WorkManager 检测站点更新弹后台通知。
    ts = int(time.time())
    payload = {
        "version": ts,
        "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts)),
        "app": "ai-director-canvas",
    }
    with open(os.path.join(DIST, "version.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False))
    # 关闭 Jekyll，确保 version.json 等静态资源原样服务（GitHub Pages 默认 Jekyll 会吞掉）
    with open(os.path.join(DIST, ".nojekyll"), "w", encoding="utf-8") as f:
        f.write("")
    print("  写入 version.json:", payload["time"], "+ .nojekyll")


def main():
    if not os.path.isdir(DIST):
        print("ERROR: dist/ 不存在，请先 npm run build")
        sys.exit(1)
    ensure_branch()
    write_version()
    ok_count = 0
    fail_count = 0
    for dirpath, _, files in os.walk(DIST):
        for fn in files:
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, DIST).replace(os.sep, "/")
            if upload(rel, full):
                ok_count += 1
            else:
                fail_count += 1
    print(f"\n部署完成：成功 {ok_count}，失败 {fail_count}")
    if fail_count:
        sys.exit(2)


if __name__ == "__main__":
    main()
