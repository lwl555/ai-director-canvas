# render13c 验证报告

## 1. 执行概况

| 项目 | 内容 |
|------|------|
| 脚本 | `render13c.mjs` |
| 起跑时间 | 07:30:42 |
| 完成时间 | 07:45:55 |
| 生成视频 | 4 段，全部成功下载 |
| 抽帧 | 28 帧（4 段 × 7 帧） |
| 运行状态 | ✅ 零 FATAL，仅创建时因队列满触发正常重试 |

## 2. 视频文件

| 镜号 | 文件名 | 大小 | 内容 |
|------|--------|------|------|
| 1 | `vid_1_巷口候车.mp4` | 973 KB | 林晚独自在雨巷公交站等车 |
| 2 | `vid_2_并肩.mp4` | 1.06 MB | 陈默靠近，两人并肩站在站台下 |
| 3 | `vid_3_搭话.mp4` | 661 KB | 陈默开口，两人对话 |
| 4 | `vid_4_欲言又止.mp4` | 1.04 MB | 同撑一伞走入雨巷，欲言又止 |

## 3. 本次改动（相对 render13b）

### 3.1 强化负面词（NEGATIVE_BASE）
新增并加重了以下约束：

```text
no extra people, no additional person, no bystander, no third character, no crowd,
no identity change, no face change, no face swap, no different person,
no outfit change, no clothing change, no hairstyle change, no hair color change,
no laughing, no grin, no smiling, no open-mouth laugh, no exaggerated expression,
no creepy smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes,
no weird teeth, no deformed hands, no extra fingers, no extra limbs, no twisted limbs,
no sudden movement, no abrupt motion, no pose change, no jumping, no style drift,
no watermark, no text overlay, no logo, no jitter, no flicker,
low resolution, blurry, washed out, oversaturated.
```

### 3.2 运动强度压到近静态
- 整体描述为 `almost still; only rain falling diagonally, tiny fabric sway from wind, faint breath`。
- 明确禁止 `NO walking, NO new characters`。
- 说话镜头部动作仅 `mouth moving BARELY perceptibly`。

### 3.3 场景与人物锁定
- 继续使用 render11 验证过的 4 张分镜定格图作为首帧。
- 每段提示词反复强调 `the same two people only / no other people`。
- 身体参数固定：`height: 1024, width: 768, num_frames: 81, frame_rate: 24`。

## 4. 视觉核对结论

对 28 张抽帧进行逐镜抽查，重点观察 render13b 出现的三类失控：

| 检查项 | render13b 状态 | render13c 状态 | 说明 |
|--------|----------------|----------------|------|
| 陈默身份/服装漂移 | 尾段曾变成西装男 | ✅ 稳定保持深色外套 + 旧公文包 | 公文包与人物小传一致 |
| 林晚下半身变装 | 尾段曾变成短裙 | ✅ 全程卡其风衣长裙 | 服装一致 |
| 陈默突然大笑 | 尾段曾大笑、表情诡异 | ✅ 表情克制、无夸张笑容 | 微表情自然 |
| 额外路人闯入 | 曾出现第三人 | ✅ 主体仅两人 | 远景偶见极度模糊虚影，不影响主体 |
| 场景统一 | 多镜场景曾跑偏 | ✅ 雨夜公交站 + 霓虹巷统一 | 色调、雨效、灯光一致 |

## 5. 仍存在的轻微瑕疵

1. **远景虚化人影**：`vid_3` 对话段背景的雨街深处有非常模糊的轮廓，可能是模型对“人群”这个词残留的响应，但因距离和虚化，主体仍是两人，不构成明显穿帮。
2. **运动几乎为零**：为了压制漂移，牺牲了人物动态。雨滴和衣摆微动是主要运动，整体更像“带呼吸感的定格图”。若需要更明显的表演动作，需要分镜级控制或更可控的模型。
3. **字幕未叠加**：按你要求，视频未烧录字幕，原生对话保留，后期可手动加字幕。

## 6. 结论

**render13c 达到了目前工作流能实现的最好一致性。** 强负面词 + 近静态微运动 + render11 验证过的首帧，成功压住了 render13b 中的人物身份漂移、服装变化和表情失控问题。

下一步由你人工播放 4 段 mp4 做最终观感确认。如果还有具体哪一帧/哪一段不满意，把问题截图或描述给我，我可以针对该镜继续迭代（例如进一步加重对应负面词、调整首帧、或干脆让该镜更静态）。
