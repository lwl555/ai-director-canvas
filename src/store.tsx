import React, { createContext, useContext, useReducer, useMemo, useEffect } from 'react'
import type { CanvasNode, DirectorProject, Edge, NodeType, RefType, CameraMotion } from './types'
import { uid } from './lib/id'
import { loadProjectLocal, saveProjectLocal, saveProjectSupabase, supabaseConfigured } from './lib/persistence'
import type { DirectorStoryboard } from './lib/directorPrompt'

function emptyProject(): DirectorProject {
  return {
    id: uid(),
    title: '未命名作品',
    style: '',
    durationSec: 30,
    emotionArc: '',
    nodes: [],
    edges: [],
    updatedAt: Date.now()
  }
}

interface State {
  project: DirectorProject
  selectedId: string | null
}

type Action =
  | { type: 'load'; project: DirectorProject }
  | { type: 'reset' }
  | { type: 'select'; id: string | null }
  | { type: 'addNode'; node: CanvasNode }
  | { type: 'updateNode'; id: string; patch: Partial<CanvasNode> }
  | { type: 'removeNode'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; w: number; h: number }
  | { type: 'addEdge'; from: string; to: string; kind: Edge['kind'] }
  | { type: 'removeEdge'; id: string }
  | { type: 'setMeta'; patch: Partial<DirectorProject> }
  | { type: 'applyStoryboard'; board: DirectorStoryboard }

function touch(p: DirectorProject): DirectorProject {
  return { ...p, updatedAt: Date.now() }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { project: action.project, selectedId: null }
    case 'reset':
      return { project: emptyProject(), selectedId: null }
    case 'select':
      return { ...state, selectedId: action.id }
    case 'addNode':
      return { ...state, project: touch({ ...state.project, nodes: [...state.project.nodes, action.node] }) }
    case 'updateNode':
      return {
        ...state,
        project: touch({
          ...state.project,
          nodes: state.project.nodes.map((n) => (n.id === action.id ? { ...n, ...action.patch } : n))
        })
      }
    case 'move':
      return {
        ...state,
        project: touch({
          ...state.project,
          nodes: state.project.nodes.map((n) => (n.id === action.id ? { ...n, x: action.x, y: action.y } : n))
        })
      }
    case 'resize':
      return {
        ...state,
        project: touch({
          ...state.project,
          nodes: state.project.nodes.map((n) => (n.id === action.id ? { ...n, w: action.w, h: action.h } : n))
        })
      }
    case 'removeNode': {
      const nodes = state.project.nodes.filter((n) => n.id !== action.id)
      const edges = state.project.edges.filter((e) => e.from !== action.id && e.to !== action.id)
      return { ...state, selectedId: state.selectedId === action.id ? null : state.selectedId, project: touch({ ...state.project, nodes, edges }) }
    }
    case 'addEdge': {
      // 同 kind 同 to 去重
      const exists = state.project.edges.some(
        (e) => e.to === action.to && e.kind === action.kind && e.from === action.from
      )
      if (exists) return state
      const edge: Edge = { id: uid(), from: action.from, to: action.to, kind: action.kind }
      return { ...state, project: touch({ ...state.project, edges: [...state.project.edges, edge] }) }
    }
    case 'removeEdge':
      return {
        ...state,
        project: touch({ ...state.project, edges: state.project.edges.filter((e) => e.id !== action.id) })
      }
    case 'setMeta':
      return { ...state, project: touch({ ...state.project, ...action.patch }) }
    case 'applyStoryboard': {
      const board = action.board
      const nodes: CanvasNode[] = []
      const edges: Edge[] = []
      const labelToId = new Map<string, string>()

      // 参考图节点（左列排布）
      const refs = board.references || []
      refs.forEach((r, i) => {
        const id = uid()
        labelToId.set(r.label.toLowerCase(), id)
        nodes.push({
          id,
          type: 'reference',
          x: 40,
          y: 40 + i * 250,
          w: 190,
          h: 230,
          title: r.label,
          prompt: r.prompt,
          refType: (r.type as RefType) || 'character',
          refLabel: r.label,
          status: 'idle'
        })
      })
      // 角色名也映射到其定妆图
      ;(board.characters || []).forEach((c) => {
        const hit = nodes.find((n) => n.refType === 'character' && n.refLabel?.includes(c.name))
        if (hit) labelToId.set(c.name.toLowerCase(), hit.id)
      })

      // 分镜（视频）节点（右侧网格）
      const shots = board.shots || []
      shots.forEach((s, i) => {
        const id = uid()
        const col = i % 4
        const row = Math.floor(i / 4)
        const matchRef = (label?: string) => {
          if (!label) return undefined
          return labelToId.get(label.toLowerCase())
        }
        const ff = matchRef(s.firstFrameRef)
        const lf = matchRef(s.lastFrameRef)
        nodes.push({
          id,
          type: 'video',
          x: 300 + col * 270,
          y: 40 + row * 250,
          w: 240,
          h: 210,
          title: s.title || `分镜 ${i + 1}`,
          prompt: s.promptEn || '',
          promptEn: s.promptEn,
          durationSec: s.durationSec || 8,
          cameraMotion: (s.cameraMotion as CameraMotion) || 'none',
          shotIndex: i + 1,
          audioHint: s.audioHint,
          firstFrameNodeId: ff,
          lastFrameNodeId: lf && lf !== ff ? lf : undefined,
          status: 'idle'
        })
      })

      const project: DirectorProject = touch({
        ...state.project,
        title: board.title || state.project.title,
        style: board.style || '',
        durationSec: board.durationSec || 0,
        emotionArc: board.emotionArc || '',
        nodes,
        edges
      })
      return { project, selectedId: null }
    }
    default:
      return state
  }
}

interface Ctx {
  state: State
  project: DirectorProject
  selectedId: string | null
  selectedNode: CanvasNode | null
  supabaseOn: boolean
  // actions
  load: (p: DirectorProject) => void
  reset: () => void
  select: (id: string | null) => void
  addNode: (node: CanvasNode) => void
  updateNode: (id: string, patch: Partial<CanvasNode>) => void
  removeNode: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, w: number, h: number) => void
  addEdge: (from: string, to: string, kind: Edge['kind']) => void
  removeEdge: (id: string) => void
  setMeta: (patch: Partial<DirectorProject>) => void
  applyStoryboard: (board: DirectorStoryboard) => void
}

const StoreContext = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const loaded = loadProjectLocal()
    return { project: loaded || emptyProject(), selectedId: null }
  })

  useEffect(() => {
    saveProjectLocal(state.project)
  }, [state.project])

  const value = useMemo<Ctx>(
    () => ({
      state,
      project: state.project,
      selectedId: state.selectedId,
      selectedNode: state.project.nodes.find((n) => n.id === state.selectedId) || null,
      supabaseOn: supabaseConfigured(),
      load: (p) => dispatch({ type: 'load', project: p }),
      reset: () => dispatch({ type: 'reset' }),
      select: (id) => dispatch({ type: 'select', id }),
      addNode: (node) => dispatch({ type: 'addNode', node }),
      updateNode: (id, patch) => dispatch({ type: 'updateNode', id, patch }),
      removeNode: (id) => dispatch({ type: 'removeNode', id }),
      move: (id, x, y) => dispatch({ type: 'move', id, x, y }),
      resize: (id, w, h) => dispatch({ type: 'resize', id, w, h }),
      addEdge: (from, to, kind) => dispatch({ type: 'addEdge', from, to, kind }),
      removeEdge: (id) => dispatch({ type: 'removeEdge', id }),
      setMeta: (patch) => dispatch({ type: 'setMeta', patch }),
      applyStoryboard: (board) => dispatch({ type: 'applyStoryboard', board })
    }),
    [state]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Ctx {
  const c = useContext(StoreContext)
  if (!c) throw new Error('useStore must be used within StoreProvider')
  return c
}
