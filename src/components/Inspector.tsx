import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { CAMERA_LABEL, IMAGE_MODELS, SIZE_OPTIONS, REF_TYPE_LABEL, type CameraMotion, type RefType } from '../types'

export default function Inspector() {
  const { project, selectedId, selectedNode, updateNode, removeNode } = useStore()
  const { generateImage, generateVideo, translateToZh } = useGenerator()

  if (!selectedNode) {
    return (
      <aside className="inspector">
        <div className="inspector-empty">
          <div className="ie-icon">🎞️</div>
          <p>选中画布上的节点进行编辑</p>
          <p className="hint">提示：从参考图右侧端口拖到分镜左侧「首 / 尾」端口，可设置关键帧保证角色一致性。</p>
        </div>
      </aside>
    )
  }

  const n = selectedNode
  const frameCandidates = project.nodes.filter((x) => x.type === 'reference' || x.type === 'image')

  return (
    <aside className="inspector">
      <div className="insp-head">
        <span className={`type-pill t-${n.type}`}>{typeLabel(n.type)}</span>
        <button className="icon-btn" title="删除节点" onClick={() => removeNode(n.id)}>🗑</button>
      </div>

      <label className="field">
        <span>标题</span>
        <input value={n.title} onChange={(e) => updateNode(n.id, { title: e.target.value })} />
      </label>

      {(n.type === 'reference' || n.type === 'image') && (
        <>
          {n.type === 'reference' && (
            <label className="field">
              <span>参考类型</span>
              <select value={n.refType || 'character'} onChange={(e) => updateNode(n.id, { refType: e.target.value as RefType })}>
                {Object.entries(REF_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>生成提示词</span>
            <textarea rows={4} value={n.prompt} onChange={(e) => updateNode(n.id, { prompt: e.target.value })} placeholder="描述这张参考图…" />
          </label>
          <label className="field">
            <span>模型</span>
            <select value={n.model || 'agnes-image-2.1-flash'} onChange={(e) => updateNode(n.id, { model: e.target.value })}>
              {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>尺寸</span>
            <select value={n.size || '1024x768'} onChange={(e) => updateNode(n.id, { size: e.target.value })}>
              {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="insp-actions">
            <button className="btn primary" onClick={() => generateImage(n)} disabled={n.status === 'pending' || !n.prompt?.trim()}>
              {n.status === 'pending' ? '生成中…' : '生成 / 重生成图片'}
            </button>
          </div>
        </>
      )}

      {n.type === 'video' && (
        <>
          <label className="field">
            <span>英文视频提示词（promptEn）</span>
            <textarea rows={5} value={n.promptEn || ''} onChange={(e) => updateNode(n.id, { promptEn: e.target.value, prompt: n.prompt || e.target.value })} placeholder="英文提示词，含角色外貌/动作/场景/光影/镜头运动" />
          </label>
          <div className="insp-actions">
            <button className="btn ghost sm" onClick={() => translateToZh(n)}>译中文</button>
          </div>
          {n.prompt && <div className="zh-preview">中文：{n.prompt}</div>}

          <div className="field-row">
            <label className="field">
              <span>时长(秒)</span>
              <input type="number" min={1} max={16} value={n.durationSec || 8} onChange={(e) => updateNode(n.id, { durationSec: Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>镜头运动</span>
              <select value={n.cameraMotion || 'none'} onChange={(e) => updateNode(n.id, { cameraMotion: e.target.value as CameraMotion })}>
                {Object.entries(CAMERA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span>尺寸</span>
              <select value={n.size || '768x1152'} onChange={(e) => updateNode(n.id, { size: e.target.value })}>
                {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Seed</span>
              <input type="number" value={n.seed || 0} onChange={(e) => updateNode(n.id, { seed: Number(e.target.value) })} />
            </label>
          </div>

          <label className="field">
            <span>首帧关键帧</span>
            <select value={n.firstFrameNodeId || ''} onChange={(e) => updateNode(n.id, { firstFrameNodeId: e.target.value || undefined })}>
              <option value="">无</option>
              {frameCandidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span>尾帧关键帧</span>
            <select value={n.lastFrameNodeId || ''} onChange={(e) => updateNode(n.id, { lastFrameNodeId: e.target.value || undefined })}>
              <option value="">无</option>
              {frameCandidates.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>

          <label className="field">
            <span>声音/音乐提示</span>
            <input value={n.audioHint || ''} onChange={(e) => updateNode(n.id, { audioHint: e.target.value })} placeholder="如：轻快钢琴" />
          </label>

          <div className="insp-actions">
            <button className="btn primary" onClick={() => generateVideo(n)} disabled={n.status === 'processing' || !n.promptEn?.trim()}>
              {n.status === 'processing' ? '生成中…' : n.videoUrl ? '重新生成视频' : '生成视频'}
            </button>
          </div>
        </>
      )}

      {n.type === 'text' && (
        <label className="field">
          <span>文本内容</span>
          <textarea rows={5} value={n.text || ''} onChange={(e) => updateNode(n.id, { text: e.target.value })} />
        </label>
      )}

      {n.error && <div className="err-box">⚠ {n.error}</div>}
      {n.status && <div className="status-line">状态：{statusLabel(n.status)}</div>}
    </aside>
  )
}

function typeLabel(t: string) {
  return { image: '文生图', video: '分镜视频', reference: '参考图', text: '文本' }[t] || t
}
function statusLabel(s: string) {
  return { idle: '待生成', pending: '图片生成中', processing: '视频生成中', done: '已完成', failed: '失败' }[s] || s
}
