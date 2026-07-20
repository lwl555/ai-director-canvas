import { useRef } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { uid } from '../lib/id'
import { REF_TYPE_LABEL, type CanvasNode, type RefType } from '../types'

const STYLE_PRESETS = [
  '赛博朋克', '清新治愈', '国风奇幻', '电影质感', '复古胶片', '暗黑哥特', '霓虹都市', '水彩手绘'
]

function spawnPos(nodes: CanvasNode[]) {
  const base = 300 + (nodes.length % 5) * 40
  return { x: base, y: 60 + (nodes.length % 6) * 30 }
}

export default function LeftSidebar() {
  const { project, addNode, updateNode, setMeta } = useStore()
  const { generateImage } = useGenerator()
  const fileRef = useRef<HTMLInputElement>(null)

  const refs = project.nodes.filter((n) => n.type === 'reference')
  const videos = project.nodes.filter((n) => n.type === 'video')

  const addImage = () => {
    const p = spawnPos(project.nodes)
    addNode({
      id: uid(), type: 'image', x: p.x, y: p.y, w: 200, h: 200,
      title: '文生图', prompt: '', status: 'idle', model: 'agnes-image-2.1-flash', size: '1024x768'
    })
  }
  const addVideo = () => {
    const p = spawnPos(project.nodes)
    addNode({
      id: uid(), type: 'video', x: p.x, y: p.y, w: 240, h: 210,
      title: '分镜', prompt: '', promptEn: '', durationSec: 8, cameraMotion: 'none',
      size: '768x1152', numFrames: 121, frameRate: 24, status: 'idle'
    })
  }
  const addReference = () => {
    const p = spawnPos(project.nodes)
    addNode({
      id: uid(), type: 'reference', x: 40, y: 40 + refs.length * 250, w: 190, h: 230,
      title: '新参考图', prompt: '', refType: 'character', refLabel: '参考' + (refs.length + 1), status: 'idle'
    })
  }
  const addText = () => {
    const p = spawnPos(project.nodes)
    addNode({
      id: uid(), type: 'text', x: p.x, y: p.y, w: 200, h: 120,
      title: '备注', text: '在此写分镜说明 / 旁白…'
    })
  }

  const uploadLocal = (nodeId: string, file: File) => {
    const reader = new FileReader()
    reader.onload = () => updateNode(nodeId, { imageUrl: String(reader.result), status: 'done' })
    reader.readAsDataURL(file)
  }

  return (
    <aside className="leftbar">
      <section className="lb-section">
        <h3>工具箱</h3>
        <div className="tool-grid">
          <button className="tool" onClick={addVideo}>🎬 分镜（视频）</button>
          <button className="tool" onClick={addImage}>🖼️ 文生图</button>
          <button className="tool" onClick={addReference}>🎭 参考图</button>
          <button className="tool" onClick={addText}>📝 文本备注</button>
        </div>
      </section>

      <section className="lb-section grow">
        <h3>参考图库 <span className="hint">拖端口→分镜首/尾帧</span></h3>
        <div className="ref-list">
          {refs.length === 0 && <p className="empty">还没有参考图。点上方「参考图」添加，或用「智能导演」自动生成角色定妆/场景/道具。</p>}
          {refs.map((r) => (
            <div key={r.id} className="ref-card">
              <div className="ref-thumb">
                {r.imageUrl ? <img src={r.imageUrl} alt={r.title} /> : <span className="ref-ph">{REF_TYPE_LABEL[r.refType || 'character']}</span>}
              </div>
              <div className="ref-info">
                <div className="ref-title">{r.title}</div>
                <div className="ref-badge">{REF_TYPE_LABEL[r.refType || 'character']}</div>
                <div className="ref-actions">
                  <button className="mini" onClick={() => generateImage(r)} disabled={r.status === 'pending'}>
                    {r.status === 'pending' ? '生成中' : r.imageUrl ? '重生成' : '生成'}
                  </button>
                  <button className="mini" onClick={() => fileRef.current?.click()}>上传</button>
                  <input
                    ref={fileRef} type="file" accept="image/*" hidden
                    onChange={(e) => e.target.files?.[0] && uploadLocal(r.id, e.target.files[0])}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="lb-section">
        <h3>风格预设</h3>
        <div className="preset-row">
          {STYLE_PRESETS.map((s) => (
            <button
              key={s}
              className={`preset ${project.style === s ? 'active' : ''}`}
              onClick={() => setMeta({ style: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="lb-section">
        <div className="lb-tip">
          已生成 <b>{videos.length}</b> 个分镜 · 参考图 <b>{refs.length}</b> 张
        </div>
      </section>
    </aside>
  )
}
