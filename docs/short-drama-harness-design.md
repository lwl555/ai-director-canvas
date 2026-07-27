# 短剧 Harness 重构设计文档（ai-director-canvas）

> 目标：把当前"单 LLM 一把梭出 JSON + 前端硬串流水线"升级为对齐主流 AIGC 平台的
> **三层架构**（规划层 / 执行层 / 组装层），实现接近"一句话成片"的体验。
> 本文档是方案设计，供评审；落地分 Phase 实施，不一次性大改。

---

## 0. 背景：为什么现在要重构

用户原话印证：之前视频"对话太夸张、人物不统一"不是模型问题，是 **工作流问题**。
对照我们现状：

| 三层 | 现状 | 问题 |
|---|---|---|
| 规划层（LLM 大脑） | `directorPrompt.ts` 单系统提示词一次出完整 storyboard JSON | 剧本/角色/分镜耦合在一处，无法针对"对话克制"单独调优；曾因台词密度规则把对话写密 |
| 执行层（模型手脚） | `agnes.ts` 直连 image/video 模型 | 模型本身 OK（原生口型、图生视频正常） |
| 组装层（Harness 编排） | `useGenerator.ts` 前端 `produceAll` 硬串 + 手写视频限流串链 | **最大短板**：无断点续跑框架、长进程被环境回收靠人工 RESUME、无模型自动路由、无多 Agent 分工 |

结论：**执行层不用动，重点补"规划层拆 Agent"和"组装层做真编排框架"**。

---

## 1. 目标架构（三层）

```
┌─────────────────────────────────────────────────────────────┐
│  用户输入："一句话需求"  (e.g. "雨夜末班车，两个陌生人相遇")   │
└───────────────────────────────┬─────────────────────────────┘
                                 │
        ┌────────────────────────▼────────────────────────┐
        │  规划层 PlanningLayer（多 Agent 协作，LLM 大脑）   │
        │  Agent-1 创意理解 → Agent-2 剧本结构 → Agent-3 分镜 │
        │  → Agent-4 镜头节奏/对话密度控制                    │
        └────────────────────────┬────────────────────────┘
                                 │ storyboard (结构化)
        ┌────────────────────────▼────────────────────────┐
        │  执行层 ExecutionLayer（模型手脚，带自动路由）      │
        │  图像 Agent: agnes-image-2.1-flash（角色/场景/道具）│
        │  视频 Agent: agnes-video-v2.0（文/图/关键帧+口型）  │
        │  路由: 按任务难度/成本选模型（hardcode 表起步）      │
        └────────────────────────┬────────────────────────┘
                                 │ 素材 URL
        ┌────────────────────────▼────────────────────────┐
        │  组装层 Harness（编排框架，流水线）                 │
        │  - 步骤 DAG + 断点续跑（每步落盘 state）            │
        │  - 全局视频限流串链（已有，保留）                   │
        │  - 失败重试 / 人工 RESUME UI                        │
        │  - 产出：分段 mp4 + 播放页（无 ffmpeg 也能交付）    │
        └────────────────────────┬────────────────────────┘
                                 │
                      最终视频（一句话成片）
```

---

## 2. 规划层：从"单提示词"到"多 Agent 流水线"

### 2.1 当前
`directorPrompt.ts` 一个 `DIRECTOR_SYSTEM_PROMPT` 一次产出含 characters/references/shots 的大 JSON。

### 2.2 目标：4 个专职 Agent，串行 + 交接上下文
每个 Agent 只做一件事，prompt 可独立迭代（避免"对话密度"规则污染整个剧本）。

| Agent | 输入 | 输出 | 关键约束（独立可调） |
|---|---|---|---|
| **A1 创意理解** | 用户一句话 | `{theme, tone, durationSec, style, audience}` | 提炼核心情绪，不展开细节 |
| **A2 剧本结构** | A1 输出 | `{characters[], emotionArc, logline}` | 角色 ≥100 词英文外貌（中性表情铁律） |
| **A3 分镜绘制** | A1+A2 | `shots[]`（无台词） | 六步公式 + 动作链 + 负面屏蔽 |
| **A4 对话/节奏控制** | A3 + 用户偏好 | `shots[].dialogue`（稀疏注入） | **电影对话原则单独在此生效**：每10-15秒一句、单句≤10字、understated |

> 关键收益：之前"对话太密"根因是规则写在总 prompt 里；拆出 A4 后，对话密度是一条**独立可关的开关**，不影响剧本/分镜质量。

### 2.3 实现位置
- 新增 `src/lib/planner.ts`：导出 `planStoryboard(brief)` 串行调 4 个 `agnesChat`，每步 `parseStoryboard` 校验。
- `directorPrompt.ts` 拆成 `plannerPrompts.ts`（A1–A4 各自的 system prompt）。
- 前端 `DirectorChat.tsx` 调用 `planStoryboard` 替代原来的单次 `agnesChat`。

---

## 3. 执行层：模型自动路由（起步版）

### 3.1 当前
`agnes.ts` 写死 `agnes-image-2.1-flash` / `agnes-video-v2.0`。

### 3.2 目标：路由表（后续可换 Seedance 等）
```ts
// src/lib/modelRouter.ts
export const ROUTES = {
  characterSheet: 'agnes-image-2.1-flash',
  scene:         'agnes-image-2.1-flash',
  shotFrame:     'agnes-image-2.1-flash',
  videoT2V:      'agnes-video-v2.0',
  videoI2V:      'agnes-video-v2.0',
  videoKeyframes:'agnes-video-v2.0',
}
// 路由策略：免费档全走 Agnes；若未来接入付费/其他模型，按 cost+质量打分选
```
- 路由逻辑集中，方便未来"模型自动路由"升级（难度→模型映射表）。
- `agnes.ts` 各函数改为从 `ROUTES` 取模型名，不直接 hardcode。

---

## 4. 组装层：真·Harness 编排框架（核心改造）

### 4.1 当前痛点
`produceAll` 在浏览器里串：参考图→定格图→视频。问题：
1. 长任务跑在**前端 JS 线程**，标签页关掉/环境回收即丢进度。
2. 无步骤级断点，只能整段重跑（虽 render10 脚本加了 RESUME，但是临时方案）。
3. 进度不可观测、不可人工续跑。

### 4.2 目标架构：编排器 + 持久化状态机
把"编排"从前端移到**Supabase Edge Function**（或独立 Node 服务），前端只订阅进度。

```
src/lib/harness.ts          # 前端编排客户端：提交 brief、轮询/订阅任务状态
supabase/functions/harness/ # 后端编排器（Deno）：跑 A1-A4 + 执行层 + 落盘
  - 状态存 Supabase 表 harness_runs (id, brief, stage, progress, result_json)
  - 每步完成写回 DB → 天然断点续跑
  - 视频限流串链复用现有 VIDEO_MIN_GAP_MS 逻辑
```

**Phase 1（最小可用，不动后端）**：
- 前端 `harness.ts` 把 `produceAll` 重构成**显式步骤 DAG**：
  `[genRefs, genShotFrames, genVideos, assemble]`
- 每步前读 `localStorage` 的 `harness_state`，跳过已完成节点。
- 步骤失败可"从当前步重试"，不用从头。
- 这等于把 render10 的 RESUME 逻辑**产品化**进网站，用户关页面再开能续。

**Phase 2（真后端编排）**：
- 编排器迁 Supabase Edge Function，长任务不再依赖前端存活。
- 前端 `harness.ts` 用 Supabase Realtime 订阅 `harness_runs` 表，实时进度条。
- 彻底解决"环境回收丢进度"。

### 4.3 交付物（无 ffmpeg 约束）
保留 render10 验证过的方案：分段 mp4 + `index.html` 顺序播放页。
Harness 最后一步 `assemble` 生成该播放页（并可未来接 ffmpeg 合成单文件）。

---

## 5. 实施 Phase 规划

| Phase | 内容 | 风险 | 产出 |
|---|---|---|---|
| **P0 收尾** | render10 验证片跑完，确认对话/统一修复 | 低 | 成片 + 播放页 |
| **P1 规划层拆分** | `planner.ts` + `plannerPrompts.ts`，A1-A4 Agent；前端接 `planStoryboard` | 中 | 对话密度独立可调，剧本/分镜解耦 |
| **P2 路由表** | `modelRouter.ts`，`agnes.ts` 改为读路由 | 低 | 模型可配置 |
| **P3 前端 Harness** | `harness.ts` 步骤 DAG + localStorage 断点续跑 + 重试 UI | 中 | 关页面可续跑 |
| **P4 后端编排** | Supabase Edge Function `harness` + Realtime 进度 | 高 | 长任务不丢、真"一句话成片" |

P0–P3 可在现有前端架构内完成，不需新增后端；P4 是体验质变但工作量最大。

---

## 6. 与现有修复的关系

- `stableSeed`（跨镜锁一致性）、`CHARACTER_LOCK`、`NEGATIVE_BASE`、电影对话原则 —— **全部保留**，下沉为执行层/规划层 A4 的默认约束，不因重构丢失。
- `agnes.ts` 限流串链 —— 保留并迁入 Harness。
- 用户已部署的线上 `index-CouRmCkG.js` 不受影响，P1-P3 是增量改动。

---

## 7. 待用户确认的点

1. **P4 是否现在就要**？后端编排是体验质变但工作量大；还是先 P0-P3 把前端做扎实？
2. **多 Agent 是否要并发展示**？A1-A4 串行更省 token、更易调试；若要"看得见的 AI 协作"可做成流式逐步显示（成本更高）。
3. **模型路由**：现阶段是否只锁 Agnes 免费模型（零成本），还是预留付费/Seedance 接口？

> 建议：先 P0 收尾看片 → P1+P2 快速落地（对话解耦+路由表，1-2 天）→ P3 前端断点续跑 → P4 视反馈再决定。
