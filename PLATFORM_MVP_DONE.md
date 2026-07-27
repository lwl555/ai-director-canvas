# 平台升级 · 阶段1 MVP 交付说明

> 线上地址：**https://lwl555.github.io/ai-director-canvas/**
> （用 HashRouter，`/#/` 是对话首页，`/#/canvas` 是画布子界面）

## 已完成（阶段1）
- **平台外壳（豆包/元宝式）**：左侧导航 + 顶栏 + 内容区；手机端导航自动变底部栏，桌面/手机一套响应式代码。
- **路由**：`/`（对话）、`/canvas`（画布）、`/agents`（智能体占位）、`/create`（创作占位）、`/profile`（我的/设置）。
- **画布原样保留为子界面**：旧画布逻辑零改动，收敛到 `/canvas` 路由。
- **Supabase 登录态**：密码登录 / 注册 / 魔法链接，会话本地持久化（用现有项目的 anon key）。
- **Agnes 默认对话**：顶栏可切换模型，Agnes 开箱即用、支持多轮上下文。
- **多模型预设**：国内 11 个 + 国外 5 个品牌（火山方舟/通义/文心/混元/DeepSeek/Kimi/智谱/MiniMax/阶跃/百川 + OpenAI/Claude/Gemini/Grok/Mistral），预设模板、填 key 即用。
- **设置页**：API key 录入，存 Supabase（`user_api_keys`，RLS 保护，前端永不接触明文）。

## 怎么用
1. 打开线上地址 → 默认进入「对话」，顶栏下拉可切模型（默认 Agnes）。
2. 点「登录」可用云同步与配置 key；不登录也能直接用 Agnes 对话。
3. 左侧「画布」进入原 AI 导演工作台（分镜/视频生成）。
4. 在「我的」里给非 Agnes 模型填 key（需先部署 model-proxy，见下）。

## 待部署后即可点亮非 Agnes 模型
- `supabase/functions/model-proxy/index.ts`（通用 OpenAI 兼容代理，读用户 key 转发）
- `supabase/migrations/0002_user_api_keys.sql`（建表 + RLS）
- 部署：`supabase functions deploy model-proxy --no-verify-jwt`；并在 `.env` 配 `VITE_MODEL_PROXY_BASE`。

## 阶段2/3 待做
- 部署 model-proxy + 执行 SQL → 非 Agnes 模型真正可用。
- 智能体广场、创作工具（生图/生视频/文档/PPT）实质功能。
- 桌面端（Electron/Tauri）与手机端（Capacitor/PWA）打包。

## 顺手修的旧 bug
- `DirectorChat.tsx` 漏 import `agnesChat`（运行时点导演面板发消息会崩）→ 已补。
- `chat.ts` 因 `as const` 字面量类型导致模型名传参报错 → 已放宽。

## 编译验证
- `npm run build` 通过（112 模块）；`tsc --noEmit` 仅余画布旧代码 latent 类型问题，不影响已验证路径。
