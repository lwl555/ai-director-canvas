# 画布导演功能 & 视频生成逻辑审查报告

> 审查范围：导演规划（`directorPrompt.ts` / `DirectorChat.tsx` / `store.tsx`）、视频生成（`useGenerator.ts` / `agnes.ts` / `Inspector.tsx` / `Timeline.tsx`）
> 对标参照：即梦 Seedance 2.0 / Octo 公开运行机制（网络检索）

---

## 一、整体结论

**架构方向正确，核心链路已通，但有 1 个 Blocker 会直接摧毁角色统一性。**

数据流：用户简报 → 导演 LLM 输出结构化故事板 JSON → `applyStoryboard` 铺成「参考图节点 + 分镜视频节点」→ 自动生成参考图 → 用户点「生成全部视频」→ 每个分镜以首帧参考图做 I2V 生成。

对比即梦：即梦核心玩法是「多模态参考 + 首尾帧控制 + 分镜直出视频 + 跨镜头角色统一」。本项目的 I2V 首帧锚定思路与即梦一致，但**首帧能否真正落到视频生成里，被一个映射 bug 卡住了**。

---

## 二、对标即梦的运行机制（检索结论）

| 即梦/业界做法 | 本项目现状 | 差异 |
|---|---|---|
| 最多 12 个参考文件，按权重锁风格/角色 | 参考图节点（无权重概念） | 缺「主参考权重」 |
| **首帧/尾帧控制**（I2V 锚定长相） | 支持 `firstFrameUrl/lastFrameUrl` 透传 | 机制有，但首帧常丢失（见 Blocker） |
| 定妆照要求**高清正脸、光影自然** | 提示词未约束构图 | 一致性上限受限 |
| 跨镜头角色 ID 锚定（参考图像素作扩散起点） | 单图首帧 + prompt 重复外貌 | 方向对，单图锚定有漂移局限 |
| 切镜（同一 prompt 多镜头，根因解决） | 无 | 每个分镜独立生成 |
| 对口型（音频驱动表情） | `audioHint` 仅文本提示 | 无真正 lip-sync |
| 时间轴裁剪 + 导出 XML/Premiere | 时间轴仅陈列，无拼接/导出 | 缺合成能力 |
| 同镜多版本并行筛选 | 可重生成，无并行多版本 | 缺 |

**角色一致性的本质**（检索共识）：每个镜头独立生成、无记忆 → 必须靠「参考图锚定（I2V 首帧）+ 详细 prompt 重复外貌 + 固定 seed」。本项目抓住了这个本质，但执行有断点。

---

## 三、导演功能逻辑

### ✅ 做得好的地方
- 强制结构化 JSON 输出 + 容错解析（`parseStoryboard` 去围栏/截取首尾括号），健壮。
- 强制 `references` 覆盖每个角色定妆图 + ≥2 场景图 + 重要道具。
- 分镜数 `ceil(duration/10)`、单镜 ≤16s、相邻镜尾帧=首帧衔接规则 —— 叙事结构合理。
- `promptEn ≥80 词` 并要求重复完整外貌 —— 正是对抗角色漂移的标准手法。

### 🔴 Blocker：角色名 → 参考图映射失败（`store.tsx:124-127`）

```ts
// 当前代码
;(board.characters || []).forEach((c) => {
  const hit = nodes.find((n) => n.refType === 'character' && n.refLabel?.includes(c.name))
  if (hit) labelToId.set(c.name.toLowerCase(), hit.id)
})
```

**问题**：`refLabel` 是参考图的 label（如导演可能输出 `"主角正面"`、`"主角全身"`），而 `c.name` 是角色名（如 `"小明"`）。`"主角正面".includes("小明")` 几乎永远为 `false`。

导演提示词规则 4 明确允许 `firstFrameRef` 填「参考图 label **或角色名**」。若模型选了填**角色名**，`matchRef(s.firstFrameRef)`（`store.tsx:135-140`）返回 `undefined`，于是：

```
video 节点 firstFrameNodeId = undefined → generateVideo 里 ff = undefined → firstFrameUrl = undefined
→ 视频退化为纯文生视频(T2V) → 首帧锚定丢失 → 角色长相随种子乱漂
```

**为什么严重**：这正是角色统一性的命门。用户以为用了首帧参考图，实际没用上。

**修复（两层）**：
1. 短期（提示词 + 解析协同）：提示词改为「`firstFrameRef/lastFrameRef` **只能填 `references` 数组里的 `label`**，禁止用角色名」；解析端把角色名兜底匹配改为更宽松（大小写归一 + 双向包含）。
2. 长期（结构增强）：给 `references` 项加 `characterName?` 字段，导演显式关联角色与定妆图。映射改为 `labelToId.set(r.characterName.toLowerCase(), id)`。

### 🟡 提示词未约束定妆图构图（`directorPrompt.ts:17`）
参考图 prompt 只说「用于生成该参考图的英文提示词」，未要求**正脸、清晰、高分辨率、自然光**。业界共识（aividpipeline / fluxnote）定妆照质量直接决定 I2V 一致性。建议加规则：角色定妆图 prompt 必须含 `front-facing, full body or headshot, sharp focus, high resolution, neutral lighting, plain background`。

### 💭 Nit：规则 4「或角色名」与解析不一致
既然解析端角色名匹配不可靠，提示词就别给模型这个选项，避免歧义（与 Blocker 修复 1 同源）。

---

## 四、视频生成逻辑

### ✅ 做得好的地方
- 首帧/尾帧真正透传（`agnes.ts:146-148`），修复了原 ai-tools 代理丢弃 `image/last_frame` 的 bug。
- 视频状态轮询 + 完成/失败判定 + 超时保护（`useGenerator.ts:48-57`）完整。
- `generateAllVideos` 每批 3 个并行（`useGenerator.ts:70-73`），避免雪崩。

### 🟡 首帧未生成时静默降级（`useGenerator.ts:33-46`）
`ff = project.nodes.find(n => n.id === firstFrameNodeId)`，若参考图节点 `imageUrl` 为空（未生成/生成失败），`firstFrameUrl` 为 `undefined`，**视频照常生成但退化成 T2V，且无任何提示**。用户以为用了首帧，实际没有。

**建议**：生成前校验 `ff?.imageUrl` 存在；不存在则 `status='failed'` 并 `error='首帧参考图未生成，请先生成参考图'` 或自动跳过首帧但明确标注。

### 🟡 超时 6 分钟 + 失败需手动重试（`useGenerator.ts:48-57`）
长视频（Agnes 生成耗时不透明）可能 >6 分钟。超时后 `status='failed'`，用户需回节点手动重试，无自动续轮询。

**建议**：超时阈值按 `numFrames` 动态估算；或失败节点保留 `video_id`，提供「继续查询」而非从头创建。

### 💭 Nit：多版本并行未实现
即梦可「同镜多版本一起出」筛选。本项目 `generateVideo` 是单次单版本。可加 `generateVariants(node, n)` 用不同 seed 并发。

---

## 五、角色统一性专项（重点）

**当前机制**（方向正确）：I2V 首帧（reference 节点 imageUrl）+ promptEn 重复完整外貌 + 固定 seed。这就是业界标准做法。

**但存在 4 个断点**：

1. 🔴 **首帧映射 bug**（见 Blocker）—— 角色名引用时首帧直接消失。
2. 🟡 **定妆图构图无约束** —— 即梦要求正脸高清，本项目随意，一致性上限被压低。
3. 🟡 **单图锚定跨大角度/动作会漂移**（已知局限，aividpipeline 明确：单张参考图难生成差异大的机位/长动作）。多角色时指数级更难。
4. 🟡 **缺角色参考权重** —— 即梦有 reference 权重（cw 0~100），Runway 有 Character Profile。Agnes 是否支持未知，需确认其 `image` 参数是否真作 I2V 首帧、有无权重字段。

**验证建议（务必做）**：实拍一个角色，分别用首帧图 / 不用首帧图各生成一次，对比跨镜头长相是否一致，确认 Agnes `image` 参数确实生效且为 I2V 模式。

---

## 六、功能缺口（对标即梦，用户问"所有功能要不要调整"）

| 功能 | 现状 | 建议 |
|---|---|---|
| 视频拼接/导出 | 时间轴仅陈列卡片，不能合成导出 | 加「导出拼接视频」或至少导出分镜清单 JSON |
| 对口型/音频驱动 | `audioHint` 仅文本 | 若 Agnes 支持音频驱动，加音频上传 + lip-sync |
| 多版本并行筛选 | 无 | 加 `generateVariants` |
| 导出 XML/Premiere 工程 | 无 | 即梦可导出导入 PR/FCP，进阶可加 |
| 主参考权重 | 无 | 若 Agnes 支持，加 reference weight |
| 角色一致性报告 | 无 | 生成后自动对比首帧与视频首帧相似度（可选） |

---

## 七、修复优先级清单

🔴 **[必须修]** 角色名→参考图映射 bug（`store.tsx:124-127`）+ 提示词明确只填 label
🟡 **[应修]** 首帧未生成时视频生成前校验并提示（`useGenerator.ts:33-46`）
🟡 **[应修]** 定妆图构图规则加「正脸/高清/自然光」（`directorPrompt.ts:17`）
🟡 **[应修]** 实测验证 Agnes `image` 参数确为 I2V 首帧且生效后调权重
🟡 **[应修]** 视频超时阈值动态化 + 失败可续轮询
💭 **[可选]** 多版本并行、视频拼接导出、对口型、导出 XML

---

## 附：改动量评估
- Blocker 修复：改 `store.tsx` ~5 行 + `directorPrompt.ts` 提示词 1 处，约 15 分钟。
- 首帧校验：改 `useGenerator.ts` ~5 行。
- 其余为增强项，按需排期。
