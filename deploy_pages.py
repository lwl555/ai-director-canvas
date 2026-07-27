#!/usr/bin/env python3
# 部署 dist/ 到 GitHub Pages (gh-pages 分支)
# 走 GitHub Contents API（api.github.com 在沙箱可达，git 443 端口被封）
# 关键经验：PUT 创建/更新文件时 URL 不带 ?ref（带 ?ref 新建子目录文件会 404）；
#           只读 sha 时 URL 才带 ?ref；路径不要 urllib.parse.quote('/'->%2F)。
import os, sys, base64, json, urllib.request, urllib.error

TOKEN = os.environ.get('GH_TOKEN')
if not TOKEN:
    print('ERROR: GH_TOKEN 未设置'); sys.exit(1)

REPO = 'lwl555/ai-director-canvas'
API = f'https://api.github.com/repos/{REPO}/contents'
DIST = 'dist'
BRANCH = 'gh-pages'

def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    last = None
    for attempt in range(4):
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header('Authorization', f'Bearer {TOKEN}')
        r.add_header('User-Agent', 'workbuddy-deploy/1.0')
        r.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(r, timeout=120) as resp:
                return resp.status, json.loads(resp.read().decode() or '{}')
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read().decode() or '{}')
            except Exception:
                return e.code, {}
        except Exception as e:  # 超时/网络抖动：重试
            last = e
            print(f'  [retry {attempt+1}/4] {method} {url.split("/")[-1]}: {type(e).__name__}')
            import time
            time.sleep(3 * (attempt + 1))
    return getattr(last, 'code', 0) if hasattr(last, 'code') else 0, {}

def walk_files():
    for root, _, files in os.walk(DIST):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, DIST).replace('\\', '/')
            yield rel, full

def main():
    if not os.path.isdir(DIST):
        print(f'ERROR: {DIST}/ 不存在，先 npm run build'); sys.exit(1)
    ok = 0; fail = 0
    for rel, full in sorted(walk_files()):
        with open(full, 'rb') as fh:
            b64 = base64.b64encode(fh.read()).decode()
        # 读 sha（带 ?ref）
        st, js = req('GET', f'{API}/{rel}?ref={BRANCH}')
        sha = js.get('sha') if st == 200 else None
        body = {'message': f'deploy {rel}', 'content': b64, 'branch': BRANCH}
        if sha:
            body['sha'] = sha
        # PUT 不带 ?ref
        st2, js2 = req('PUT', f'{API}/{rel}', body)
        if st2 in (200, 201):
            print(f'OK  [{st2}] {rel}'); ok += 1
        else:
            print(f'ERR [{st2}] {rel}: {json.dumps(js2)[:200]}'); fail += 1
    print(f'--- deployed {ok} ok, {fail} fail ---')
    sys.exit(1 if fail else 0)

if __name__ == '__main__':
    main()
