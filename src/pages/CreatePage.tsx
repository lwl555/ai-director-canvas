import { useState } from 'react'
import { agnesImage } from '../lib/agnes'

export default function CreatePage() {
  const [prompt, setPrompt] = useState('')
  const [img, setImg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function gen() {
    const p = prompt.trim()
    if (!p || busy) return
    setBusy(true)
    setErr('')
    try {
      const url = await agnesImage(p)
      setImg(url)
    } catch (e: any) {
      setErr(e?.message || '生成失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="create">
      <h2 className="page-title">创作工坊 · 生图</h2>
      <p className="muted">
        输入提示词，由 Agnes 生图（无需填 Key，开箱即用）。更复杂的分镜 / 生视频请到左侧「画布」。
      </p>
      <div className="create-panel">
        <h3>文生图</h3>
        <div className="create-row">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：赛博朋克风格的未来城市夜景，霓虹灯，雨中，电影感，8k"
          />
          <button className="btn-primary" onClick={gen} disabled={busy}>
            {busy ? '生成中…' : '生成'}
          </button>
        </div>
        {err && (
          <div className="chat-error" style={{ margin: '12px 0 0' }}>
            {err}
          </div>
        )}
        {img && (
          <div className="create-result">
            <img src={img} alt="生成结果" />
            <div className="create-preview">右击图片可保存。换一张只需修改提示词再点生成。</div>
          </div>
        )}
      </div>
    </div>
  )
}
