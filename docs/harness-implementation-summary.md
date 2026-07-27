# 短剧 Harness 重构实施总结（P0–P3）

> 对应设计文档：`docs/short-drama-harness-design.md`
> 目标：把「单 LLM 一把梭 + 前端硬串流水线」升级为对齐主流 AIGC 平台的三层架构（规划层 / 执行层 / 组装层）。
> P4（后端 Edge Function 编排）未做，待反馈。

## 已落地改动

### P2 模型路由表（零风险）
- 新增 `src/lib/modelRouter.ts`：`ROUTES` 集中管理 chat/image/video 模型名（全锁 Agnes 免费模型）。
- `agnes.ts` + `useGenerator.ts` 写死的 `'agnes-2.0-flash' / agnes-image-2.1-flash / agnes-video-v2.0` 全部改为从 `ROUTES` 读取。
- 收益：未来接付费模型 / Seedance 只需改 `ROUTES`，不动调用方。

### P3a 视频状态查询限流修复（🔴 线上 blocker）
- 根因：`agnesVideoStatus` 无 429 容错 + 视频轮询 8000ms 太密 → 撞 Agnes 免费档「状态查询限流」→ 视频生成中断（正是 render10 之前挂掉的根因，线上同样存在）。
- 修复：`agnesVideoStatus` 加 429 + 网络抖动退避重试（对齐 render10 加固版）；`useGenerator` 轮询间隔 8000ms → 22000ms。

### P1 规划层多 Agent 拆分（核心）
- 新增 `src/lib/plannerPrompts.ts`：A1 创意理解 / A2 剧本结构 / A3 分镜绘制（无台词） / A4 对话节奏控制，各自独立 system prompt。
- 新增 `src/lib/planner.ts`：`planStoryboard(brief)` 串行调 4 个 Agent，逐步解析 JSON、按 index 合并 A3 分镜 + A4 对话，输出 `DirectorStoryboard`（直接复用 `applyStoryboard`）。
- `DirectorChat.send()` 改为调 `planStoryboard`，并显示 A1–A4 进度气泡。
- **核心收益：对话密度控制（A4）成为独立可关的开关**，不再污染剧本/分镜 —— 之前「对话太密/太夸张」的结构性根因被消除。

### P3b 前端 Harness 断点续跑
- 新增 `src/lib/harness.ts`：`localStorage` 状态机 + `findStuckVariants`（检测关页面/网络中断残留的 processing 视频变体）。
- `produceAll` 加 `onStage` 回调落盘阶段进度（参考图→定格图→视频→完成）。
- `useGenerator` 新增 `resumeStuckVideos`；`DirectorChat` 在检测到未完成视频时显示「继续未完成视频」按钮。
- 等于把 render10 脚本的 RESUME 逻辑产品化进网站。

## 保留的修复（不因重构丢失）
`stableSeed` 跨镜锁一致性、`CHARACTER_LOCK`、`NEGATIVE_BASE`、电影对话原则（understated 语气）—— 全部保留，下沉为执行层 / 规划层 A4 默认约束。

## 验证
- `vite build` 通过（49 modules, 0 类型错误）。
- 已部署 GitHub Pages：`https://lwl555.github.io/ai-director-canvas/`（index-BV-05e1J.js）。

## 下一步（待你确认）
- **P4 后端编排**：把长任务迁到 Supabase Edge Function + Realtime 进度，彻底摆脱前端存活依赖，实现真「一句话成片」。工作量最大但体验质变。
- 或先基于线上新版实际生成一条片，验证 P1 多 Agent 规划 + P3 断点续跑体验，再决定 P4。
