import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import type { AnyNode, RefNode, ShotNode, VideoNode } from '../types'

export default function InfiniteCanvas() {
  const { project, viewport, setViewport, select, selectedId, updateRef, updateShot, updateVideo, setMainRef, removeRef, removeShot, removeVideo } =
    useStore()
  const { generateRef, generateShotImage, generateVideoForShot } = useGenerator()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; kind: 'ref' | 'shot' | 'video'; offX: number; offY: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [panning, setPanning] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const allNodes: AnyNode[] = [...project.refs, ...project.shots, ...project.videos]

  // 屏幕坐标 → 画布坐标
  const toCanvas = useCallback(
    (sx: number, sy: number) => {
      const rect = containerRef.current!.getBoundingClientRect()
      return {
        x: (sx - rect.left - viewport.tx) / viewport.scale,
        y: (sy - rect.top - viewport.ty) / viewport.scale
      }
    },
    [viewport]
  )

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = -e.deltaY * 0.0015
    const newScale = Math.min(Math.max(viewport.scale * (1 + delta), 0.2), 2.5)
    // 以鼠标为中心缩放
    const tx = mx - ((mx - viewport.tx) * newScale) / viewport.scale
    const ty = my - ((my - viewport.ty) * newScale) / viewport.scale
    setViewport({ scale: newScale, tx, ty })
  }

  const onPointerDownBg = (e: React.PointerEvent) => {
    if (e.button === 1 || e.shiftKey || e.altKey) {
      // 平移
      panStartRef.current = { x: e.clientX, y: e.clientY, tx: viewport.tx, ty: viewport.ty }
      setPanning({ x: e.clientX, y: e.clientY, tx: viewport.tx, ty: viewport.ty })
      ;(e.target as Element).setPointerCapture(e.pointerId)
      return
    }
    // 框选
    const c = toCanvas(e.clientX, e.clientY)
    setSelBox({ x: c.x, y: c.y, w: 0, h: 0 })
    select(null)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (panning) {
      const dx = e.clientX - panning.x
      const dy = e.clientY - panning.y
      setViewport({ scale: viewport.scale, tx: panning.tx + dx, ty: panning.ty + dy })
      return
    }
    if (drag) {
      const c = toCanvas(e.clientX, e.clientY)
      // 仅更新本地瞬态位置，松手才提交到 store（避免每次移动都写 localStorage + 全量重渲）
      setDragPos({ x: c.x - drag.offX, y: c.y - drag.offY })
      return
    }
    if (selBox) {
      const c = toCanvas(e.clientX, e.clientY)
      setSelBox({ ...selBox, w: c.x - selBox.x, h: c.y - selBox.y })
    }
  }

  const onPointerUp = () => {
    if (drag && dragPos) {
      if (drag.kind === 'ref') updateRef(drag.id, { x: dragPos.x, y: dragPos.y })
      else if (drag.kind === 'shot') updateShot(drag.id, { x: dragPos.x, y: dragPos.y })
      else if (drag.kind === 'video') updateVideo(drag.id, { x: dragPos.x, y: dragPos.y })
    }
    setPanning(null)
    setDrag(null)
    setSelBox(null)
    setDragPos(null)
    panStartRef.current = null
  }

  const startNodeDrag = (e: React.PointerEvent, node: AnyNode) => {
    e.stopPropagation()
    const c = toCanvas(e.clientX, e.clientY)
    const kind = node.type === 'reference' ? 'ref' : node.type === 'shot' ? 'shot' : 'video'
    setDrag({ id: node.id, kind, offX: c.x - node.x, offY: c.y - node.y })
    setDragPos({ x: node.x, y: node.y })
    select(node.id)
  }

  const zoomBy = (factor: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const newScale = Math.min(Math.max(viewport.scale * factor, 0.2), 2.5)
    const tx = cx - ((cx - viewport.tx) * newScale) / viewport.scale
    const ty = cy - ((cy - viewport.ty) * newScale) / viewport.scale
    setViewport({ scale: newScale, tx, ty })
  }

  return (
    <div
      className="canvas-wrap"
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDownBg}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* 缩放控件 */}
      <div className="zoom-ctrl">
        <button onClick={() => zoomBy(1.2)}>＋</button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <button onClick={() => zoomBy(1 / 1.2)}>－</button>
        <button onClick={() => setViewport({ scale: 1, tx: 0, ty: 0 })} title="复位">⤢</button>
      </div>

      <div
        className="canvas-world"
        style={{
          transform: `translate(${viewport.tx}px, ${viewport.ty}px) scale(${viewport.scale})`,
          transformOrigin: '0 0'
        }}
      >
        {/* 网格背景 */}
        <div className="grid-bg" />

        {/* 关键帧连线 */}
        <svg className="edge-layer">
          {project.shots.filter(Boolean).map((s) => {
            const ff = s.firstFrameRefId ? project.refs.find((r) => r.id === s.firstFrameRefId) : undefined
            const lf = s.lastFrameRefId ? project.refs.find((r) => r.id === s.lastFrameRefId) : undefined
            return (
              <g key={s.id}>
                {ff && (
                  <line
                    className="edge edge-first"
                    x1={ff.x + 95}
                    y1={ff.y + 115}
                    x2={s.x}
                    y2={s.y + 60}
                  />
                )}
                {lf && (
                  <line
                    className="edge edge-last"
                    x1={lf.x + 95}
                    y1={lf.y + 115}
                    x2={s.x}
                    y2={s.y + 60}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* 节点 */}
        {project.refs.filter(Boolean).map((r) => (
          <RefCard key={r.id} node={r} pos={drag && dragPos && drag.id === r.id ? dragPos : undefined} onPointerDown={(e) => startNodeDrag(e, r)} selected={selectedId === r.id} onGenerate={() => generateRef(r)} onSetMain={() => setMainRef(r.id)} onRemove={() => removeRef(r.id)} />
        ))}
        {project.shots.filter(Boolean).map((s) => (
          <ShotCard key={s.id} node={s} pos={drag && dragPos && drag.id === s.id ? dragPos : undefined} onPointerDown={(e) => startNodeDrag(e, s)} selected={selectedId === s.id} onGenerate={() => generateShotImage(s)} onRemove={() => removeShot(s.id)} />
        ))}
        {project.videos.filter(Boolean).map((v) => (
          <VideoCard key={v.id} node={v} pos={drag && dragPos && drag.id === v.id ? dragPos : undefined} onPointerDown={(e) => startNodeDrag(e, v)} selected={selectedId === v.id} onGenerate={() => { const shot = project.shots.find((s) => s.id === v.shotId); if (shot) generateVideoForShot(shot) }} onRemove={() => removeVideo(v.id)} />
        ))}

        {/* 框选矩形 */}
        {selBox && (
          <div
            className="sel-box"
            style={{
              left: Math.min(selBox.x, selBox.x + selBox.w),
              top: Math.min(selBox.y, selBox.y + selBox.h),
              width: Math.abs(selBox.w),
              height: Math.abs(selBox.h)
            }}
          />
        )}
      </div>

      {allNodes.length === 0 && (
        <div className="canvas-empty">
          <div>空白画布</div>
          <p>打开右侧「智能导演」描述你的创意，或从左栏添加资产，开始创作。</p>
        </div>
      )}
    </div>
  )
}

function RefCard({
  node,
  pos,
  onPointerDown,
  selected,
  onGenerate,
  onSetMain,
  onRemove
}: {
  node: RefNode
  pos?: { x: number; y: number }
  onPointerDown: (e: React.PointerEvent) => void
  selected: boolean
  onGenerate: () => void
  onSetMain: () => void
  onRemove: () => void
}) {
  const proc = node.status === 'processing'
  const failed = node.status === 'failed'
  return (
    <div className={`node node-ref ${selected ? 'sel' : ''} ${node?.isMainRef ? 'main' : ''} ${proc ? 'processing' : ''} ${failed ? 'error' : ''}`} style={{ left: pos?.x ?? node.x, top: pos?.y ?? node.y }} onPointerDown={onPointerDown}>
      <div className="node-head">
        <span className="tag tag-ref">{node?.isMainRef ? '★主参考' : '定妆'}</span>
        <span className="node-title">{node.label}</span>
        <button className="node-x" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      </div>
      <div className="node-body" style={{ position: 'relative' }}>
        {node.imageUrl ? <img src={node.imageUrl} alt={node.label} draggable={false} /> : (
          <div className={`node-ph ${proc ? 'processing' : ''} ${failed ? 'error' : ''}`}>
            {proc ? (
              <>
                <div className="gen-spinner" />
                <span className="proc-label">生成中<span className="proc-dots" /></span>
              </>
            ) : failed ? (
              <span>{node.error || '生成失败'}</span>
            ) : (
              <span>无图</span>
            )}
          </div>
        )}
      </div>
      <div className="node-foot">
        <button className="btn-xs" onClick={(e) => { e.stopPropagation(); onSetMain() }}>{node?.isMainRef ? '取消主参考' : '设主参考'}</button>
        <button className="btn-xs" onClick={(e) => { e.stopPropagation(); onGenerate() }} disabled={proc}>
          {proc ? '生成中' : node.status === 'done' ? '重生成' : '生成图'}
        </button>
      </div>
    </div>
  )
}

function ShotCard({
  node,
  pos,
  onPointerDown,
  selected,
  onGenerate,
  onRemove
}: {
  node: ShotNode
  pos?: { x: number; y: number }
  onPointerDown: (e: React.PointerEvent) => void
  selected: boolean
  onGenerate: () => void
  onRemove: () => void
}) {
  const proc = node.status === 'processing'
  const failed = node.status === 'failed'
  return (
    <div className={`node node-shot ${selected ? 'sel' : ''} ${proc ? 'processing' : ''} ${failed ? 'error' : ''}`} style={{ left: pos?.x ?? node.x, top: pos?.y ?? node.y }} onPointerDown={onPointerDown}>
      <div className="node-head">
        <span className="tag tag-shot">分镜 {node.index}</span>
        <span className="node-title">{node.title}</span>
        <button className="node-x" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      </div>
      <div className="node-body" style={{ position: 'relative' }}>
        {node.imageUrl ? <img src={node.imageUrl} alt={node.title} draggable={false} /> : (
          <div className={`node-ph ${proc ? 'processing' : ''} ${failed ? 'error' : ''}`}>
            {proc ? (
              <>
                <div className="gen-spinner" />
                <span className="proc-label">生成定格<span className="proc-dots" /></span>
              </>
            ) : failed ? (
              <span>{node.error || '生成失败'}</span>
            ) : (
              <span>未生成</span>
            )}
          </div>
        )}
      </div>
      <div className="node-foot">
        <span className="meta">时长 {node.durationSec}s · {node.cameraMotion}</span>
        <button className="btn-xs" onClick={(e) => { e.stopPropagation(); onGenerate() }} disabled={proc}>
          {proc ? '生成中' : '生成定格'}
        </button>
      </div>
    </div>
  )
}

function VideoCard({
  node,
  pos,
  onPointerDown,
  selected,
  onGenerate,
  onRemove
}: {
  node: VideoNode
  pos?: { x: number; y: number }
  onPointerDown: (e: React.PointerEvent) => void
  selected: boolean
  onGenerate: () => void
  onRemove: () => void
}) {
  const active = (node.variants ?? []).find((v) => v.id === node.activeVariantId) || (node.variants ?? [])[0]
  const proc = active?.status === 'processing'
  const failed = active?.status === 'failed'
  const hasError = (node.variants ?? []).some((v) => v.status === 'failed' && v.error)
  return (
    <div className={`node node-video ${selected ? 'sel' : ''} ${proc ? 'processing' : ''} ${failed ? 'error' : ''}`} style={{ left: pos?.x ?? node.x, top: pos?.y ?? node.y }} onPointerDown={onPointerDown}>
      <div className="node-head">
        <span className="tag tag-video">视频</span>
        <span className="node-title">{node.title}</span>
        <button className="node-x" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      </div>
      <div className="node-body" style={{ position: 'relative' }}>
        {active?.videoUrl ? (
          <video src={active.videoUrl} controls preload="metadata" />
        ) : proc ? (
          <div className="node-ph processing">
            <div className="gen-spinner" />
            <span className="proc-label">视频生成中<span className="proc-dots" /></span>
          </div>
        ) : failed ? (
          <div className="node-ph error">
            <span>{active?.error || '生成失败'}</span>
          </div>
        ) : (
          <div className="node-ph">未生成</div>
        )}
        {(node.variants?.length ?? 0) > 1 && (
          <div className="variant-dots">
            {node.variants?.map((v, i) => (
              <span key={v.id} className={`dot ${v.id === active?.id ? 'on' : ''} ${v.status === 'failed' ? 'fail' : ''} ${v.status === 'processing' ? 'processing' : ''}`} title={`版本${i + 1}${v.status === 'processing' ? ' (生成中)' : v.status === 'failed' ? ' (失败)' : v.status === 'done' ? ' (完成)' : ''}`} />
            ))}
          </div>
        )}
      </div>
      <div className="node-foot">
        <span className="meta">{node.variants?.length ?? 0}版{hasError ? ' · ⚠有失败' : ''}</span>
        <button className="btn-xs" onClick={(e) => { e.stopPropagation(); onGenerate() }} disabled={proc}>
          {proc ? '生成中' : '生成新版本'}
        </button>
      </div>
    </div>
  )
}
