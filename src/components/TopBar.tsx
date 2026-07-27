import { useState } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { loadLatestProjectSupabase } from '../lib/persistence'

export default function TopBar({
  onToggleDirector,
  directorOpen
}: {
  onToggleDirector: () => void
  directorOpen: boolean
}) {
  const { project, setMeta, reset, supabaseOn, load } = useStore()
  const { generateAllVideos } = useGenerator()
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const onGenAll = async () => {
    setBusy(true)
    try {
      await generateAllVideos()
    } finally {
      setBusy(false)
    }
  }

  const onRestore = async () => {
    if (!confirm('从云端恢复会覆盖当前画布（本地自动保存的内容），确定继续？')) return
    setRestoring(true)
    try {
      const p = await loadLatestProjectSupabase()
      if (p) load(p)
      else alert('云端没有可恢复的工程。')
    } finally {
      setRestoring(false)
    }
  }

  const onExport = () => {
    // 导出 XML（Premiere 兼容 FCPXML 简化版）+ 视频清单
    const xml = buildFcpXml(project)
    const blob = new Blob([xml], { type: 'application/xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${project.title || 'director'}.xml`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">
          <span className="mark" />
          导演画布
          <span className="sub">Director</span>
        </span>
        <input
          className="title-input"
          value={project.title}
          onChange={(e) => setMeta({ title: e.target.value })}
          placeholder="作品标题"
        />
        {supabaseOn && (
          <button className="btn btn-ghost cloud-restore" onClick={onRestore} disabled={restoring} title="从云端恢复最近一次保存的工程">
            {restoring ? '恢复中…' : '从云端恢复'}
          </button>
        )}
      </div>
      <div className="topbar-right">
        <button className={`btn ${directorOpen ? 'btn-active' : ''}`} onClick={onToggleDirector}>
          智能导演
        </button>
        <button className="btn btn-primary" onClick={onGenAll} disabled={busy}>
          {busy ? '生成中…' : '生成全部视频'}
        </button>
        <div className="menu-wrap">
          <button className="btn" onClick={() => setMenuOpen((v) => !v)}>
            导出
          </button>
          {menuOpen && (
            <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={onExport}>导出 XML 工程 (Premiere)</button>
              <button onClick={() => exportVideoList(project)}>导出视频清单 (JSON)</button>
            </div>
          )}
        </div>
        <button className="btn btn-ghost" onClick={() => { if (confirm('确定清空当前画布？')) reset() }}>
          新建
        </button>
      </div>
    </header>
  )
}

function buildFcpXml(project: ReturnType<typeof useStore>['project']): string {
  const vids = project.videos.filter((v) => v.inTimeline)
  const sortKey = (v: { timelineStart?: number; shotId: string }) =>
    v.timelineStart ?? (project.shots.find((s) => s.id === v.shotId)?.index ?? 0) * 10
  const ordered = [...vids].sort((a, b) => sortKey(a) - sortKey(b))
  let cursor = 0
  const clips = ordered
    .map((v) => {
      const start = cursor
      cursor += v.durationSec
      const url = (v.variants ?? []).find((vt) => vt.id === v.activeVariantId)?.videoUrl || (v.variants ?? [])[0]?.videoUrl || ''
      return `  <clipitem id="clip-${v.id}">
    <name>${escapeXml(v.title)}</name>
    <duration>${Math.round(v.durationSec * 30)}</duration>
    <start>${Math.round(start * 30)}</start>
    <end>${Math.round((start + v.durationSec) * 30)}</end>
    <media>
      <video>
        <filepath>${escapeXml(url)}</filepath>
      </video>
    </media>
  </clipitem>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml>
  <project name="${escapeXml(project.title)}">
    <sequence duration="${Math.round(project.durationSec * 30)}">
${clips}
    </sequence>
  </project>
</fcpxml>`
}

function escapeXml(s: string): string {
  return (s || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c))
}

function exportVideoList(project: ReturnType<typeof useStore>['project']) {
  const list = project.videos.map((v) => ({
    title: v.title,
    shotIndex: project.shots.find((s) => s.id === v.shotId)?.index,
    durationSec: v.durationSec,
    url: (v.variants ?? []).find((vt) => vt.id === v.activeVariantId)?.videoUrl || (v.variants ?? [])[0]?.videoUrl || null
  }))
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${project.title || 'director'}-videos.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
