import { useState } from 'react'
import { useStore } from '../store'
import type { CanvasNode } from '../types'

export default function Timeline() {
  const { project, updateNode, select } = useStore()
  const [dragId, setDragId] = useState<string | null>(null)

  const shots = project.nodes
    .filter((n) => n.type === 'video')
    .sort((a, b) => (a.shotIndex || 0) - (b.shotIndex || 0))

  const total = shots.reduce((s, n) => s + (n.durationSec || 0), 0)

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return
    const ids = shots.map((s) => s.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    ids.forEach((id, i) => updateNode(id, { shotIndex: i + 1 }))
  }

  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="tl-title">🎞️ 分镜时间轴</span>
        <span className="tl-total">共 {shots.length} 镜 · {total}s</span>
        <span className="tl-hint">拖动卡片调整顺序（即梦式故事板）</span>
      </div>
      <div className="tl-track">
        {shots.length === 0 && <div className="tl-empty">还没有分镜。用「智能导演」生成，或在左侧添加「分镜（视频）」节点。</div>}
        {shots.map((s: CanvasNode) => (
          <div
            key={s.id}
            className={`tl-card ${dragId === s.id ? 'dragging' : ''} ${s.status === 'done' ? 'done' : ''}`}
            draggable
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(dragId!, s.id)}
            onClick={() => select(s.id)}
          >
            <div className="tl-idx">{s.shotIndex || '·'}</div>
            <div className="tl-thumb">
              {s.videoUrl ? (
                <video src={s.videoUrl} muted preload="metadata" />
              ) : s.imageUrl ? (
                <img src={s.imageUrl} alt={s.title} />
              ) : (
                <span className="tl-ph">{s.status === 'processing' ? '⏳' : s.status === 'failed' ? '⚠' : '🎬'}</span>
              )}
            </div>
            <div className="tl-meta">
              <div className="tl-name">{s.title}</div>
              <div className="tl-dur">{s.durationSec || 0}s</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
