import React, { createContext, useContext, useReducer, useMemo, useEffect } from 'react'
import type { DirectorProject, RefNode, ShotNode, VideoNode, VideoVariant, AnyNode, RefType } from './types'
import { uid } from './lib/id'
import { loadProjectLocal, saveProjectLocal, saveProjectSupabase, supabaseConfigured } from './lib/persistence'
import type { DirectorStoryboard } from './lib/directorPrompt'

function emptyProject(): DirectorProject {
  return {
    id: uid(),
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

interface State {
  project: DirectorProject
  selectedId: string | null
  viewport: { scale: number; tx: number; ty: number }
}

type Action =
  | { type: 'load'; project: DirectorProject }
  | { type: 'reset' }
  | { type: 'select'; id: string | null }
  | { type: 'setViewport'; viewport: State['viewport'] }
  | { type: 'setMeta'; patch: Partial<DirectorProject> }
  | { type: 'addRef'; node: RefNode }
  | { type: 'updateRef'; id: string; patch: Partial<RefNode> }
  | { type: 'removeRef'; id: string }
  | { type: 'addShot'; node: ShotNode }
  | { type: 'updateShot'; id: string; patch: Partial<ShotNode> }
  | { type: 'removeShot'; id: string }
  | { type: 'addVideo'; node: VideoNode }
  | { type: 'updateVideo'; id: string; patch: Partial<VideoNode> }
  | { type: 'removeVideo'; id: string }
  | { type: 'addVariant'; videoId: string; variant: VideoVariant }
  | { type: 'updateVariant'; videoId: string; variantId: string; patch: Partial<VideoVariant> }
  | { type: 'setMainRef'; refId: string }
  | { type: 'applyStoryboard'; board: DirectorStoryboard }

function touch(p: DirectorProject): DirectorProject {
  return { ...p, updatedAt: Date.now() }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { ...state, project: action.project, selectedId: null }
    case 'reset':
      return { ...state, project: emptyProject(), selectedId: null }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'setViewport':
      return { ...state, viewport: action.viewport }
    case 'setMeta':
      return { ...state, project: touch({ ...state.project, ...action.patch }) }
    case 'addRef':
      return { ...state, project: touch({ ...state.project, refs: [...state.project.refs, action.node] }) }
    case 'updateRef':
      return {
        ...state,
        project: touch({
          ...state.project,
          refs: state.project.refs.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n))
        })
      }
    case 'removeRef': {
      const refs = state.project.refs.filter((n) => n.id !== action.id)
      const shots = state.project.shots.map((s) => ({
        ...s,
        firstFrameRefId: s.firstFrameRefId === action.id ? undefined : s.firstFrameRefId,
        lastFrameRefId: s.lastFrameRefId === action.id ? undefined : s.lastFrameRefId
      }))
      return { ...state, project: touch({ ...state.project, refs, shots }) }
    }
    case 'addShot':
      return { ...state, project: touch({ ...state.project, shots: [...state.project.shots, action.node] }) }
    case 'updateShot':
      return {
        ...state,
        project: touch({
          ...state.project,
          shots: state.project.shots.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n))
        })
      }
    case 'removeShot': {
      const shots = state.project.shots.filter((n) => n.id !== action.id)
      const videos = state.project.videos.filter((v) => v.shotId !== action.id)
      return { ...state, project: touch({ ...state.project, shots, videos }) }
    }
    case 'addVideo':
      return { ...state, project: touch({ ...state.project, videos: [...state.project.videos, action.node] }) }
    case 'updateVideo':
      return {
        ...state,
        project: touch({
          ...state.project,
          videos: state.project.videos.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n))
        })
      }
    case 'removeVideo': {
      const videos = state.project.videos.filter((n) => n.id !== action.id)
      return { ...state, project: touch({ ...state.project, videos }) }
    }
    case 'addVariant':
      return {
        ...state,
        project: touch({
          ...state.project,
          videos: state.project.videos.map((v) =>
            v.id === action.videoId
              ? {
                  ...v,
                  variants: [...v.variants, action.variant],
                  activeVariantId: v.activeVariantId ?? action.variant.id
                }
              : v
          )
        })
      }
    case 'updateVariant':
      return {
        ...state,
        project: touch({
          ...state.project,
          videos: state.project.videos.map((v) =>
            v.id === action.videoId
              ? { ...v, variants: v.variants.map((vt) => (vt.id === action.variantId ? { ...vt, ...action.patch } : vt)) }
              : v
          )
        })
      }
    case 'setMainRef':
      return {
        ...state,
        project: touch({
          ...state.project,
          refs: state.project.refs.map((r) => ({ ...r, isMainRef: r.id === action.refId }))
        })
      }
    case 'applyStoryboard': {
      const board = action.board
      const refs: RefNode[] = []
      const shots: ShotNode[] = []
      const labelToId = new Map<string, string>()
      const idToRef = new Map<string, string>()

      ;(board.references || []).filter(Boolean).forEach((r: any, i: number) => {
        const id = uid()
        const label = r.label || '未命名'
        const ref: RefNode = {
          id,
          type: 'reference',
          refType: (r.type as RefType) || 'character',
          label,
          characterName: r.characterName,
          isMainRef: r.type === 'character' && i === 0, // 第一张角色定妆图默认主参考
          prompt: r.prompt || '',
          status: 'idle',
          x: 60,
          y: 60 + i * 250
        }
        refs.push(ref)
        labelToId.set(label.toLowerCase(), id)
        idToRef.set(id, label.toLowerCase())
        if (r.characterName) {
          labelToId.set(String(r.characterName).toLowerCase(), id)
        }
      })
      // 角色名兜底
      ;(board.characters || []).filter(Boolean).forEach((c: any) => {
        const cname = String(c.name || '').toLowerCase()
        if (!cname || labelToId.has(cname)) return
        const hit = refs.find((n) => n.refType === 'character' && n.label.toLowerCase().includes(cname))
        if (hit) labelToId.set(cname, hit.id)
      })

      ;(board.shots || []).filter(Boolean).forEach((s: any, i: number) => {
        const match = (label?: string) => (label ? labelToId.get(label.toLowerCase()) : undefined)
        const shot: ShotNode = {
          id: uid(),
          type: 'shot',
          index: i + 1,
          title: s.title || `分镜 ${i + 1}`,
          promptEn: s.promptEn || '',
          promptZh: s.promptZh,
          cameraMotion: (s.cameraMotion as any) || 'none',
          durationSec: s.durationSec || 3,
          // 电影镜头六要素（来自导演提示词公式）
          shotType: (s.shotType as any) || undefined,
          cameraAngle: (s.cameraAngle as any) || undefined,
          lens: (s.lens as any) || undefined,
          depthOfField: (s.depthOfField as any) || undefined,
          lighting: (s.lighting as any) || undefined,
          mood: (s.mood as any) || undefined,
          composition: (s.composition as any) || undefined,
          actionChain: typeof s.actionChain === 'string' && s.actionChain.trim() ? s.actionChain.trim() : undefined,
          negativePrompt: typeof s.negativePrompt === 'string' && s.negativePrompt.trim() ? s.negativePrompt.trim() : undefined,
          // ——
          audioHint: s.audioHint,
          dialogue: Array.isArray(s.dialogue)
            ? s.dialogue.filter((d: any) => d && d.speaker && d.line).map((d: any) => ({ speaker: String(d.speaker), line: String(d.line) }))
            : undefined,
          caption: typeof s.caption === 'string' && s.caption.trim() ? s.caption.trim().slice(0, 16) : undefined,
          cast: Array.isArray(s.cast) ? s.cast.map((c) => String(c)).filter(Boolean) : undefined,
          sceneRefId: match(s.sceneRef),
          propRefIds: Array.isArray(s.propRefs) ? s.propRefs.map((p) => match(p)).filter(Boolean) : undefined,
          firstFrameRefId: match(s.firstFrameRef),
          lastFrameRefId: (() => {
            const lf = match(s.lastFrameRef)
            return lf && lf !== match(s.firstFrameRef) ? lf : undefined
          })(),
          status: 'idle',
          x: 360 + (i % 4) * 300,
          y: 60 + Math.floor(i / 4) * 260
        }
        shots.push(shot)
      })

      // 自动把分镜按序排上时间轴（AC 一键成片的基础）
      let cursor = 0
      shots.forEach((s, i) => {
        s.timelineStart = cursor
        cursor += s.durationSec || 8
      })

      return {
        ...state,
        project: touch({
          ...state.project,
          title: board.title || state.project.title,
          style: board.style || '',
          durationSec: board.durationSec || 0,
          emotionArc: board.emotionArc || '',
          characters: board.characters || [],
          refs,
          shots,
          videos: []
        }),
        selectedId: null
      }
    }
    default:
      return state
  }
}

interface Ctx {
  state: State
  project: DirectorProject
  selectedId: string | null
  selectedNode: AnyNode | null
  viewport: State['viewport']
  supabaseOn: boolean
  load: (p: DirectorProject) => void
  reset: () => void
  select: (id: string | null) => void
  setViewport: (v: State['viewport']) => void
  setMeta: (patch: Partial<DirectorProject>) => void
  addRef: (node: RefNode) => void
  updateRef: (id: string, patch: Partial<RefNode>) => void
  removeRef: (id: string) => void
  addShot: (node: ShotNode) => void
  updateShot: (id: string, patch: Partial<ShotNode>) => void
  removeShot: (id: string) => void
  addVideo: (node: VideoNode) => void
  updateVideo: (id: string, patch: Partial<VideoNode>) => void
  removeVideo: (id: string) => void
  addVariant: (videoId: string, variant: VideoVariant) => void
  updateVariant: (videoId: string, variantId: string, patch: Partial<VideoVariant>) => void
  setMainRef: (refId: string) => void
  applyStoryboard: (board: DirectorStoryboard) => void
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    project: loadProjectLocal() || emptyProject(),
    selectedId: null,
    viewport: { scale: 1, tx: 0, ty: 0 }
  }))

  // 本地自动保存
  useEffect(() => {
    saveProjectLocal(state.project)
  }, [state.project])

  // 防抖云端保存
  useEffect(() => {
    if (!supabaseConfigured()) return
    const t = setTimeout(() => {
      saveProjectSupabase(state.project)
    }, 1500)
    return () => clearTimeout(t)
  }, [state.project])

  const value = useMemo<Ctx>(
    () => ({
      state,
      project: state.project,
      selectedId: state.selectedId,
      selectedNode: findNode(state.project, state.selectedId),
      viewport: state.viewport,
      supabaseOn: supabaseConfigured(),
      load: (p) => dispatch({ type: 'load', project: p }),
      reset: () => dispatch({ type: 'reset' }),
      select: (id) => dispatch({ type: 'select', id }),
      setViewport: (v) => dispatch({ type: 'setViewport', viewport: v }),
      setMeta: (patch) => dispatch({ type: 'setMeta', patch }),
      addRef: (node) => dispatch({ type: 'addRef', node }),
      updateRef: (id, patch) => dispatch({ type: 'updateRef', id, patch }),
      removeRef: (id) => dispatch({ type: 'removeRef', id }),
      addShot: (node) => dispatch({ type: 'addShot', node }),
      updateShot: (id, patch) => dispatch({ type: 'updateShot', id, patch }),
      removeShot: (id) => dispatch({ type: 'removeShot', id }),
      addVideo: (node) => dispatch({ type: 'addVideo', node }),
      updateVideo: (id, patch) => dispatch({ type: 'updateVideo', id, patch }),
      removeVideo: (id) => dispatch({ type: 'removeVideo', id }),
      addVariant: (videoId, variant) => dispatch({ type: 'addVariant', videoId, variant }),
      updateVariant: (videoId, variantId, patch) =>
        dispatch({ type: 'updateVariant', videoId, variantId, patch }),
      setMainRef: (refId) => dispatch({ type: 'setMainRef', refId }),
      applyStoryboard: (board) => dispatch({ type: 'applyStoryboard', board })
    }),
    [state]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function findNode(p: DirectorProject, id: string | null): AnyNode | null {
  if (!id) return null
  return p.refs.find((n) => n.id === id) || p.shots.find((n) => n.id === id) || p.videos.find((n) => n.id === id) || null
}

export function useStore(): Ctx {
  const c = useContext(StoreContext)
  if (!c) throw new Error('useStore must be used within StoreProvider')
  return c
}
