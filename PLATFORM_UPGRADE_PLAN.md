# AI 助手平台升级计划（结合豆包 / 元宝 + 保留画布子界面）

> 制定日期：2026-07-26 ｜ 制定者：Code Reviewer Agent
> 目标：把现有 `ai-director-canvas` 画布降级为子界面，外层套一个豆包/元宝式的 AI 助手平台；支持国内+国外多模型接入（预设模板、填 key 即用）；默认模型 Agnes 不变。

---

## 一、已确认的核心决策（用户拍板）

| 决策项 | 结论 |
|--------|------|
| 默认对话模型 | **Agnes**（平台对话默认用它；多模型接入后顶部可切换） |
| 账号与数据 | **无登录 · 匿名设备ID 云同步**（首次访问本地生成 UUID 作 deviceId，对话/智能体/key 经 `sync-proxy` 按 deviceId 隔离同步到 Supabase；未部署代理时自动降级为本机 localStorage） |
| 交付形态 | **网页版 + 独立电脑软件 + 独立手机软件**（三端共用一套响应式前端代码，仅打包不同） |

> ⚠️ 三端=一套代码三种打包，不是三套。手机/桌面"看起来一样"靠响应式组件共享实现。

---

## 二、整体技术架构

### 前端（沿用并升级现有栈）
- **React 18 + Vite 5 + TypeScript**（现有画布已用），新增 **React Router** 做多视图路由。
- **响应式布局**：桌面=左侧会话栏 + 中间对话区 + 右侧工具；移动=底部 Tab（对话/智能体/创作/我的）。
- **状态管理**：React Context（`ModelProvider` / `AuthProvider` / `ThemeProvider`，轻量、零额外依赖——实际落地已用 Context，非计划原稿写的 Zustand）。
- **画布子界面**：把现有画布 React 代码作为 `/canvas` 路由**直接代码集成**（非 iframe），共享登录态与 Supabase 客户端。保留全部现有逻辑（storyboard → 生成 → 渲染、keyframes 链式、Agnes 代理）。

### 后端（Supabase，沿用现有项目 `wcnssyiqitugqfmcbdhe`）
- **Edge Functions**：
  - 现有 `agnes-proxy`（保留，画布与默认对话用）。
  - 新增 **`model-proxy`**：通用 OpenAI 兼容代理。请求带 `provider` 字段 → 函数从 `user_api_keys` 读取该用户对应 key，按预设模板改写 baseURL / 鉴权头 / 请求体，转发并回传（实际落地命名，非计划原稿的 chat-proxy）。
- **Postgres 表**：`profiles`、`conversations`、`messages`、`provider_keys`（加密列，绑 user_id）、`agents`、`user_settings`。
- **Auth**：Supabase Auth（邮箱 / 手机号 / 第三方 OAuth）。

### 部署
- 网页：GitHub Pages（base 调整）。
- 桌面：Electron 或 Tauri 封装同一套 Web。
- 移动：Capacitor 打包 iOS/Android，或先用 **PWA**（"添加到主屏幕"获得类原生体验，免上架）。

---

## 三、功能模块（豆包 + 元宝元素提炼 → 落地）

| 模块 | 结合来源 | 落地内容 | 优先级 |
|------|----------|----------|--------|
| **对话（核心）** | 豆包对话 / 元宝聊天 | 流式输出、多轮上下文、输入栏（文字/语音 Web Speech/图片多模态/文件）、顶部模型切换、联网搜索（预留信源标注） | 🔴 MVP |
| **模型切换** | 元宝双模型（混元+DeepSeek） | 顶部下拉，列出已配置 key 的模型；默认 Agnes | 🔴 MVP |
| **画布子界面** | 现有 ai-director-canvas | 剧本→分镜→生成三阶段、keyframes 链式、Agnes 生图/生视频，原样保留为 `/canvas` | 🔴 MVP |
| **智能体** | 豆包智能体 / 元宝自定义 | 广场（预设几个）+ 用户自定义（名称/系统提示词/绑定模型/音色预留） | 🟡 阶段2 |
| **创作工具** | 豆包创作 / 元宝创作 | 生图、生视频（复用 Agnes/画布）、文档解析、PPT/音乐（预留） | 🟡 阶段2 |
| **历史会话** | 豆包对话列表 / 元宝 | 列表、置顶、重命名、删除、分享、云同步 | 🟡 阶段2 |
| **个人中心** | 豆包我的 / 元宝我的 | 设置、API key 管理、数据导出、会员（预留） | 🟡 阶段2 |
| **快应用（网页代码小应用）** | 元宝/豆包「AI 生成可运行网页」+ 小程序式收藏 | 对话里 AI 生成的 `html` 代码可**直接运行/复制/全屏**；一键「存为快应用」进独立功能区；小应用可改名、改图标（上传图自动压缩 64px）、删除、让 AI 实时改进、复制代码；数据经 `sync.ts` 云同步 | 🟡 阶段2 |
| **划词/浮窗** | 豆包电脑版跨应用 | 桌面端增强（阶段3，Electron 专属能力） | 💭 阶段3 |

---

## 四、多模型接入方案（预设模板）

每个供应商一个**预设模板**对象，前端展示、后端按模板转发：

```ts
type ProviderTemplate = {
  id: string
  name: string            // 展示名：豆包 / 通义 / 文心 / DeepSeek ...
  baseURL: string         // 官方 API 基地址
  authHeader: 'Bearer' | 'custom'  // 鉴权头格式
  authFormat?: (key:string)=>string // 如百度需拼接
  models: { id: string, label: string, multimodal?: boolean }[]
  stream: boolean         // 是否支持流式
}
```

**预设供应商清单（首次即内置，用户只填 key）**

- 国内：火山方舟(豆包)、阿里通义千问、百度文心一言、腾讯混元、DeepSeek、Kimi(Moonshot)、智谱 GLM、MiniMax、阶跃星辰、百川
- 国外：OpenAI(GPT)、Anthropic(Claude)、Google(Gemini)、xAI(Grok)、Mistral

**key 存储**：用户填的 key 经前端提交 → Edge Function 写入 Supabase `provider_keys`（加密列，绑 user_id）。对话时 `chat-proxy` 按 provider 读取对应用户 key 转发，**key 永不暴露给浏览器**。默认 Agnes 走现有 `agnes-proxy`。

---

## 五、分阶段实施路线

### 🔴 阶段 1 — MVP（网页版核心，先跑通上线）

> ✅ **已交付（2026-07-26 部署上线；2026-07-27 移除登录）**：外壳（侧栏+顶栏+响应式）、Agnes 默认对话（多轮+模型切换）、画布 `/canvas` 子界面原样集成、多模型预设（国内11+国外5）、设置页 key 录入（本机 localStorage）、浅色默认+深色切换、默认对话人设「灵境·全能温柔型」、聊天历史本机持久化、智能体广场（本机预设 6 个）、创作工坊生图。**登录功能已移除**：平台改为无需登录、本机直连模式；`model-proxy` 与 `0002_user_api_keys.sql` 代码保留但前端不再调用。**线上**：https://lwl555.github.io/ai-director-canvas/

1. 脚手架：Vite + React + Router + React Context + Supabase JS 客户端。
2. 外壳布局：桌面侧栏 + 移动底部 Tab 响应式框架。
3. Supabase Auth：登录/注册页 + 会话持久化。
4. 对话核心：多轮对话、顶部模型切换（默认 Agnes）、输入栏（文/图/文件待补）。
5. 画布子界面集成：`/canvas` 路由复用现有画布 React 代码 + `agnes-proxy`。
6. API key 设置页 + `model-proxy` 基础版（Agnes + 预设供应商模板，待部署代理后点亮）。
7. GitHub Pages 部署，自测注册→对话→画布全流程。

### 🟡 阶段 2 — 创作 + 智能体 + 历史 + 云同步（详细可执行）

> 目标：把 MVP 的「空壳页（智能体/创作/我的）」升级为有真实功能的平台。
> ✅ **无登录云同步已落地（2026-07-27）**：登录移除后，改用「匿名设备ID（本地 UUID）」作主键，对话线程/当前智能体/API Key 经 `sync-proxy` 按 deviceId 隔离同步到 Supabase `device_sync` 表；`sync-proxy` 未部署时自动降级为本机 localStorage（不报错）。IP 仅用于展示，不参与身份判定（IP 会变/会串号，不宜做主键）。
> 推荐顺序：2.1 代理与供应商补全（可选，若想恢复「key 不落浏览器」再走服务端）→ 2.2 历史会话云同步（已完成）→ 2.3 创作工具（基础版已完成）→ 2.4 智能体（基础版已完成）→ 2.5 设置/导出。

#### 2.1 通用代理部署 + 供应商模板补全（前提）
- **任务**：部署 `supabase/functions/model-proxy` + 执行 `supabase/migrations/0002_user_api_keys.sql`；在 `modelRegistry.ts` 里把 16 家供应商的 `baseURL / authHeader / authFormat / 是否流式` 补全，并逐家实测。
- **数据/接口**：
  - `user_api_keys(user_id, provider, api_key_encrypted, updated_at)`，RLS：仅本人读写；`model-proxy` 用 `service_role` 解密读取。
  - `model-proxy` 入参 `{ provider, model, messages, stream? }`，出参 OpenAI 兼容；逐家处理鉴权头差异（如文心需拼接 `access_token`、Gemini/Claude 需适配器）。
- **验收**：在设置页填入任一国内/国外 key 后，默认对话能切到该模型并正常多轮回复；失败有清晰错误提示（非 401 裸错）。
- **风险**：各厂流式格式不同（SSE/NDJSON），先支持非流式跑通，流式作为增强。

#### 2.2 历史会话 + 跨端云同步
- **任务**：对话不再只存在内存，写入 Supabase，登录用户多端同步。
- **✅ 已实现（无登录版，2026-07-27 增强）**：聊天页「历史」抽屉按 `model:agent` 分线程，可搜索、可删除、**可重命名对话**（✎ 改名，加 `customTitle` 标志位防止被首条消息覆盖）；列表显示品牌·智能体·相对时间·内容预览；切换模型自动复用对应线程。线程经 `sync.ts` + `sync-proxy` 按 `deviceId` 云同步。
- **数据模型**：
  - `conversations(id, user_id, title, model_id, created_at, updated_at, pinned)`
  - `messages(id, conversation_id, role, content, created_at, tokens?)`
  - RLS：仅本人访问；建索引 `(user_id, updated_at DESC)`。
- **前端**：
  - 侧栏（桌面）/ 对话页顶部（移动）增加「历史会话」列表：新建、置顶、重命名、删除、搜索。
  - 每次 `sendChat` 后本地乐观更新 + 防抖落库；未登录用户退化为 `localStorage` 草稿（登录后可一键合并到云）。
- **验收**：A 设备发 3 条 → B 设备（同账号）刷新能看到完整上下文并继续聊；删除/重命名实时同步。

#### 2.3 创作工具
- **生图/生视频**：复用画布已有的 Agnes 能力（`agnesImage` / `agnesVideo`），在「创作工坊」提供轻量入口（输入提示词→出图/出视频→保存到「我的作品」），不重复造轮子。
- **文档解析**：接多模型（上传 PDF/Word/图片 → 提取文本/总结/问答），后端走 `model-proxy` 或专用解析函数。
- **PPT / 音乐**：阶段2 仅预留入口与数据结构（`works(id, user_id, type, payload)`），实质生成后续迭代。
- **验收**：创作页能出一张图并展示；文档解析能返回总结。

#### 2.4 智能体广场
- **任务**：预设几个官方智能体（如「剧本医生」「短视频策划」「代码助手」「暖心树洞」），并支持用户自定义。
- **数据模型**：`agents(id, user_id, name, avatar_emoji, system_prompt, bind_model, is_public, created_at)`，官方智能体 `user_id = null` 且 `is_public=true`。
- **前端**：广场网格（官方+我的）→ 点开即在对话页以该智能体的 system_prompt 起聊（复用 ChatPage，仅注入不同 persona）；「新建智能体」表单（名称/图标/提示词/绑定模型）。
- **验收**：创建一个「代码助手」智能体 → 对话全程保持代码专家口吻；官方智能体对所有登录用户可见。

#### 2.5 个人中心 / 设置 / 数据导出
- **设置页补完**：主题（浅/深，已做）、模型 key 管理（已做）、默认模型偏好持久化（`profiles.default_model_id`）。
- **数据导出**：提供「导出我的全部对话/智能体为 JSON」按钮（隐私合规）；账号注销预留。
- **验收**：切换默认模型后新建对话即用该模型；导出 JSON 含全部会话且可再导入。

> 阶段2 完成标准：空壳页全部有真实功能；对话/智能体/创作可云同步；非 Agnes 模型全可用。

#### 2.6 快应用功能区（AI 生成的网页代码可运行 + 收藏）
- **任务**：平台里 AI 生成的网页代码不再是"看完即丢"——可在对话内直接运行/复制/全屏，并能一键存为平台内的独立小应用，后续可改名字、改图标、删除、让 AI 实时改进、复制代码。
- **✅ 已实现（2026-07-27 部署）**：
  - 对话渲染：`MessageContent` 拆分文本与代码块；`html` 代码块经 `<iframe srcDoc>` 沙箱预览（`AppRunner`），带 **运行/复制/全屏/存为快应用** 浮条；非 html 代码块仅复制。
  - 快应用功能区（`/apps` 路由）：卡片网格列出所有小应用，支持 **运行（全屏）**、**改进（AI 改进弹窗，改进后原地更新代码）**、**复制代码**、**编辑（改名 + 改图标）**、**删除**；空态有引导。
  - 新建：描述 → `webAppGen.generateWebApp` 调 AI 出完整单文件 HTML → 预览 + 命名 + 选图标 → 存入。
  - 图标：emoji 选择 或 上传图经 canvas **自动压缩为 64px PNG data URL**（不存大图，保护 localStorage/云同步容量）。
  - 数据：`sync.ts` 新增 `QuickApp` 接口与 7 个 CRUD（`saveApp/deleteApp/renameApp/setAppIcon/updateAppCode/getApps/getApp`），纳入现有 `SyncPayload.apps`，**随对话/智能体一起云同步**。
- **关键文件**：`src/lib/webAppGen.ts`、`src/components/{AppRunner,CodeBlock,MessageContent,IconPicker,SaveAppModal,NewAppModal,AppEditModal}.tsx`、`src/pages/AppsPage.tsx`、`src/lib/sync.ts`（`QuickApp`）。
- **验收**：对话让 AI 写一个计时器 → 直接运行/全屏 → 存为应用 → 到「快应用」页可见、可改名/改图标/改进/删除；刷新后仍在（云同步）。

#### 2.7 无登录云保存（API Key 云同步）后端激活
- **前端链路已就绪**：`userKeys.ts → sync.ts → sync-proxy`（deviceId 隔离），`main.tsx` 启动 `sync.pull()`；ProfilePage 新增「云同步（无登录·设备识别）」状态指示（connected/undeployed/offline）+「立即同步」按钮。Key 保存即经 `persist→push` 尝试云同步。
- **待用户 2 步激活（沙箱无法部署 Supabase 函数/表，见 2026-07-27 记忆）**：
  1. Supabase SQL Editor 执行 `supabase/migrations/0003_device_sync.sql`（建 `device_sync` 表 + 关匿名直访）。
  2. Edge Functions 新建 `sync-proxy`，粘贴 `supabase/functions/sync-proxy/index.ts` 并 Deploy。
- 完成后：Key / 对话 / 快应用按设备自动云同步，**无需登录**。

#### 2.8 快应用 / 平台 打包为安卓 APK
- **新增**：`src/lib/androidTemplate.mjs`（Android 工程模板生成器，纯 JS 跨 Node/浏览器，含 quickapp 与 platform 两种模式）+ `src/lib/zipStore.mjs`（最小 store 模式 ZIP 写入器，零依赖）+ `src/lib/quickappApk.ts`（浏览器端下载）。
- **快应用**：AppsPage 每个卡片新增「📦 打包APK」→ 浏览器直接下载 `<名称>.android.zip`，内含完整 Android Studio 工程（全权限 + 通知权限 + WebView 加载 `app.html` + 图标）。
- **平台主程序**：`npm run build && npm run apk:platform` → 生成 `android-project/ai-director-canvas.android/`（WebView 加载 `dist/index.html`）。
- **工程能力**：AndroidManifest 申请全部常用权限（网络/定位/相机/麦克风/存储/通知/蓝牙/自启/安装…）+ `POST_NOTIFICATIONS` 运行时申请 + `NotificationChannel` + 启动时示例通知；WebView 开启 JS/DOM 存储/文件访问。
- **关键约束**：沙箱无 JDK/Android SDK，无法在此编译 `.apk`；生成的是**可构建工程**，用 Android Studio 打开后 Build → Build APK(s) 即得安装包。已用 Python `zipfile` 校验 zip 合法（17 文件、29 项权限声明、通知链路齐全）。
- **关键文件**：`src/lib/{androidTemplate,zipStore}.mjs`、`src/lib/quickappApk.ts`、`scripts/{gen-platform-apk,test-gen}.mjs`、`src/pages/AppsPage.tsx`、`src/pages/ProfilePage.tsx`。
> ✅ **阶段2 收尾已完成（2026-07-27）**：2.2 多轮对话列表（聊天页「历史」抽屉，按 model/agent 分线程、可切换/删除、云端同步）；2.5 数据导出/导入（设置页导出/导入 JSON 备份）。2.1 中 11 家 OpenAI 兼容模型可用；claude/gemini/minimax/ernie 仍标「适配中」（需服务端适配器或代理，待补）。

### 💭 阶段 3 — 多端打包

#### 📱 手机端 APP
- ✅ **PWA 可安装（已落地并增强，2026-07-27）**：`public/manifest.webmanifest`（含 192/512 PNG 图标 + maskable + `shortcuts` + `categories`/`orientation`）、`public/sw.js`（壳缓存 + **导航离线回退到 index.html**，深链/冷启动可开）、`index.html` 补全 iOS/Android 元信息（`apple-touch-icon` PNG、`apple-mobile-web-app-capable`、`status-bar-style=black-translucent`、`viewport-fit=cover`）、`InstallPrompt.tsx` 安装横幅、`main.tsx` 注册 SW。**这是当前「独立手机软件」的可交付形态**：安卓 Chrome / iOS Safari「添加到主屏幕」即用，免上架。
- ✅ **正式图标（2026-07-27 生成）**：`public/icons/` 下 `icon-192.png`/`icon-512.png`/`maskable-192.png`/`maskable-512.png`/`apple-touch-icon.png`，由 `scripts/gen_icons.py`（Pillow，紫粉渐变 + 白色播放三角，复用 favicon 设计）生成；改图标只需改脚本重跑。
- 🟡 **原生 APP（Capacitor 脚手架已加，2026-07-27）**：`capacitor.config.ts`（`appId: com.lingjing.ai`、`webDir: dist`、`androidScheme: https`）+ `package.json` 的 `cap:build`/`cap:add:android`/`cap:add:ios`/`cap:sync` 脚本与 `@capacitor/*` devDeps + `vite.config.ts` 支持 `CAPACITOR=1` 时 `base` 变 `/`（原生 webview 用根路径，区别于 Pages 子目录）。**沙箱无法下载 Capacitor CLI / 原生 SDK，原生二进制需用户本机生成**（见下方步骤）。

  **▶ 用户本机出原生 APP 步骤（配置已就绪，照做即可）**：
  1. 安装依赖：`npm install`（拉取 `@capacitor/cli` 等）。
  2. 加平台：`npm run cap:add:android`（需本机 Android Studio）或 `npm run cap:add:ios`（需 macOS + Xcode）。
  3. 构建并同步：`npm run cap:sync` → 先把前端以 `CAPACITOR=1` 构建到 `dist/`，再同步进 `android/`/`ios/` 工程。
  4. 打开工程运行/打包：Android Studio 开 `android/` 跑模拟器或打 APK/AAB；Xcode 开 `ios/` 跑真机或归档上架。
  5. 原生能力（推送/相册等）后续按需加 `@capacitor/*` 插件。

#### 🖥️ 桌面端（用户 2026-07-27 决定：**暂不搞**，以下步骤留待后续）
- 🟡 **Electron 脚手架已加（配置交付）**：`electron/main.cjs`（加载线上站点）+ `electron/electron-builder.yml` + `package.json` 的 `electron:start` / `dist:electron` 脚本与 devDeps。本沙箱无法下载 Electron 二进制，需用户本机构建。
- **▶ 后续执行步骤（恢复桌面端时照做）**：
  1. 本机进入项目目录，安装依赖：`npm install`（会拉取 electron / electron-builder）。
  2. 开发预览：`npm run electron:start`（启动 Electron 加载线上站点）。
  3. 打包分发：`npm run dist:electron` → 产物在 `dist-electron/`（含 NSIS/AppImage/dmg，依 `electron-builder.yml` 的 `appId/productName`）。
  4. 如需离线壳（不依赖线上站点）：把 `electron/main.cjs` 改为 `win.loadFile('dist/index.html')` 并在 `electron-builder.yml` 的 `files` 加入 `dist/**`，同时先 `npm run build` 出静态包。
  5. 签名 / 自动更新等上架细节后续迭代（当前未做）。
- **桌面专属增强（仍待做）**：划词 / 跨应用浮窗（Electron 专属能力），恢复桌面端时一并做。

#### 阶段 3 完成标准
- [x] 手机端 PWA 可安装 + 离线可开（已达成）
- [x] 手机端原生脚手架就绪（Capacitor，待本机构建）
- [ ] 桌面端 Electron 本机构建出包（用户决定暂不搞，步骤已记录）

---

## 六、现有资产复用（不重写）

- **前端画布**：`ai-director-canvas` 现有 React 画布 UI → 作为 `/canvas` 子路由。
- **生成脚本**：`render14.mjs` / `frameutil.py` / `storyboard_v1.json` → 画布后端逻辑保留。
- **Supabase**：现有项目 `wcnssyiqitugqfmcbdhe` 的 `agnes-proxy` + anon key 直接复用。
- **剧本/分镜资产**：`screenplay_v2.md`、render11 定格图等继续作为画布素材。

---

## 六·五、原生 Android App（桌面工程 + 远程自更新 + 通知）

用户要求「APP 打包成原生 APK，适配所有安卓权限，站点更新后 App 自动变化，支持通知栏+后台通知」。

**方案（2026-07-27 已实现）：**
- 工程生成器：`src/lib/androidRemote.mjs`（模板）+ `scripts/gen-desktop-apk.mjs`（写出到 `C:/Users/sxiao/Desktop/ai-director-canvas-android/`，21 文件）。
- WebView **远程加载线上站点** `https://lwl555.github.io/ai-director-canvas/` → 站点一部署 App 自动是新版，**无需重装 App**。
- 全权限 Manifest（网络/定位/相机/麦克风/存储/通知/蓝牙/自启/安装…）+ `FOREGROUND_SERVICE_DATA_SYNC`。
- 通知三件套：
  1. `KeepAliveService` 前台常驻服务（通知栏常显 + 后台保活）；
  2. JS 桥 `window.AndroidApp.notify(title,body)`（网页可触发原生通知，ChatPage 在 AI 回复完成时调用）；
  3. `WorkManager` 每 15 分钟拉 `version.json`，站点更新弹「平台已更新」后台通知；`BootReceiver` 开机重启保活+重排检查。
- **构建**：沙箱无 Android SDK，无法在此出 `.apk`；用户用 Android Studio 打开桌面工程 → Build → Build APK(s)。
- **版本探测**：`public/version.json`（占位）+ `deploy_ghpages.py` 每次部署注入时间戳；并写入 `dist/.nojekyll` 关闭 Jekyll 以保证 `version.json` 等静态资源原样服务（GitHub Pages 默认 Jekyll 会吞 `.json`，实测需等整站重建 ~4 分钟才生效）。

**自定义智能体（2026-07-27 已实现）：**
- `AgentsPage` 新增「默认助手（关闭智能体）」卡片 → 修复"选了智能体后无法关闭"的 bug；当前智能体顶部显示并可 × 退出。
- 支持创建/编辑/删除自定义智能体（名称/emoji/简介/系统提示词），存 `sync.ts` 的 `customAgents`（随云同步），与预设并列展示。

## 七、风险与待确认

1. **手机原生 App 上架**需 Apple/Google 开发者账号与签名；建议阶段3先用 **PWA** 满足"独立手机软件"体验，真上架后续再做。
2. **各供应商 API 格式差异大**（鉴权头、流式格式、多模态字段），`chat-proxy` 需逐家适配——首次先接 3~4 家验证模式，再批量补全。
3. **画布集成方式**：建议**代码复用**（共享登录态）而非 iframe（隔离登录/状态）。若现有画布代码耦合严重，可退化为 iframe 嵌入已部署的 Pages 版本，但会牺牲同步登录。
4. **Agnes 作为"对话默认模型"**：Agnes 当前定位是生图/生视频模型，其对话能力需实测；若对话体验弱，建议默认切到 DeepSeek/混元之类，Agnes 仅留作画布创作模型（此点待阶段1实测后定）。

---

## 八、下一步

1. 你确认本计划（尤其阶段1范围与"代码集成画布"方式）。
2. 我搭阶段1脚手架（Vite+React+Router+Supabase），先把外壳 + 登录 + Agnes 对话 + 画布子界面跑通并部署到 GitHub Pages。
3. 阶段1自测通过后，再推进阶段2/3。

> 备注：本次升级不改动现有画布的任何已验证功能，仅将其"包裹"进新平台外壳并新增对话/模型层。
