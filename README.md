# AI 导演画布（Director Canvas）

把原 `ai-tools` 的「AI 导演模式」（纯对话向导）升级为**即梦风格的可视化 AI 画布**——拖拽式节点、参考图库、分镜时间轴、关键帧连线、AI 导演自动规划。

> 原项目仓库 `lwl555/ai-tools` 只提交了构建产物、没有源码；本目录是一个**独立、源码可维护**的 React + Vite + TS 应用，复用你原有的 **Agnes AI** 后端与 **Supabase** 会话表。

## 相对原导演模式的提升

| 维度 | 原导演模式 | 本 AI 导演画布 |
|------|-----------|----------------|
| 交互形态 | 纯对话 4 步向导 | 可视化画布（节点拖拽 / 缩放 / 连线） |
| 参考图 | 仅文本概念 | 左侧「参考图库」可上传/生成，并拖端口连到分镜首/尾帧 |
| 时间轴 | 无 | 底部分镜时间轴，可拖拽排序、显示时长与总时长 |
| 关键帧一致性 | 提示词里写了「首帧+尾帧」但**接口实际没传图** | **真正把首帧/尾帧图传给 Agnes**（`image`/`last_frame`），修掉了原版的 bug |
| 镜头运动 | 无 | 每个分镜可选 推近/拉远/环绕/手持 等 10 种 |
| AI 导演 | 输出文本剧本 | 输出结构化 JSON 故事板，自动铺节点+连线+生成参考图 |
| Key 安全 | Agnes key 明文写死在前端 | 开发态走 Vite 代理注入 key；生产态走 Supabase Edge Function |

## 快速开始

```bash
npm install
cp .env.example .env.local      # 填入 AGNES_API_KEY（已预填你原 key）
npm run dev                     # http://localhost:5180
```

开发态：`vite.config.ts` 把 `/api/agnes/*` 代理到 `apihub.agnes-ai.com` 并在服务端注入 key，**key 不进浏览器 bundle**。

## 生产部署（关键：保护 key）

把前端 key 收回到服务端代理：

1. 部署 Supabase Edge Function（见 `supabase/functions/agnes-proxy/index.ts`）：
   ```bash
   supabase secrets set AGNES_API_KEY=sk-xxxx
   supabase functions deploy agnes-proxy
   ```
2. 构建时设置 `VITE_AGNES_BASE=https://<项目>.functions.supabase.co/agnes-proxy`
3. `npm run build`，把 `dist/` 部署到 GitHub Pages / 任意静态托管。

> ⚠️ 强烈建议：原 key 已在前端明文泄露，**请尽快在 Agnes 后台重置**，并用新 key 配置上面的代理与 `.env.local`。

### 部署到 GitHub Pages（一键 Actions，已就绪）

仓库已包含 `.github/workflows/deploy.yml`，推到 GitHub 即自动构建并发布到 Pages。**部署后网站跑在 GitHub 的服务器上，与你本机无任何连接，不会在你设备上开端口。**

需要你做的（我没法替你做的，因为需要你的账号凭证）：

1. **建仓库并推送**（需要你的 GitHub 登录态 / token）：
   ```bash
   cd ai-director-canvas
   git init && git add -A && git commit -m "feat: AI 导演画布"
   git branch -M main
   gh repo create ai-director-canvas --public   # 或去 github.com 手动建
   git remote add origin https://github.com/<你的名>/ai-director-canvas.git
   git push -u origin main
   ```
2. **配仓库变量**（Settings → Secrets and variables → Actions → Variables）：
   - `VITE_AGNES_BASE` = `https://<项目ref>.functions.supabase.co/agnes-proxy`
   - `VITE_SUPABASE_URL` = `https://<项目ref>.supabase.co`
   - `VITE_SUPABASE_ANON` = 你的 supabase anon key（公开安全）
3. **部署 Supabase 代理函数**（需要你的 Supabase 登录态，Agnes key 只存在这里）：
   ```bash
   supabase secrets set AGNES_API_KEY=sk-新key
   supabase functions deploy agnes-proxy
   ```
4. **开启 Pages**：Settings → Pages → Source 选 `GitHub Actions`。之后每次 push 到 main 自动发布。

> 未配 `VITE_AGNES_BASE` 时，构建产物仍不含任何 key（只有 Supabase 匿名 key，公开安全）。Agnes key 全程只在 Supabase 函数 secret 里。

## 使用流程

1. 点右上「✨ 智能导演」，输入创意（如：「橘猫在城市屋顶看霓虹夜景，治愈系，30秒」）。
2. AI 导演返回故事板：自动创建**角色定妆/场景/道具参考图节点** + **分镜视频节点**，并按 `firstFrameRef/lastFrameRef` 自动连线。
3. 画布自动生成参考图；点「▶ 生成全部视频」批量生成分镜视频（3 个并发，轮询状态）。
4. 底部时间轴可拖拽调整分镜顺序；左侧参考图可上传本地图；右侧检查器编辑提示词/镜头运动/关键帧/尺寸。
5. 所有内容自动保存到浏览器本地（localStorage），若配置了 Supabase 还会同步到 `director_sessions` 表（需加 `canvas_json` 列）。

## 目录结构

```
src/
  types.ts                 数据模型（节点/边/项目）
  store.tsx                画布状态（useReducer + 自动保存）
  lib/agnes.ts             Agnes 客户端（chat/image/video/status/translate）
  lib/directorPrompt.ts    智能导演系统提示词 + JSON 解析
  lib/persistence.ts       localStorage + 可选 Supabase
  hooks/useGenerator.ts    图片/视频生成与轮询
  components/              TopBar / LeftSidebar / Canvas / Inspector / Timeline / DirectorChat
supabase/functions/agnes-proxy/   生产代理（保护 key）
```

## 接入原 ai-tools

本应用可整体作为新的 `/director` 页面：把 `src/` 与 `vite.config.ts` 并入你的 Vite 工程，路由指向 `App`，构建产物替换原 `/director` 页面即可；后端无需改动（Agnes 接口、Supabase 表均复用）。
