import { useState, useRef } from 'react'
import { agnesImage, agnesVideoCreate, agnesVideoStatus, agnesChat } from '../lib/agnes'

type Tab = 'image' | 'video' | 'doc'

export default function CreatePage() {
  const [tab, setTab] = useState<Tab>('image')

  return (
    <div className="create">
      <h2 className="page-title">创作工坊</h2>
      <p className="muted">由 Agnes 驱动的 AI 创作工具，无需填 Key，开箱即用。更复杂的分镜 / 生视频请到左侧「画布」。</p>

      <div className="create-tabs">
        <button className={`tab ${tab === 'image' ? 'active' : ''}`} onClick={() => setTab('image')}>🎨 文生图</button>
        <button className={`tab ${tab === 'video' ? 'active' : ''}`} onClick={() => setTab('video')}>🎬 文生视频</button>
        <button className={`tab ${tab === 'doc' ? 'active' : ''}`} onClick={() => setTab('doc')}>📄 文档解析</button>
      </div>

      {tab === 'image' && <ImageGen />}
      {tab === 'video' && <VideoGen />}
      {tab === 'doc' && <DocParse />}
    </div>
  )
}

function ImageGen() {
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
      {err && <div className="chat-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      {img && (
        <div className="create-result">
          <img src={img} alt="生成结果" />
          <div className="create-preview">右击图片可保存。换一张只需修改提示词再点生成。</div>
        </div>
      )}
    </div>
  )
}

function VideoGen() {
  const [prompt, setPrompt] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function gen() {
    const p = prompt.trim()
    if (!p || busy) return
    setBusy(true)
    setErr('')
    setVideoUrl('')
    setStatus('创建视频任务…')
    try {
      const result = await agnesVideoCreate({ prompt: p })
      const videoId = result.video_id
      const taskId = result.task_id
      if (!videoId && !taskId) throw new Error('视频创建未返回 ID')
      setStatus('排队中…（免费档每分钟限 1 个请求）')

      // 轮询
      const poll = async () => {
        try {
          const st = await agnesVideoStatus(videoId, taskId)
          if (st.status === 'completed' || st.status === 'done' || st.status === 'succeeded') {
            if (st.video_url) {
              setVideoUrl(st.video_url)
              setStatus('')
              setBusy(false)
            } else {
              setStatus('完成但未返回 URL，请重试')
              setBusy(false)
            }
          } else if (st.status === 'failed') {
            setStatus('')
            setErr('视频生成失败，请修改提示词后重试')
            setBusy(false)
          } else {
            setStatus(`生成中…（${st.status}）`)
            pollRef.current = setTimeout(poll, 20_000)
          }
        } catch (e: any) {
          setStatus('')
          setErr(e?.message || '查询状态失败')
          setBusy(false)
        }
      }
      pollRef.current = setTimeout(poll, 15_000)
    } catch (e: any) {
      setErr(e?.message || '创建视频失败，请重试')
      setStatus('')
      setBusy(false)
    }
  }

  function cancel() {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
    setBusy(false)
    setStatus('')
  }

  return (
    <div className="create-panel">
      <h3>文生视频</h3>
      <div className="create-warn">⚠️ 免费档每分钟限 1 个视频请求，生成约需 1-3 分钟。请耐心等待。</div>
      <div className="create-row">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="例如：一只猫在窗台上伸懒腰，阳光透过窗帘，温馨，电影感"
          rows={3}
        />
        <button className="btn-primary" onClick={gen} disabled={busy}>
          {busy ? '生成中' : '生成视频'}
        </button>
      </div>
      {busy && (
        <button className="btn-ghost" style={{ marginTop: 8 }} onClick={cancel}>取消</button>
      )}
      {status && (
        <div className="create-status">
          <div className="gen-spinner" style={{ margin: '0 auto 8px' }} />
          <span>{status}</span>
        </div>
      )}
      {err && <div className="chat-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      {videoUrl && (
        <div className="create-result">
          <video src={videoUrl} controls style={{ width: '100%', borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)' }} />
          <div className="create-preview">右击视频可保存。修改提示词可重新生成。</div>
        </div>
      )}
    </div>
  )
}

function DocParse() {
  const [text, setText] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 100_000) {
      setErr('文件过大（>100KB），请粘贴文本内容或使用更小的文件')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result || ''))
      setErr('')
    }
    reader.readAsText(f)
  }

  async function analyze() {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    setErr('')
    setSummary('')
    try {
      const sys = '你是一个文档分析助手。请对用户提供的文本进行结构化分析：\n1. 一句话总结\n2. 关键要点（3-5条）\n3. 适合的用途建议\n\n用中文回答，格式清晰。'
      const reply = await agnesChat(
        [
          { role: 'system', content: sys },
          { role: 'user', content: t.slice(0, 8000) }
        ],
        'agnes-2.0-flash'
      )
      setSummary(reply)
    } catch (e: any) {
      setErr(e?.message || '分析失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="create-panel">
      <h3>文档解析</h3>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>上传 .txt/.md 文件或直接粘贴文本，AI 自动总结关键要点。支持中英文。</p>
      <div className="create-row" style={{ marginBottom: 8 }}>
        <input ref={fileRef} type="file" accept=".txt,.md,.text,text/*" onChange={onFile} style={{ display: 'none' }} />
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>📁 选择文件</button>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>{text ? `${text.length} 字` : '或直接粘贴'}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="粘贴或输入要分析的文本内容…"
        rows={8}
        style={{ width: '100%', background: 'var(--ink-800)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', color: 'var(--text)', padding: '10px', fontSize: '13px', fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
      />
      <button className="btn-primary" style={{ marginTop: 10 }} onClick={analyze} disabled={busy || !text.trim()}>
        {busy ? '分析中…' : '🔍 AI 分析'}
      </button>
      {err && <div className="chat-error" style={{ margin: '12px 0 0' }}>{err}</div>}
      {summary && (
        <div className="doc-result">
          <h4>分析结果</h4>
          <div className="doc-summary">{summary}</div>
        </div>
      )}
    </div>
  )
}
