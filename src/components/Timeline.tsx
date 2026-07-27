import { useStore } from '../store'
import type { VideoNode } from '../types'

export default function Timeline() {
  const { project, updateVideo, select } = useStore()
  const videos = project.videos.filter((v) => v.inTimeline)

  // 按时间轴顺序排列：用户拖动的 timelineStart 优先，否则按分镜 index 兜底
  const sortKey = (v: VideoNode) =>
    v.timelineStart ?? (project.shots.find((s) => s.id === v.shotId)?.index ?? 0) * 10
  const ordered = [...videos].sort((a, b) => sortKey(a) - sortKey(b))

  const total = ordered.reduce((sum, v) => sum + v.durationSec, 0)

  const move = (id: string, dir: -1 | 1) => {
    const idx = ordered.findIndex((v) => v.id === id)
    const swap = ordered[idx + dir]
    if (!swap) return
    // 交换 shotId 对应的 index 顺序：通过 timelineStart 调整
    const aStart = ordered[idx].timelineStart ?? idx * 10
    const bStart = swap.timelineStart ?? (idx + dir) * 10
    updateVideo(ordered[idx].id, { timelineStart: bStart })
    updateVideo(swap.id, { timelineStart: aStart })
  }

  return (
    <div className="timeline">
      <div className="timeline-head">
        <span>时间轴</span>
        <span className="tl-total">总长 {total}s · {ordered.length} 段</span>
      </div>
      <div className="timeline-track">
        {ordered.length === 0 && <div className="tl-empty">生成的视频会自动进入时间轴，可在此调序、导出。</div>}
        {ordered.map((v, i) => (
          <TimelineClip key={v.id} node={v} index={i} onSelect={() => select(v.id)} onMoveLeft={() => move(v.id, -1)} onMoveRight={() => move(v.id, 1)} />
        ))}
      </div>
    </div>
  )
}

function TimelineClip({
  node,
  index,
  onSelect,
  onMoveLeft,
  onMoveRight
}: {
  node: VideoNode
  index: number
  onSelect: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
}) {
  const active = (node.variants ?? []).find((v) => v.id === node.activeVariantId) || (node.variants ?? [])[0]
  const widthPct = Math.min(Math.max(node.durationSec * 4, 60), 400)
  return (
    <div className="tl-clip" style={{ width: widthPct }} onClick={onSelect}>
      <div className="tl-clip-head">
        <span className="tl-idx">{index + 1}</span>
        <span className="tl-title">{node.title}</span>
      </div>
      <div className="tl-clip-body">
        {active?.videoUrl ? (
          <video src={active.videoUrl} muted preload="metadata" />
        ) : (
          <div className="tl-ph">{active?.status === 'processing' ? '渲染中' : '未生成'}</div>
        )}
      </div>
      <div className="tl-clip-foot">
        <button onClick={(e) => { e.stopPropagation(); onMoveLeft() }}>◀</button>
        <span>{node.durationSec}s</span>
        <button onClick={(e) => { e.stopPropagation(); onMoveRight() }}>▶</button>
      </div>
    </div>
  )
}
