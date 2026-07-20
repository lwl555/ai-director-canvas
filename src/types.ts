// AI 导演画布 —— 数据模型

export type NodeType = 'image' | 'video' | 'reference' | 'text'

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

export type GenStatus = 'idle' | 'pending' | 'processing' | 'done' | 'failed'

export interface CanvasNode {
  id: string
  type: NodeType
  x: number
  y: number
  w: number
  h: number
  title: string
  // 生成提示词
  prompt?: string
  promptEn?: string
  // 生成状态与结果
  status?: GenStatus
  imageUrl?: string // image/reference 节点 / video 首帧
  videoUrl?: string // video 节点
  error?: string
  // 生成参数
  model?: string
  size?: string // 如 1152x768
  numFrames?: number
  frameRate?: number
  seed?: number
  cameraMotion?: CameraMotion
  // reference 节点元数据
  refType?: RefType
  refLabel?: string
  // video 节点关键帧来源（引用其它节点 id）
  firstFrameNodeId?: string
  lastFrameNodeId?: string
  // 分镜时序（仅 video 节点参与时间轴）
  shotIndex?: number
  durationSec?: number
  audioHint?: string
  // text 节点
  text?: string
}

export interface Edge {
  id: string
  from: string // 源节点（reference / image）
  to: string // 目标节点（video）
  kind: 'first_frame' | 'last_frame' | 'reference'
}

export interface DirectorProject {
  id: string
  title: string
  style: string
  durationSec: number
  emotionArc: string
  nodes: CanvasNode[]
  edges: Edge[]
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
  handheld: '手持抖动'
}

export const SIZE_OPTIONS = [
  '1152x768',
  '768x1152',
  '1024x1024',
  '1536x1024',
  '1024x1536'
]

export const IMAGE_MODELS = [
  { id: 'agnes-image-2.1-flash', name: 'AI 绘图引擎 (高清)' },
  { id: 'agnes-image-2.0-flash', name: 'AI 绘图 Lite' }
]
