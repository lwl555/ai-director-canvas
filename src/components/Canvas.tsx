import { useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import type { CanvasNode, Edge } from '../types'

interface Connecting {
  from: string
  x: number
  y: number
}

function deriveEdges(nodes: CanvasNode[]): Edge[] {
  const out: Edge[] = []
  for (const n of nodes) {
    if (n.type !== 'video') continue
    if (n.firstFrameNodeId)
      out.push({ id: 'e-ff-' + n.id, from: n.firstFrameNodeId, to: n.id, kind: 'first_frame' })
    if (n.lastFrameNodeId)
      out.push({ id: 'e-lf-' + n.id, from: n.lastFrameNodeId, to: n.id, kind: 'last_frame' })
  }
  return out
}

function portPos(node: CanvasNode, side: 'out' | 'first' | 'last') {
  if (side === 'out') return { x: node.x + node.w, y: node.y + node.h / 2 }
  if (side === 'first') return { x: node.x, y: node.y + node.h * 0.35 }
  return { x: node.x, y: node.y + node.h * 0.65 }
}

function NodeView({
  node,
  selected,
  onSelect,
  onMove,
  onResize,
  onStartConnect,
  onEndConnect
}: {
  node: CanvasNode
  selected: boolean
  onSelect: (id: string) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, w: number, h: number) => void
  onStartConnect: (fromId: string, cx: number, cy: number) => void
  onEndConnect: (toId: string, kind: 'first_frame' | 'last_frame') => void
}) {
  const { generateImage, generateVideo } = useGenerator()
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; mode: 'move' | 'resize' } | null>(null)

  const onMoveHandler = (e: MouseEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (d.mode === 'move') onMove(node.id, Math.max(0, d.ox + dx), Math.max(0, d.oy + dy))
    else onResize(node.id, Math.max(140, d.ox + dx), Math.max(100, d.oy + dy))
  }
  const stop = () => {
    drag.current = null
    window.removeEventListener('mousemove', onMoveHandler)
    window.removeEventListener('mouseup', stop)
  }
  const startMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    onSelect(node.id)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y, mode: 'move' }
    window.addEventListener('mousemove', onMoveHandler)
    window.addEventListener('mouseup', stop)
  }
  const startResize = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    drag.current = { sx: e.clientX, sy: e.clientY, ox: node.w, oy: node.h, mode: 'resize' }
    window.addEventListener('mousemove', onMoveHandler)
    window.addEventListener('mouseup', stop)
  }

  return (
    <div
      className={`node t-${node.type} ${selected ? 'selected' : ''}`}
      style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
      onMouseDown={startMove}
    >
      <div className="node-head">
        <span className="node-title">{node.title}</span>
        {node.status === 'processing' && <span className="spin">⏳</span>}
        {node.status === 'pending' && <span className="spin">◌</span>}
        {node.status === 'done' && <span className="ok-dot">✓</span>}
        {node.status === 'failed' && <span className="bad-dot">!</span>}
      </div>

      <div className="node-body">
        {node.type === 'text' && <div className="node-text">{node.text}</div>}

        {(node.type === 'image' || node.type === 'reference') &&
          (node.imageUrl ? (
            <img className="node-img" src={node.imageUrl} alt={node.title} draggable={false} />
          ) : (
            <div className="node-ph">
              <span>{node.type === 'reference' ? '参考图' : '图片'}</span>
              <button className="mini" onClick={(e) => { e.stopPropagation(); generateImage(node) }} disabled={!node.prompt?.trim()}>
                {node.prompt?.trim() ? '生成' : '先写提示词'}
              </button>
            </div>
          ))}

        {node.type === 'video' &&
          (node.videoUrl ? (
            <video className="node-video" src={node.videoUrl} controls preload="metadata" />
          ) : node.imageUrl ? (
            <img className="node-img" src={node.imageUrl} alt={node.title} draggable={false} />
          ) : (
            <div className="node-ph">
              <span>分镜 · {node.durationSec || 0}s</span>
              <button className="mini" onClick={(e) => { e.stopPropagation(); generateVideo(node) }} disabled={!node.promptEn?.trim()}>
                {node.promptEn?.trim() ? '生成视频' : '先写提示词'}
              </button>
            </div>
          ))}
      </div>

      {/* 端口 */}
      {node.type === 'reference' && (
        <div
          className="port out"
          title="拖到分镜的「首/尾」端口设为关键帧"
          onMouseDown={(e) => { e.stopPropagation(); onStartConnect(node.id, e.clientX, e.clientY) }}
        />
      )}
      {node.type === 'video' && (
        <>
          <div className="port in first" title="首帧关键帧" onMouseUp={(e) => { e.stopPropagation(); onEndConnect(node.id, 'first_frame') }} />
          <div className="port in last" title="尾帧关键帧" onMouseUp={(e) => { e.stopPropagation(); onEndConnect(node.id, 'last_frame') }} />
        </>
      )}

      <div className="resize-handle" onMouseDown={startResize} />
    </div>
  )
}

export default function Canvas() {
  const { project, selectedId, select, move, resize, updateNode } = useStore()
  const innerRef = useRef<HTMLDivElement>(null)
  const [connecting, setConnecting] = useState<Connecting | null>(null)
  const connectingRef = useRef<{ from: string } | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const clientToCanvas = (cx: number, cy: number) => {
    const r = innerRef.current!.getBoundingClientRect()
    return { x: cx - r.left, y: cy - r.top }
  }

  const onStartConnect = (fromId: string, cx: number, cy: number) => {
    const p = clientToCanvas(cx, cy)
    connectingRef.current = { from: fromId }
    setConnecting({ from: fromId, x: p.x, y: p.y })
    const move = (e: MouseEvent) => {
      const q = clientToCanvas(e.clientX, e.clientY)
      setConnecting((c) => (c ? { ...c, x: q.x, y: q.y } : c))
    }
    const up = () => {
      connectingRef.current = null
      setConnecting(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      cleanupRef.current = null
    }
    cleanupRef.current = up
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const onEndConnect = (toId: string, kind: 'first_frame' | 'last_frame') => {
    const c = connectingRef.current
    if (c) updateNode(toId, kind === 'first_frame' ? { firstFrameNodeId: c.from } : { lastFrameNodeId: c.from })
    if (cleanupRef.current) cleanupRef.current()
  }

  const edges = deriveEdges(project.nodes)
  const nodeById = (id: string) => project.nodes.find((n) => n.id === id)

  return (
    <div className="canvas-scroll" onMouseDown={() => select(null)}>
      <div className="canvas-inner" ref={innerRef} style={{ width: 4000, height: 3000 }}>
        <svg className="edges">
          {edges.map((e) => {
            const from = nodeById(e.from)
            const to = nodeById(e.to)
            if (!from || !to) return null
            const a = portPos(from, 'out')
            const b = portPos(to, e.kind === 'first_frame' ? 'first' : 'last')
            const d = `M ${a.x} ${a.y} C ${a.x + 90} ${a.y}, ${b.x - 90} ${b.y}, ${b.x} ${b.y}`
            return <path key={e.id} d={d} className={`edge ${e.kind}`} />
          })}
          {connecting && (() => {
            const from = nodeById(connecting.from)
            if (!from) return null
            const a = portPos(from, 'out')
            return <path d={`M ${a.x} ${a.y} C ${a.x + 90} ${a.y}, ${connecting.x - 90} ${connecting.y}, ${connecting.x} ${connecting.y}`} className="edge connecting" />
          })()}
        </svg>

        {project.nodes.length === 0 && (
          <div className="canvas-empty">
            <div className="ce-art">🎬</div>
            <h2>开始你的 AI 导演画布</h2>
            <p>点左上「✨ 智能导演」输入创意，自动生成角色定妆 / 场景 / 道具 + 分镜视频节点；<br/>或左侧工具箱手动添加节点，拖拽端口连接关键帧。</p>
          </div>
        )}

        {project.nodes.map((n) => (
          <NodeView
            key={n.id}
            node={n}
            selected={n.id === selectedId}
            onSelect={select}
            onMove={move}
            onResize={resize}
            onStartConnect={onStartConnect}
            onEndConnect={onEndConnect}
          />
        ))}
      </div>
    </div>
  )
}
