# 剧本 v2：《末班车的第七分钟》

> 用途：本文件是导演级分镜剧本，同时作为 AI 图像/视频生成的「单一事实来源」。  
> 设计原则（针对上一版「提示词太粗 → AI 自由发挥 → 表情假/诡异」的根因）：
>
> 1. **人物锁定**：每个角色有精确小传（外貌/服装/性格），所有镜统一复用。
> 2. **约束明确**：每镜 AI 提示词写死服装、发型、肤色、光源、机位，不允许模型「自主创作」。
> 3. **表演克制**：对话走 understated 路线，明确禁止夸张表情/假笑/播音腔。
> 4. **首帧驱动**：视频首帧用本剧本生成的分镜定格图（已含场景+双角色），锁住一致性。
> 5. **负面词独立**：`negative_prompt` 单独传，不与正向 prompt 混写（已验证剥离有效）。

---

## 一、人物小传（全片锁死，不可漂移）

### 林晚（女，26 岁）

- **身份**：自由插画师，刚结束一场不成功的展览。
- **外貌**：瓜子脸，单眼皮，眼型偏长，眼神安静清冷；肤色白里透粉（冷白皮）；唇色淡，不涂浓妆。
- **发型**：黑色长直发微卷，垂至锁骨下 5cm；空气刘海，两侧八字微外撇。
- **服装（锁死）**：米色双排扣及膝羊毛风衣（beige double-breasted wool trench coat, knee-length），内搭米白高领羊绒衫，下身黑色直筒西裤，脚踩浅驼色乐福鞋；左耳单颗 3mm 银粒耳钉。
- **性格/表演**：外冷内温，习惯性把情绪压在底下；说话语速慢、音量低；不轻易笑，笑也是嘴角轻微上扬。

### 陈默（男，28 岁）

- **身份**：刚从大厂辞职的程序员，处在迷茫期。
- **外貌**：长方脸，单眼皮，眉骨略高，下颌线清晰利落；眼下有淡青色疲态阴影；肤色偏中性偏小麦。
- **发型**：深棕短发，三七分，发尾略硬挺，不长于耳。
- **服装（锁死）**：深灰及踝羊毛长大衣（dark grey wool overcoat, ankle-length, NOT trench, NOT jacket），内搭炭黑高领针织衫，下身黑色修身长裤，脚踩哑光黑德比鞋。
- **性格/表演**：钝感、克制、不擅长表达；动作偏慢、偏稳；欲言又止时看地/抿唇，不夸张。

> ⚠️ 一致性铁律：林晚永远是「米色及膝双排扣风衣+黑长发+左耳银钉」；陈默永远是「深灰及踝长大衣+深棕三七分短发」。任何镜都不得穿帮（换装/换发型/换发色）。

---

## 二、故事梗概

雨夜，老城区公交站。末班车久候不至。林晚撑伞独站，陈默从巷口走来并肩。一句试探性的搭话打破沉默，两人短暂靠近，陈默欲言又止，最终车灯由远及近又驶离——谁都没上车。留白收尾。

核心情绪：**疏离中的靠近，欲言又止的温柔**。

---

## 三、分镜表（5 镜）

| 镜 | 景别                | 时长 | 场景       | 天气/光           | 人物    | 台词          | 核心动作                      |
| - | ----------------- | -- | -------- | -------------- | ----- | ----------- | ------------------------- |
| 1 | 全景 establishing   | 5s | 老城区巷口公交站 | 雨夜，暖黄路灯+霓虹积水反光 | 林晚+陈默 | 无           | 林晚撑透明伞站定；陈默从右入画站定斜前方      |
| 2 | 中景 two-shot       | 5s | 同站       | 雨夜，斜雨          | 林晚+陈默 | 无           | 并肩，间距一步，互不看；林晚侧脸望雨，陈默低头熄屏 |
| 3 | 中近景 over-shoulder | 5s | 同站       | 雨夜，浅景深         | 林晚+陈默 | 林晚：「也等末班车？」 | 林晚微侧头轻声问；陈默略怔转头，嘴角微动      |
| 4 | 特写 close-up       | 5s | 同站       | 雨夜，双人近景        | 林晚+陈默 | 陈默：「算了，没事。」 | 陈默张嘴又摇头垂眼；林晚侧后虚化，眼神柔软     |
| 5 | 全景 wide           | 6s | 同站       | 雨夜，车灯划过        | 林晚+陈默 | 无           | 远处车灯由远及近又驶离；两人静止留白        |

---

## 四、逐镜详细剧本 + AI 提示词

### 镜 1｜巷口候车（全景）

**画面**：雨夜老城区，湿青石板巷，暖黄路灯与远处冷蓝霓虹在积水里拉出长光带。站牌下，林晚撑一把透明长柄伞，米色及膝双排扣风衣，黑长发垂肩，左耳银钉微闪。陈默从画面右侧巷口走入，深灰及踝长大衣，深棕短发，站定在林晚斜前方约两步，两人无交流。

**镜头**：固定全景（wide static），极缓推近（slow dolly-in，幅度小），雨丝斜落。

**光影**：主光暖黄路灯从左上；补光霓虹冷蓝从右下积水反射；人物边缘有湿漉反光。

**情绪**：安静、疏离、等待。

**AI 图像提示词（image prompt）**：

```
Cinematic realistic wide establishing shot, a rainy night in an old Chinese alley with wet blue-grey stone pavement, a warm amber streetlamp on the left casting long light, distant cold blue neon reflecting in puddles. A young Chinese woman with long straight black hair slightly wavy to collarbone, air bangs, single eyelid, cool fair skin, wearing a BEIGE double-breasted knee-length wool trench coat, beige turtleneck, black straight trousers, camel loafers, a tiny 3mm silver stud earring on her LEFT ear, holding a clear long-handle umbrella, standing still under a bus-stop sign. A Chinese man with short dark-brown hair parted 3:7, single eyelid, defined jawline, tired faint dark circles, neutral-medium skin, wearing a DARK GREY ankle-length wool overcoat (NOT trench, NOT jacket), charcoal turtleneck, black slim trousers, matte black derby shoes, walking in from the right side of frame and stopping two steps diagonally ahead of her. Both fully visible, no eye contact, atmosphere of quiet waiting, photorealistic, film still, shallow wet reflections, moody cinematic lighting, 35mm lens look.
```

**AI 视频提示词（video prompt）**：

```
[PARAMS] cinematic, photorealistic, high detail, 24fps, smooth subtle camera move
[SCENE] rainy night old alley, wet stone pavement, amber streetlamp left, cold blue neon puddle reflections
[SUBJECT] the beige-trench-coat woman holds a clear umbrella standing still under the bus sign; the dark-grey-overcoat man walks in from the right and stops two steps ahead of her, both quiet, no eye contact
[ACTION] extremely slow dolly-in, tiny幅度, rain falling diagonally, slight fabric sway, ambient life
[CONSISTENCY] keep exact character appearance, clothing, hair, earring as the first frame; no outfit change, no hairstyle change
[REALISM] natural skin texture, real-world wet-night lighting, subtle ambient motion
[DELIVERY] calm, understated, restrained, no exaggerated expression, no smile
[SPEAKING] No spoken dialogue in this shot.
```



---

### 镜 2｜并肩（中景 two-shot）

**画面**：两人并肩站，间距约一步。林晚侧脸望向雨里，黑发被风轻微拂动；陈默低头看手机，片刻熄屏放入口袋。都不看对方。

**镜头**：缓慢横移（slow horizontal pan）从陈默一侧滑到林晚一侧，强调同框与疏离；浅景深，背景雨夜虚化。

**光影**：同上，暖冷交织；两人之间留白冷调。

**情绪**：并肩的孤独，各自心事。

**AI 图像提示词（image prompt）**：

```
Cinematic realistic medium two-shot, a rainy night at the same bus stop, shallow depth of field with rainy night bokeh behind. On the right, a Chinese man in a DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, looking down at a phone then pocketing it, neutral-medium skin, defined jawline, tired eyes. On the left, a young Chinese woman in a BEIGE double-breasted knee-length wool trench coat, beige turtleneck, long straight black hair slightly wavy to collarbone, air bangs, single eyelid, cool fair skin, tiny silver stud on LEFT ear, turning her face toward the rain, not looking at him. They stand about one step apart, no eye contact, intimate yet distant, photorealistic, film still, wet reflections, moody cinematic lighting.
```

**AI 视频提示词（video prompt）**：

```
[PARAMS] cinematic, photorealistic, high detail, 24fps, slow camera move
[SCENE] rainy night bus stop, shallow DoF, rainy bokeh background, warm-cool mixed light
[SUBJECT] the dark-grey-overcoat man on right looks down at phone, then pockets it; the beige-trench-coat woman on left turns her face toward the rain; they stand one step apart, no eye contact
[ACTION] very slow horizontal pan from man to woman, hair gently blown by wind, rain falling, subtle weight shift, no abrupt move
[CONSISTENCY] identical appearance, clothing, hair, earring as shot 1 first frame; no change
[REALISM] natural skin, real wet-night light, photorealistic
[DELIVERY] subdued, introspective, no smile, no exaggeration
[SPEAKING] No spoken dialogue in this shot.
```

---

### 镜 3｜搭话（中近景 over-shoulder）

**画面**：过肩构图，从林晚肩后看陈默。林晚（入画左前肩，虚化）微微侧头，轻声问。陈默略怔，转头看她，嘴角轻微动了一下（似笑非笑，克制）。

**台词**：林晚（轻声，慢，低音量）：「也等末班车？」

**镜头**：过肩（over-shoulder），浅景深，焦点在陈默；极缓推近。

**光影**：路灯侧光打在陈默半脸，另一半入影，层次分明。

**情绪**：试探、轻微破冰。

**AI 图像提示词（image prompt）**：

```
Cinematic realistic medium close-up over-the-shoulder shot, viewed from behind the beige-trench-coat woman's left shoulder (her shoulder and hair softly out of focus in lower-left foreground), focusing on a Chinese man in a DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, single eyelid, defined jawline, who has just turned his head toward her with a faint, restrained almost-smile (lips barely moved, NOT a grin), neutral-medium skin, tired eyes. Rainy night bus stop background softly blurred with bokeh. Photorealistic, film still, shallow DoF, dramatic side light from streetlamp.
```

**AI 视频提示词（video prompt）**：

```
[PARAMS] cinematic, photorealistic, high detail, 24fps, slow push-in
[SCENE] rainy night bus stop, over-shoulder from woman's left shoulder, shallow DoF, streetlamp side light, blurred rainy bokeh bg
[SUBJECT] focus on the dark-grey-overcoat man; the beige-trench-coat woman's shoulder/hair in soft foreground
[ACTION] the woman turns her head slightly and asks quietly; the man, slightly startled, turns to look at her, lips barely move in a restrained almost-smile; very subtle, natural motion
[CONSISTENCY] identical appearance, clothing, hair as prior shots; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, internal, restrained, no exaggerated smile, no theatrical
[SPEAKING] The woman speaks in quiet, natural Mandarin Chinese: "也等末班车？". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained expression. NO English speech.
```

---

### 镜 4｜欲言又止（特写 close-up）

**画面**：双人近景，陈默占主（画面右），林晚在侧后虚化（画面左）。陈默张了张嘴，又摇头，垂眼说「算了，没事。」林晚看着他，眼神里一点柔软。

**台词**：陈默（低头，音量更低）：「算了，没事。」

**镜头**：双人面部近景（同框，split focus 或浅景深主副），极缓。

**光影**：路灯暖光，陈默半脸受光，林晚侧影入影。

**情绪**：欲言又止的温柔，距离感下的靠近。

**AI 图像提示词（image prompt）**：

```
Cinematic realistic close-up of two faces in frame, the Chinese man in DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, single eyelid, defined jawline, occupying the right side, looking down and shaking his head slightly, lips forming restrained words, faint tired eyes. On the left, softly out of focus, the young Chinese woman in BEIGE double-breasted knee-length wool trench coat, long straight black hair, air bangs, single eyelid, cool fair skin, tiny silver stud LEFT ear, looking at him with a hint of softness in her eyes. Rainy night, warm streetlamp light on the man's lit half, woman's profile in shadow. Photorealistic, film still, shallow DoF, intimate moody lighting.
```

**AI 视频提示词（video prompt）**：

```
[PARAMS] cinematic, photorealistic, high detail, 24fps, very slow, intimate
[SCENE] rainy night, warm streetlamp on man's lit half, woman's profile in shadow, shallow DoF
[SUBJECT] two faces in frame: the dark-grey-overcoat man on right (main), the beige-trench-coat woman on left (soft focus)
[ACTION] the man opens his mouth as if to speak, then shakes his head slightly and looks down, says the line with lowered eyes; the woman watches him, eyes softening; minimal, natural motion
[CONSISTENCY] identical appearance, clothing, hair, earring as prior shots; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, vulnerable but restrained, no exaggerated smile, no theatrical
[SPEAKING] The man speaks in quiet, natural Mandarin Chinese: "算了，没事。". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained, eyes lowered. NO English speech.
```

---

### 镜 5｜车过（全景 wide）

**画面**：固定远景。远处两束车灯由远及近，照亮雨幕，在两人面前减速、短停、又启动驶离（两人没上）。雨继续下。收尾留白。

**镜头**：固定远景（wide static），车灯划过画面；ending 定格在两人静止的侧影/背影。

**光影**：车灯冷白由远扫过，雨幕被照亮一瞬，复归暖冷夜色。

**情绪**：错过与留白，温柔的遗憾。

**AI 图像提示词（image prompt）**：

```
Cinematic realistic wide static shot, a rainy night at the old alley bus stop, two figures standing still — a woman in a BEIGE knee-length double-breasted wool trench coat with long straight black hair and a man in a DARK GREY ankle-length wool overcoat with short dark-brown hair — seen from behind/side, small in frame. In the distance, two beams of bus headlights approach through the rain, illuminating the wet street and rain curtain, then recede. Warm amber streetlamp and cold blue neon reflections on wet pavement. Photorealistic, film still, cinematic depth, moody atmospheric lighting, 35mm look, sense of stillness and quiet missed connection.
```

**AI 视频提示词（video prompt）**：

```
[PARAMS] cinematic, photorealistic, high detail, 24fps, static wide, subtle
[SCENE] rainy night old alley bus stop, warm amber + cold blue neon on wet pavement, two small figures (beige trench woman, dark-grey overcoat man) standing still from behind/side
[ACTION] in the distance two bus headlight beams approach through rain, brighten the wet street and rain curtain, slow briefly near them, then drive away and recede; the two figures do not move, rain continues; ending on their still silhouettes
[CONSISTENCY] identical appearance, clothing, hair as prior shots even from behind; no change
[REALISM] natural rain, real light, photorealistic, cinematic depth
[DELIVERY] calm, wistful, no expression needed, no dialogue
[SPEAKING] No spoken dialogue in this shot.
```

---

## 五、全局负面提示词（独立传入 `negative_prompt`）

```
no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no hairstyle change, no hair color change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated
```

> 关键点：明确加了 `no outfit change / no hairstyle change / no hair color change`，专门针对上一版陈默外套款式漂移、发型变化的问题。

---

## 六、给工程侧的执行说明（render13 对应）

1. **出图阶段**：先出 2 张定妆参考图（用「人物小传」描述），再出 5 张分镜定格图（双角色定妆+场景作条件图），定格图必须含场景+双角色。
2. **出视频阶段**：每镜首帧 = 对应分镜定格图 URL；`negative_prompt` = 上面的全局负面词；对话镜走 understated 口型指令。
3. **限流**：图片受 `503 queue full` 退避；视频免费档创建 1 个/分钟，状态轮询 ≥20s。
4. **断点续跑**：已存在 `.mp4` / 已存在定格图 `.jpg` 则跳过。
