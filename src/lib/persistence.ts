import type { DirectorProject, RefNode, ShotNode, VideoNode, VideoVariant } from '../types'

const LS_KEY = 'director-canvas-project-v1'

// 旧版（重构前）数据结构与现在不同（例如视频节点直接带 videoUrl，无 variants 数组）。
// 加载时统一归一化，避免 undefined.variants 之类访问导致整棵组件树崩溃（白/黑屏）。
function nid(): string {
  return 'm' + Math.random().toString(36).slice(2, 10)
}

export function normalizeProject(raw: any): DirectorProject {
  if (!raw || typeof raw !== 'object') {
    return {
      id: nid(),
      title: '未命名作品',
      brief: '',
      style: '',
      durationSec: 30,
      emotionArc: '',
      characters: [],
      refs: [],
      shots: [],
      videos: [],
      updatedAt: Date.now()
    }
  }
  const refs: RefNode[] = (Array.isArray(raw.refs) ? raw.refs : []).filter(Boolean).map((r: any) => ({
    id: r?.id || nid(),
    type: 'reference' as const,
    refType: r?.refType || 'character',
    label: r?.label || '未命名',
    characterName: r?.characterName,
    isMainRef: !!r?.isMainRef,
    prompt: r?.prompt || '',
    promptEn: r?.promptEn,
    status: r?.status || 'idle',
    imageUrl: r?.imageUrl,
    error: r?.error,
    x: Number(r?.x) || 60,
    y: Number(r?.y) || 60
  }))
  const shots: ShotNode[] = (Array.isArray(raw.shots) ? raw.shots : []).filter(Boolean).map((s: any) => ({
    id: s?.id || nid(),
    type: 'shot' as const,
    index: Number(s?.index) || 1,
    title: s?.title || '分镜',
    promptEn: s?.promptEn || '',
    promptZh: s?.promptZh,
    cameraMotion: s?.cameraMotion || 'none',
    durationSec: Number(s?.durationSec) || 8,
    audioHint: s?.audioHint,
    firstFrameRefId: s?.firstFrameRefId,
    lastFrameRefId: s?.lastFrameRefId,
    status: s?.status || 'idle',
    imageUrl: s?.imageUrl,
    error: s?.error,
    x: Number(s?.x) || 60,
    y: Number(s?.y) || 60
  }))
  const videos: VideoNode[] = (Array.isArray(raw.videos) ? raw.videos : []).filter(Boolean).map((v: any) => {
    let variants: VideoVariant[] = Array.isArray(v?.variants) ? v.variants : []
    // 旧版：视频节点直接带 videoUrl（无 variants）→ 包成单个变体，保留用户旧作品
    if (variants.length === 0 && v?.videoUrl) {
      variants = [{ id: nid(), videoUrl: v.videoUrl, status: 'done', createdAt: Date.now() }]
    }
    return {
      id: v?.id || nid(),
      type: 'video' as const,
      shotId: v?.shotId || '',
      title: v?.title || '视频',
      promptEn: v?.promptEn || '',
      cameraMotion: v?.cameraMotion || 'none',
      durationSec: Number(v?.durationSec) || 8,
      numFrames: v?.numFrames,
      frameRate: v?.frameRate,
      seed: v?.seed,
      variants,
      activeVariantId: v?.activeVariantId || variants[0]?.id,
      inTimeline: v?.inTimeline !== false,
      timelineStart: v?.timelineStart,
      x: Number(v?.x) || 60,
      y: Number(v?.y) || 60
    }
  })
  return {
    id: raw.id || nid(),
    title: raw.title || '未命名作品',
    brief: raw.brief || '',
    style: raw.style || '',
    durationSec: Number(raw.durationSec) || 30,
    emotionArc: raw.emotionArc || '',
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    refs,
    shots,
    videos,
    updatedAt: Number(raw.updatedAt) || Date.now()
  }
}

export function saveProjectLocal(p: DirectorProject): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* 忽略容量错误 */
  }
}

export function loadProjectLocal(): DirectorProject | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return normalizeProject(JSON.parse(raw))
  } catch {
    return null
  }
}

// —— 可选：跨设备保存（复用一个 Supabase 表 director_sessions，需自行加 canvas_json 列）——
// 仅做 best-effort，失败不影响本地使用。
const SB_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined
const SB_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON as string | undefined

export function supabaseConfigured(): boolean {
  return !!SB_URL && !!SB_ANON
}

export async function saveProjectSupabase(p: DirectorProject): Promise<boolean> {
  if (!SB_URL || !SB_ANON) return false
  try {
    const res = await fetch(`${SB_URL}/rest/v1/director_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: p.id,
        canvas_json: p,
        updated_at: new Date().toISOString()
      })
    })
    return res.ok
  } catch {
    return false
  }
}

export async function loadProjectSupabase(id: string): Promise<DirectorProject | null> {
  if (!SB_URL || !SB_ANON) return null
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/director_sessions?select=canvas_json&id=eq.${id}`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    )
    if (!res.ok) return null
    const arr = await res.json()
    if (Array.isArray(arr) && arr[0]?.canvas_json) return normalizeProject(arr[0].canvas_json)
    return null
  } catch {
    return null
  }
}

// 取云端最近一次保存的工程（跨设备恢复用）。
// 注意：每个浏览器生成自己的随机 id，所以云端可能有多行；这里取 updated_at 最新的一行。
export async function loadLatestProjectSupabase(): Promise<DirectorProject | null> {
  if (!SB_URL || !SB_ANON) return null
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/director_sessions?select=canvas_json,updated_at&order=updated_at.desc&limit=1`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    )
    if (!res.ok) return null
    const arr = await res.json()
    if (Array.isArray(arr) && arr[0]?.canvas_json) return normalizeProject(arr[0].canvas_json)
    return null
  } catch {
    return null
  }
}
