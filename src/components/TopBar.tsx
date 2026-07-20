import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'

export default function TopBar({
  onToggleDirector,
  directorOpen
}: {
  onToggleDirector: () => void
  directorOpen: boolean
}) {
  const { project, setMeta, reset, supabaseOn } = useStore()
  const { generateAllVideos } = useGenerator()
  const pendingVideos = project.nodes.filter((n) => n.type === 'video' && n.status !== 'done' && n.status !== 'processing')

  const onNew = () => {
    if (confirm('清空当前画布并新建作品？此操作不可撤销（本地自动保存会被覆盖）。')) reset()
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-dot" />
        <span className="brand-name">AI 导演画布</span>
        <span className="brand-sub">Director Canvas</span>
      </div>

      <input
        className="title-input"
        value={project.title}
        onChange={(e) => setMeta({ title: e.target.value })}
        placeholder="作品标题"
      />

      <div className="top-meta">
        <span className="chip">风格：{project.style || '未设定'}</span>
        <span className="chip">时长：{project.durationSec || '—'}s</span>
        {supabaseOn && <span className="chip ok">☁ 云端同步</span>}
      </div>

      <div className="top-actions">
        <button className={`btn ghost ${directorOpen ? 'active' : ''}`} onClick={onToggleDirector}>
          ✨ 智能导演
        </button>
        <button className="btn primary" onClick={generateAllVideos} disabled={pendingVideos.length === 0}>
          ▶ 生成全部视频{pendingVideos.length ? ` (${pendingVideos.length})` : ''}
        </button>
        <button className="btn ghost" onClick={onNew}>
          新建
        </button>
      </div>
    </header>
  )
}
