// AI 导演画布 —— 数据模型（对标即梦无限画布重构版）

export type NodeType = 'reference' | 'shot' | 'video'

export type RefType = 'character' | 'scene' | 'object' | 'other_character'

export type CameraMotion =
  | 'none'
  | 'zoom_in'
  | 'zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'orbit'
  | 'tilt'
  | 'handheld'
  | 'dolly_in'
  | 'dolly_out'
  | 'truck_left'
  | 'truck_right'
  | 'pedestal_up'
  | 'pedestal_down'
  | 'dutch_left'
  | 'dutch_right'
  | 'rack_focus'
  | 'whip_pan'
  | 'follow'
  | 'static_tripod'
  | 'slow_push_in'
  | 'pull_back'

export type ShotType = 'extreme_close_up' | 'close_up' | 'medium_close_up' | 'medium_shot' | 'full_shot' | 'long_shot' | 'extreme_long_shot' | 'cowboy_shot' | 'two_shot' | 'over_shoulder'
export type CameraAngle = 'eye_level' | 'low_angle' | 'high_angle' | 'overhead' | 'bird_eye' | 'worm_eye' | 'side_profile' | 'back_view' | 'dutch'
export type Lens = '24mm' | '35mm' | '50mm' | '85mm' | '100mm_macro' | 'telephoto'
export type DepthOfField = 'shallow' | 'deep' | 'bokeh' | 'soft_focus'
export type LightingStyle = 'natural' | 'cinematic' | 'rembrandt' | 'rim' | 'back_light' | 'chiaroscuro' | 'soft' | 'hard' | 'tyndall' | 'cool' | 'warm' | 'neon'
export type Mood = 'calm' | 'tense' | 'romantic' | 'melancholic' | 'mysterious' | 'energetic' | 'lonely' | 'hopeful' | 'suspenseful' | 'joyful' | 'serious'

export type GenStatus = 'idle' | 'pending' | 'processing' | 'done' | 'failed'

// 画布视口变换（无限画布：缩放 + 平移）
export interface Viewport {
  scale: number
  tx: number
  ty: number
}

// 参考图资产（角色定妆 / 场景 / 道具）
export interface RefNode {
  id: string
  type: 'reference'
  refType: RefType
  label: string
  characterName?: string // 角色定妆图绑定的角色名
  isMainRef?: boolean // ⭐ 主参考：后续生成优先对齐
  prompt: string
  promptEn?: string
  status: GenStatus
  imageUrl?: string
  error?: string
  // 画布坐标
  x: number
  y: number
}

// 分镜卡（导演铺图生成；可独立转视频或定格图）
export interface ShotDialogueLine {
  speaker: string
  line: string
}

export interface ShotNode {
  id: string
  type: 'shot'
  index: number
  title: string
  promptEn: string
  promptZh?: string
  cameraMotion: CameraMotion
  durationSec: number
  // 新增：电影镜头六要素（与提示词公式对齐）
  shotType?: ShotType
  cameraAngle?: CameraAngle
  lens?: Lens
  depthOfField?: DepthOfField
  lighting?: LightingStyle
  mood?: Mood
  composition?: 'centered' | 'rule_of_thirds' | 'symmetrical'
  actionChain?: string // 连贯动作链（如：停下脚步 → 缓缓转头 → 望向镜头）
  negativePrompt?: string // 本镜负面屏蔽词
  // ——
  audioHint?: string
  dialogue?: ShotDialogueLine[] // 对话式短视频的台词
  caption?: string // 一句话字幕：说明这镜在讲什么（烧进视频/显示在卡片），单行 ≤16 字
  cast?: string[] // 本镜出场的角色名（用于角色一致性 / 眼神方向指令）
  sceneRefId?: string // 本镜所在场景参考图 RefNode.id（场景预生成后条件化构图）
  propRefIds?: string[] // 本镜出现的道具参考图 RefNode.id 列表（道具预生成后条件化构图）
  // 关键帧来源（引用 RefNode.id）
  firstFrameRefId?: string
  lastFrameRefId?: string
  // 生成状态
  status: GenStatus
  imageUrl?: string // 定格首帧
  error?: string
  x: number
  y: number
}

// 视频片段（由分镜生成，可多版本）
export interface VideoVariant {
  id: string
  videoUrl?: string
  status: GenStatus
  seed?: number
  error?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  createdAt: number
}

export interface VideoNode {
  id: string
  type: 'video'
  shotId: string // 来源分镜
  title: string
  promptEn: string
  cameraMotion: CameraMotion
  durationSec: number
  numFrames?: number
  frameRate?: number
  seed?: number
  variants: VideoVariant[]
  activeVariantId?: string
  // 时间轴
  inTimeline: boolean
  timelineStart?: number
  x: number
  y: number
}

export type AnyNode = RefNode | ShotNode | VideoNode

export interface DirectorProject {
  id: string
  title: string
  brief: string
  style: string
  durationSec: number
  emotionArc: string
  characters: { name: string; role: string; enDesc: string }[]
  refs: RefNode[]
  shots: ShotNode[]
  videos: VideoNode[]
  updatedAt: number
}

export const REF_TYPE_LABEL: Record<RefType, string> = {
  character: '角色定妆',
  scene: '场景概念',
  object: '物体道具',
  other_character: '其他人物'
}

export const CAMERA_LABEL: Record<CameraMotion, string> = {
  none: '固定镜头',
  zoom_in: '推近',
  zoom_out: '拉远',
  pan_left: '左移',
  pan_right: '右移',
  pan_up: '上移',
  pan_down: '下移',
  orbit: '环绕',
  tilt: '俯仰',
  handheld: '手持抖动',
  dolly_in: '推进 (Dolly In)',
  dolly_out: '拉出 (Dolly Out)',
  truck_left: '横移左 (Truck Left)',
  truck_right: '横移右 (Truck Right)',
  pedestal_up: '升降上 (Pedestal Up)',
  pedestal_down: '升降下 (Pedestal Down)',
  dutch_left: '左斜角 (Dutch Left)',
  dutch_right: '右斜角 (Dutch Right)',
  rack_focus: '变焦转移',
  whip_pan: '快速摇镜',
  follow: '跟随',
  static_tripod: '三脚架固定',
  slow_push_in: '缓慢推镜',
  pull_back: '后拉揭示'
}

export const SHOT_TYPE_LABEL: Record<ShotType, string> = {
  extreme_close_up: '大特写',
  close_up: '特写',
  medium_close_up: '近景',
  medium_shot: '中景',
  full_shot: '全景',
  long_shot: '远景',
  extreme_long_shot: '大远景',
  cowboy_shot: '牛仔景',
  two_shot: '双人镜头',
  over_shoulder: '过肩镜头'
}

export const ANGLE_LABEL: Record<CameraAngle, string> = {
  eye_level: '平视',
  low_angle: '仰视',
  high_angle: '俯视',
  overhead: '顶视',
  bird_eye: '鸟瞰',
  worm_eye: '虫视',
  side_profile: '侧面',
  back_view: '背面',
  dutch: '倾斜'
}

export const LENS_LABEL: Record<Lens, string> = {
  '24mm': '24mm 广角',
  '35mm': '35mm 人文',
  '50mm': '50mm 标准',
  '85mm': '85mm 人像',
  '100mm_macro': '100mm 微距',
  telephoto: '长焦'
}

export const LIGHTING_LABEL: Record<LightingStyle, string> = {
  natural: '自然光',
  cinematic: '电影布光',
  rembrandt: '伦勃朗光',
  rim: '轮廓光',
  back_light: '逆光',
  chiaroscuro: '明暗对比',
  soft: '柔光',
  hard: '硬光',
  tyndall: '丁达尔光',
  cool: '冷色调',
  warm: '暖色调',
  neon: '霓虹光'
}

export const SIZE_OPTIONS = ['1152x768', '768x1152', '1024x1024', '1536x1024', '1024x1536']

export const IMAGE_MODELS = [
  { id: 'agnes-image-2.1-flash', name: 'AI 绘图引擎 (高清)' },
  { id: 'agnes-image-2.0-flash', name: 'AI 绘图 Lite' }
]

export function isRef(n: AnyNode): n is RefNode {
  return n.type === 'reference'
}
export function isShot(n: AnyNode): n is ShotNode {
  return n.type === 'shot'
}
export function isVideo(n: AnyNode): n is VideoNode {
  return n.type === 'video'
}
