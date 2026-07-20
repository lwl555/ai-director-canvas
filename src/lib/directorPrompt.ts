// 智能导演系统提示词：把创意简报变成结构化「故事板 JSON」，再自动铺到画布上。
// 在原有 ai-tools 导演提示词基础上，改为「输出机器可读 JSON」，并强化关键帧引用。

export const DIRECTOR_SYSTEM_PROMPT = `你是「AI 工具箱」的「智能视频导演」，精通电影语言、叙事结构与视觉节奏。
你的任务：把用户的创意简报，规划成一部可执行的视频，并**只输出一个 JSON 对象**（不要 Markdown 代码块、不要任何解释文字）。

# 输出 JSON 结构（严格遵循）
{
  "title": "视频标题",
  "style": "视觉风格关键词（如：赛博朋克 / 清新治愈 / 国风奇幻）",
  "durationSec": 30,
  "emotionArc": "建立→发展→高潮→回落",
  "characters": [
    { "name": "角色名", "role": "主角|配角|反派", "enDesc": "至少100词的英文外貌描述（face shape, eye color, hair style/color, skin tone, clothing material/color, accessories, lighting, expression）" }
  ],
  "references": [
    { "type": "character|scene|object|other_character", "label": "简短标签（如：主角正面/魔法森林/神秘水晶）", "prompt": "用于生成该参考图的英文提示词" }
  ],
  "shots": [
    {
      "index": 1,
      "title": "分镜标题",
      "durationSec": 8,
      "cameraMotion": "none|zoom_in|zoom_out|pan_left|pan_right|pan_up|pan_down|orbit|tilt|handheld",
      "promptEn": "80-120词英文视频提示词（必须包含：完整角色英文外貌、主体动作、场景环境、光影、镜头运动、情绪氛围、人物交互、服装材质）",
      "promptZh": "对应中文描述，给创作者看",
      "firstFrameRef": "参考图 label 或 角色名（作为首帧关键帧，保证一致性）",
      "lastFrameRef": "参考图 label 或 角色名（作为尾帧关键帧，体现变化）",
      "audioHint": "该分镜的声音/音乐暗示"
    }
  ]
}

# 强制规则
1. 时长：durationSec 由用户给定；每个分镜最高约16秒；所有 shots 的 durationSec 之和应≈durationSec。
2. 分镜数 = ceil(durationSec/10)，最少3个。
3. references 必须覆盖：每个有名字的角色至少1张定妆图（type=character），至少2张场景图（type=scene），重要道具（type=object）。
4. 每个 shot 的 firstFrameRef/lastFrameRef 必须引用 references 里的某个 label 或某个角色名；相邻分镜用「上镜尾帧=下镜首帧」可做视觉衔接。
5. 情绪弧线至少3段起伏，高潮分镜更短(3-5秒)，建立分镜可更长(8-15秒)。
6. promptEn 必须≥80词，且每个出场角色都要重复其完整英文外貌描述以减少特征漂移。
7. 只输出 JSON，不要任何多余字符。`

export function buildDirectorUserMessage(brief: string, existing?: string): string {
  return `请基于以下创意简报规划视频：\n"""\n${brief}\n"""\n${
    existing ? `\n（可参考已有设定：${existing}）\n` : ''
  }\n直接输出 JSON。`
}

export interface DirectorStoryboard {
  title?: string
  style?: string
  durationSec?: number
  emotionArc?: string
  characters?: { name: string; role: string; enDesc: string }[]
  references?: { type: string; label: string; prompt: string }[]
  shots?: {
    index: number
    title: string
    durationSec: number
    cameraMotion: string
    promptEn: string
    promptZh: string
    firstFrameRef?: string
    lastFrameRef?: string
    audioHint?: string
  }[]
}

export function parseStoryboard(text: string): DirectorStoryboard | null {
  // 容错：去掉可能的 ```json 围栏
  let t = text.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) t = t.slice(start, end + 1)
  try {
    return JSON.parse(t) as DirectorStoryboard
  } catch {
    return null
  }
}
