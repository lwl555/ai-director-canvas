# render13b 视频验证报告

## 测试目的
验证"剧本/提示词变细"对 Agnes Video V2.0 生成效果的影响。由于 Agnes 图片接口当前挂起，本次采用**绕路方案**：用 render11 已验证通过的分镜定格图作首帧（图片层一致性已 PASS），套用 `screenplay_v2.md` / `render13.mjs` 的详细 videoPrompt + 独立 `negative_prompt` + understated 口型，跑 4 段短视频。

## 测试配置
- 首帧：`render11_out/shot_1~4_*.jpg`（林晚米色风衣 + 陈默深色外套，雨夜巷口/末班车站）
- 模型：`agnes-video-v2.0`
- 每镜：81 帧 / 24fps = 3.38 秒
- negative_prompt：独立传入，含 `no outfit change, no hairstyle change, no hair color change` 等
- 口型：两句中文对白，林晚"也等末班车？"、陈默"算了，没事。"

## 整体结论

### ✅ 提示词变细的收益（确实有效）
- **首帧/中段表情更自然**：相比 render12，人物神态更内敛、电影感更强，假笑/恐怖谷明显减少。
- **双人同框稳定**：首帧和中段能稳定保持林晚+陈默同框、服装可识别。
- **口型有动作**：对话镜中人物嘴部确实在动，配合台词方向。

### ❌ 暴露的新问题（ Agnes 视频模型能力边界 ）
运动幅度变大或视频进入尾部时，模型对首帧/负面词的遵守会衰减：
1. **vid_1 巷口候车**：尾段陈默身份完全漂移，变成西装领带公文包的陌生人，且画面出现额外路人。
2. **vid_2 并肩**：尾段林晚下半身服装漂移为短裙+运动鞋。
3. **vid_3 搭话**：尾段陈默突然失控大笑，表情夸张，违背 `understated / no big smile`。
4. **vid_4 欲言又止**：整体最稳定，情绪克制，服装/身份保持得最好。

## 逐镜简评

| 镜号 | 标题 | 首帧 | 中段 | 尾段 | 主要问题 |
|---|---|---|---|---|---|
| 1 | 巷口候车 | ✅ 双人同框，表情克制 | ⚠️ 出现第三个人物 | ❌ 陈默变成西装男+公文包，身份丢失 | 身份漂移 + 额外人物 |
| 2 | 并肩 | ✅ 双人同框，车站场景好 | ✅ 表情自然，动作小 | ⚠️ 林晚下半身变短裙运动鞋 | 服装漂移 |
| 3 | 搭话 | ✅ 侧脸对视，电影感强 | ✅ 林晚转头说话自然 | ❌ 陈默突然大笑，表情失控 | 表情漂移 |
| 4 | 欲言又止 | ✅ 同撑一伞，情绪克制 | ✅ 陈默低头沉重 | ✅ 保持到尾 | 无明显问题 |

## 根因分析
1. **负面词不够强**：当前 `NEGATIVE_BASE` 缺少 `no extra people, no background characters, no identity change, no face morphing, no laughing, no big smile, no exaggerated facial expression, no suit and tie, no briefcase, no skirt, no bare legs, no sneakers` 等针对性约束。
2. **运动幅度仍偏大**：`slow dolly-in / horizontal pan` 等描述在免费档模型上容易触发重生成，导致身份/服装漂移。
3. **单镜时长 3.38s 的尾部失控**：Agnes 视频生成到后段时，首帧约束衰减，负面词遵守下降。
4. **首帧图与 prompt 细节不完全一致**：render11 旧图的陈默是短夹克，render13 新剧本要求 ankle-length overcoat，模型在运动会放大这种不一致。

## 下一步建议
1. **立即增强 negative_prompt**：针对本次暴露的问题，加入 `no extra people, no background characters, no identity change, no face morphing, no clothing change, no laughing, no big smile, no exaggerated expression, no suit and tie, no briefcase, no skirt, no bare legs, no sneakers`。
2. **进一步压低运动幅度**：把 `[ACTION]` 改成 `almost static, extremely subtle micro-motion, no camera move`，让模型少"自由发挥"。
3. **考虑首尾帧 keyframes 模式**：用相邻两帧定格图作首/尾帧，增加轨迹约束（需 Agnes video 支持 `mode:"keyframes"` + `extra_body.image:[首,尾]`）。
4. **剪辑止损**：若再跑仍尾部失控，可只取每镜前 1.5-2 秒可用片段，尾部裁掉。
5. **完整 render13**：等 Agnes 图片接口恢复后，用新定妆图（长大衣/精确外貌）+ 新定格图 + 增强版 negative_prompt 再跑完整 5 镜。

## 文件
- 视频：`render13b_out/vid_1_巷口候车.mp4` ~ `vid_4_欲言又止.mp4`
- 抽帧：`render13b_out/frames/`
- 脚本：`render13b.mjs`
