# 部署到 GitHub Pages — 你需要提供的信息 & 怎么给

仓库已在本地 git 提交好（含 `.github/workflows/deploy.yml`）。两种走法：

## 走法 A（推荐，最安全）：你在本地跑，密钥不进聊天
GitHub / Supabase 密钥全程只在你本机，不进对话框。

**前置安装（一次）：**
```bash
# Git for Windows 自带 git；另装：
winget install --id GitHub.cli
winget install --id Supabase.CLI
gh auth login          # 浏览器登录 GitHub
supabase login         # 浏览器登录 Supabase
```

**执行：**
```bash
cd ai-director-canvas

# 1) 建仓库并推送（公开仓库才能用免费 GitHub Pages）
gh repo create ai-director-canvas --public
git remote add origin https://github.com/$USER/ai-director-canvas.git
git push -u origin main

# 2) 去仓库 Settings → Secrets and variables → Actions → Variables 加三项：
#    VITE_AGNES_BASE = https://<项目ref>.functions.supabase.co/agnes-proxy
#    VITE_SUPABASE_URL = https://<项目ref>.supabase.co
#    VITE_SUPABASE_ANON = <supabase anon key>   （anon key 本就公开，可用 Variable）

# 3) 部署代理函数（Agnes key 只存在这里，不进前端）
supabase secrets set AGNES_API_KEY=sk-新key
supabase functions deploy agnes-proxy

# 4) Settings → Pages → Source 选 "GitHub Actions"
#    之后每次 push 到 main 自动发布
```

## 走法 B：把信息给我，我来跑（密钥会进对话，用完请立刻吊销）
在聊天里给我这些（敏感凭证，用完立即吊销）：

1. **GitHub Fine-grained PAT**（不是 classic，只授权这一个仓库）：
   - GitHub → Settings → Developer settings → Personal access tokens → Fine-grained
   - Repository access 选 `ai-director-canvas`；Permissions: Contents(read&write)、Pages(read&write)、Actions(read&write)；有效期 7 天
2. **Supabase Access Token**：supabase.com → Account → Access Tokens → New token（用完 revoke）
3. **新的 Agnes API key**：先在 Agnes 后台把旧 key（`sk-hPNTs…`）作废并重置，给新 key
4. **仓库名 + 是否公开**：默认 `ai-director-canvas`，公开

**走法 B 完成后请务必吊销：**
- GitHub PAT：Developer settings → Fine-grained tokens → delete
- Supabase token：Account → Access Tokens → revoke
- Agnes key：旧 key 已泄露，请直接作废

---

## 无论哪种走法，安全结论不变
- 部署后网站跑在 **GitHub 服务器**，与你本机无任何连接，**不会在你设备上开端口**。
- 前端 bundle **不含任何 Agnes key**（已用 `grep sk-hPNT dist/` 验证 0 匹配）；key 只存在于 Supabase 函数 secret。
- 旧 Agnes key 已在前端明文泄露，强烈建议尽快在 Agnes 后台重置。
