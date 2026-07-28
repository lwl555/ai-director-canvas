import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useModel } from '../model/ModelContext'
import { sendChat } from '../lib/chat'
import type { ChatMsg } from '../lib/agnes'
import type { ModelProvider } from '../lib/modelRegistry'
import { PROVIDERS } from '../lib/modelRegistry'
import { Icon } from '../components/Icon'
import { MessageContent } from '../components/MessageContent'
import { SaveAppModal } from '../components/SaveAppModal'
import { FilePanel } from '../components/FilePanel'
import { collectProjectFiles } from '../lib/codeFiles'
import { fileToScaledDataUrl } from '../lib/imageUtil'
import { decodeFileText } from '../lib/textDecode'
import { parseFile, MAX_OFFICE_FILES, type ParsedFile } from '../lib/fileParse'
import { getDeviceId } from '../lib/deviceId'
import * as sync from '../lib/sync'

const OFFICE_URL = (import.meta.env.VITE_SUPABASE_URL || '') + '/functions/v1/office'

const SUGGESTIONS = [
  '帮我写一段周末出游的朋友圈文案',
  '用通俗的话解释一下什么是大模型',
  '把我这段笔记总结成 3 个要点',
  '帮我把下面这句话润色得更专业一些'
]

// 办公模式：对齐豆包「办公任务模式」的任务类型卡（点选后把模板填进输入框，可改后再发）。
// 强调三件事：跨文件分析、产出可下载成品（html/工程）、以及本平台独有的「生成应用」。
const OFFICE_TASKS = [
  { icon: '📝', label: '写文档/报告', prompt: '帮我写一份【主题】，按「背景 → 目标 → 要点 → 下一步」结构组织，正式职场语气。若已上传资料，请基于资料内容撰写。' },
  { icon: '📊', label: '数据分析', prompt: '请基于我上传的表格 / 数据做结构化分析：先给结论，再列关键发现（用表格），最后给建议。涉及计算请写明口径。' },
  { icon: '🔍', label: '跨文档核对', prompt: '请交叉核对我已上传的多份文件：检查数字 / 事实是否一致，用表格列出所有不一致或存疑的地方，并标注来源文件。' },
  { icon: '📑', label: '会议纪要', prompt: '帮我把下面的讨论（或上传的录音稿 / 资料）整理成会议纪要：议题、结论、待办事项（负责人 + 截止时间）、下一步。' },
  { icon: '📁', label: '调研报告', prompt: '请围绕【选题】做一份调研报告：核心数据、多方观点对比、风险与机会，并标注信息来源。' },
  { icon: '🌐', label: '专业翻译', prompt: '帮我把下面的内容专业地翻译（中英互译，保留语气与语境，歧义处给备选译法）：' },
  { icon: '📧', label: '写邮件/公文', prompt: '帮我写一封正式邮件 / 公文。先告诉我收件人角色、主题、核心要点，我来补充；或你先给出模板框架。' },
  { icon: '🛠️', label: '生成应用/网页', prompt: '帮我做一个【小工具 / 网页 / 应用】：说明用途与目标用户，直接输出可运行的多文件工程（用 语言:路径 代码块），我会一键打包下载。' }
]

// 办公模式任务状态文案
const OFFICE_STATUS_LABEL: Record<string, string> = {
  pending: '· 已排队',
  planning: '· 规划中',
  running: '· 执行中',
  generating: '· 生成成品中',
  done: '· 已完成 ✅',
  error: '· 出错 ⚠️'
}

const MAX_IMAGES = 4

function agentOf() {
  return sync.getCurrentAgent()
}
function aidOf() {
  return agentOf()?.id ?? 'general'
}
function brandOf(modelId: string): string {
  return PROVIDERS.find((p) => p.id === modelId)?.brand ?? modelId
}
function welcome(provider: ModelProvider, agent: ReturnType<typeof agentOf>): ChatMsg {
  if (agent) {
    return {
      role: 'assistant',
      content: `已进入「${agent.name}」智能体 ✨\n${agent.desc}\n\n我是${agent.name}，准备好啦，跟我说说你想做什么？`
    }
  }
  return {
    role: 'assistant',
    content: `你好呀，我是灵境，你的全能 AI 助手～ 当前由 ${provider.brand} 提供支持。无论是写点什么、想点子，还是单纯聊聊天，我都在。想从哪儿开始？`
  }
}
// 原生通知桥（仅安卓 App 内 window.AndroidApp 存在时生效；网页端静默忽略）
declare global {
  interface Window {
    AndroidApp?: { notify?: (title: string, body: string) => void }
  }
}
function notifyNative(title: string, body: string) {
  try {
    window.AndroidApp?.notify?.(title, body)
  } catch {
    /* 非安卓环境忽略 */
  }
}

function firstUserText(msgs: ChatMsg[]): string {
  const u = msgs.find((m) => m.role === 'user')
  if (u?.content) return u.content.slice(0, 24)
  if (u?.images?.length) return '📷 图片消息'
  if (u?.doc) return '📄 文档消息'
  return '新对话'
}
function timeAgo(ts: number): string {
  const d = Date.now() - ts
  const m = Math.floor(d / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const day = Math.floor(h / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString()
}
function lastSnippet(msgs: ChatMsg[]): string {
  const last = msgs[msgs.length - 1]
  return last ? (last.content || '📎 附件').replace(/\s+/g, ' ').slice(0, 42) : ''
}
function newAppId() {
  return 'app-' + Math.random().toString(36).slice(2, 10)
}

// 把 Markdown / 代码块去掉，提取纯文本用于语音朗读
function stripForSpeech(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[*_>#~=\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 找到 (model,agent) 对应线程；不创建
function findThreadKey(modelId: string, agentId: string): string | undefined {
  return sync.getAllThreads().find((t) => t.modelId === modelId && t.agentId === agentId)?.key
}
// 创建新线程（仅在 effect 中调用，绝不在渲染期）
function createThread(modelId: string, agentId: string, provider: ModelProvider): string {
  const key = 't-' + Math.random().toString(36).slice(2, 10)
  const agent = agentOf()
  sync.setThread({
    key,
    title: '新对话',
    customTitle: false,
    modelId,
    agentId,
    agentName: agent?.name,
    messages: [welcome(provider, agent)],
    updatedAt: Date.now()
  })
  sync.setCurrentThread(key)
  return key
}

export default function ChatPage() {
  const { modelId, provider } = useModel()
  const [, force] = useReducer((x: number) => x + 1, 0)

  // 初始线程解析：只读，不在此创建（避免 StrictMode 双建线程）
  const [threadKey, setThreadKey] = useState<string>(() => {
    const cur = sync.getCurrentThread()
    if (cur && sync.getThread(cur)) return cur
    return findThreadKey(modelId, aidOf()) ?? 'pending-init'
  })
  const [messages, setMessages] = useState<ChatMsg[]>(
    () => sync.getThread(threadKey)?.messages ?? [welcome(provider, agentOf())]
  )
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drawer, setDrawer] = useState(false)
  const [query, setQuery] = useState('')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saveCode, setSaveCode] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [showFiles, setShowFiles] = useState(false)
  // —— 新功能状态 ——
  const [pendingImages, setPendingImages] = useState<string[]>([]) // 待发送图片（data URL）
  const [pendingDoc, setPendingDoc] = useState<{ name: string; text: string } | null>(null) // 待发送文档
  const [ttsOn, setTtsOn] = useState(false) // AI 语音自动播报
  const [officeMode, setOfficeMode] = useState(false) // 办公模式（任务工作台）
  const [officeFiles, setOfficeFiles] = useState<ParsedFile[]>([]) // 文件舱
  const [officeJobId, setOfficeJobId] = useState<string | null>(null) // 后端任务 ID
  const [officeJob, setOfficeJob] = useState<any>(null) // 后端任务状态（plan/logs/artifacts）
  const [officeFormat, setOfficeFormat] = useState('') // 格式快选（空=自动）
  const [officeLength, setOfficeLength] = useState('适中') // 篇幅快选
  const [officeReading, setOfficeReading] = useState(false) // 文件读取中
  const [reading, setReading] = useState(false) // 文件读取中（图片/文档，普通模式）

  const imgInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const officeFileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const files = useMemo(() => collectProjectFiles(messages), [messages])

  useEffect(() => sync.subscribe(force), [])

  // 卸载时停止朗读，避免离开页面后仍出声
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel()
      } catch {}
    }
  }, [])

  // 挂载时确保存在线程（副作用放在 effect，不在渲染期）
  useEffect(() => {
    let k = threadKey
    if (!(k && k !== 'pending-init' && sync.getThread(k))) {
      const found = findThreadKey(modelId, aidOf())
      k = found ?? createThread(modelId, aidOf(), provider)
    }
    setThreadKey(k)
    setMessages(sync.getThread(k)?.messages ?? [welcome(provider, agentOf())])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换模型 → 切到该模型的最新线程（或新建）
  useEffect(() => {
    const cur = sync.getCurrentThread()
    let key: string
    if (cur && sync.getThread(cur)?.modelId === modelId) {
      key = cur
    } else {
      const found = findThreadKey(modelId, aidOf())
      key = found ?? createThread(modelId, aidOf(), provider)
    }
    setThreadKey(key)
    setMessages(sync.getThread(key)?.messages ?? [welcome(provider, agentOf())])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId])

  // 每次消息变化 → 写回当前线程（customTitle=true 时保留用户改的标题）
  useEffect(() => {
    sync.setThread({
      key: threadKey,
      title: firstUserText(messages),
      modelId,
      agentId: aidOf(),
      agentName: agentOf()?.name,
      messages,
      updatedAt: Date.now()
    })
  }, [messages, threadKey])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  // 办公模式：轮询后端任务状态（云端的 VM 在后台跑，前端定时拉取进度）
  useEffect(() => {
    if (!officeJobId) return
    let alive = true
    const id = setInterval(async () => {
      try {
        const did = getDeviceId()
        const r = await fetch(
          `${OFFICE_URL}?jobId=${encodeURIComponent(officeJobId)}&deviceId=${encodeURIComponent(did)}`
        )
        const data = await r.json()
        if (!alive) return
        if (data?.error) {
          setError(data.error)
          return
        }
        setOfficeJob(data)
        if (data.status === 'done' || data.status === 'error') {
          if (data.status === 'done') notifyNative('办公任务完成', String(data.task || '').slice(0, 60))
          clearInterval(id)
        }
      } catch {
        /* 网络抖动忽略，下个周期重试 */
      }
    }, 3000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [officeJobId])

  async function dispatchOfficeTask(task: string) {
    setError('')
    const did = getDeviceId()
    const files = officeFiles
      .filter((f) => !f.error && f.rawBase64)
      .map((f) => ({ name: f.name, content: f.rawBase64 }))
    setBusy(true)
    try {
      const res = await fetch(OFFICE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: did,
          task,
          files,
          model: provider.defaultModel,
          format: officeFormat || undefined,
          length: officeLength
        })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || '办公任务启动失败')
        return
      }
      setOfficeJobId(data.jobId)
      setOfficeJob({ status: 'pending', plan: [], logs: '', artifacts: [] })
      setInput('')
      setOfficeFiles([])
    } catch (e: any) {
      setError(e?.message || '办公任务启动失败（网络）')
    } finally {
      setBusy(false)
    }
  }

  async function downloadArtifact(path: string) {
    try {
      const did = getDeviceId()
      const r = await fetch(OFFICE_URL + '/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: did, path })
      })
      const data = await r.json()
      if (data?.url) window.open(data.url, '_blank')
      else setError(data?.error || '获取下载链接失败')
    } catch (e: any) {
      setError(e?.message || '下载失败')
    }
  }

  function speak(text: string) {
    try {
      if (!('speechSynthesis' in window)) return
      const plain = stripForSpeech(text).slice(0, 3000)
      if (!plain) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(plain)
      u.lang = 'zh-CN'
      u.rate = 1
      u.pitch = 1
      window.speechSynthesis.speak(u)
    } catch {}
  }

  async function send(text: string) {
    const t = text.trim()
    // 办公模式：把任务（含文件）派发到后端 VM 执行，而非走普通聊天
    if (officeMode) {
      if (!t && officeFiles.length === 0) return
      dispatchOfficeTask(t)
      return
    }
    if ((!t && pendingImages.length === 0 && !pendingDoc) || busy) return
    setError('')

    const content = t
    let images: string[] | undefined
    let doc: { name: string; text: string } | undefined
    images = pendingImages.length ? pendingImages : undefined
    doc = pendingDoc ?? undefined

    const userMsg: ChatMsg = { role: 'user', content, images, doc }
    const history: ChatMsg[] = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setPendingImages([])
    setPendingDoc(null)
    setBusy(true)
    setMessages([...history, { role: 'assistant', content: '' }])
    try {
      const agent = agentOf()
      const system = agent?.system
      const reply = await sendChat(history, modelId, provider.defaultModel, { system })
      setMessages([...history, { role: 'assistant', content: reply }])
      notifyNative('灵境 AI 已回复', reply.replace(/\s+/g, ' ').slice(0, 80))
      if (ttsOn) speak(reply)
    } catch (e: any) {
      setMessages(history)
      setError(e?.message || '请求失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  // —— 图片选择：缩放压缩后加入待发送列表 ——
  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setReading(true)
    try {
      const urls = await Promise.all(files.map((f) => fileToScaledDataUrl(f)))
      setPendingImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES))
      if (files.length + pendingImages.length > MAX_IMAGES) {
        showToast(`最多附带 ${MAX_IMAGES} 张图片`)
      }
    } catch {
      setError('图片读取失败')
    } finally {
      setReading(false)
    }
  }
  function removeImage(idx: number) {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx))
  }

  // —— 文档选择：编码探测解码为文本 ——
  async function onPickDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.size > 200_000) {
      setError('文档过大（>200KB），请精简后重试')
      return
    }
    setReading(true)
    try {
      const text = await decodeFileText(f)
      setPendingDoc({ name: f.name, text: text.slice(0, 24000) })
    } catch {
      setError('文档读取失败')
    } finally {
      setReading(false)
    }
  }

  // —— 办公模式：文件舱（多文件解析，支持点击与拖拽）——
  async function addOfficeFiles(fs: File[]) {
    if (!fs.length) return
    if (officeFiles.length + fs.length > MAX_OFFICE_FILES) {
      showToast(`文件舱最多 ${MAX_OFFICE_FILES} 个文件，超出部分已忽略`)
    }
    const take = fs.slice(0, Math.max(0, MAX_OFFICE_FILES - officeFiles.length))
    setOfficeReading(true)
    try {
      const parsed = await Promise.all(take.map(parseFile))
      setOfficeFiles((prev) => [...prev, ...parsed])
      const bad = parsed.filter((p) => p.kind === 'unsupported')
      if (bad.length) setError(`暂不支持：${bad.map((b) => b.name).join('、')}（PDF 等请先转成 txt/Word）`)
    } catch {
      setError('文件读取失败')
    } finally {
      setOfficeReading(false)
    }
  }
  function onPickOfficeFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fs = Array.from(e.target.files || [])
    e.target.value = ''
    addOfficeFiles(fs)
  }
  function onDropOffice(e: React.DragEvent) {
    e.preventDefault()
    addOfficeFiles(Array.from(e.dataTransfer.files || []))
  }

  // —— 定位当前位置 ——
  function locate() {
    if (!('geolocation' in navigator)) {
      setError('当前环境不支持定位（需 HTTPS 或 localhost）')
      return
    }
    setError('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const t = `我的当前位置坐标大概是：纬度 ${latitude.toFixed(4)}，经度 ${longitude.toFixed(4)}（精度约 ${Math.round(
          accuracy
        )} 米）。请告诉我这里大概在哪个城市 / 区域，以及附近有什么值得一去的地方或实用信息？`
        send(t)
      },
      (err) => {
        setError('定位失败：' + (err.message || '已拒绝授权'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }

  function newChat() {
    const key = createThread(modelId, aidOf(), provider)
    setThreadKey(key)
    setMessages(sync.getThread(key)!.messages)
    setDrawer(false)
  }

  function openThread(key: string) {
    const t = sync.getThread(key)
    if (!t) return
    sync.setCurrentThread(key)
    setThreadKey(key)
    setMessages(t.messages)
    setDrawer(false)
    setEditingKey(null)
  }

  function removeThread(key: string) {
    sync.deleteThread(key)
    if (key === threadKey) {
      const rest = sync.getAllThreads()[0]
      if (rest) openThread(rest.key)
      else newChat()
    }
  }

  function startRename(t: sync.Thread) {
    setEditingKey(t.key)
    setEditText(t.title || '')
  }
  function commitRename() {
    if (editingKey) {
      sync.renameThread(editingKey, editText)
      setEditingKey(null)
      setEditText('')
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }
  function saveAsApp(code: string) {
    setSaveCode(code)
  }
  function doSaveApp(app: Omit<sync.QuickApp, 'id' | 'createdAt' | 'updatedAt'>) {
    sync.saveApp({ ...app, id: newAppId(), createdAt: Date.now(), updatedAt: Date.now() })
    setSaveCode(null)
    showToast('已保存到快应用，可在「快应用」页查看')
  }

  const showSuggestions = messages.length <= 1
  let threads = sync.getAllThreads()
  if (query.trim()) {
    const q = query.trim().toLowerCase()
    threads = threads.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(q) ||
        brandOf(t.modelId).toLowerCase().includes(q) ||
        (t.agentName || '').toLowerCase().includes(q)
    )
  }

  return (
    <div className={'chat chat-split' + (showFiles ? ' files-open' : '')}>
      <div className="chat-col">
      <div className="chat-head">
        <button className="new-chat" onClick={() => setDrawer((v) => !v)} title="对话历史">
          历史 ({sync.getAllThreads().length})
        </button>
        {agentOf() ? (
          <span className="agent-badge">🤖 {agentOf()!.name}</span>
        ) : (
          <span className="agent-badge muted">通用助手</span>
        )}
        <span className="mode-seg" title="切换聊天 / 办公任务模式">
          <button
            className={'seg' + (!officeMode ? ' active' : '')}
            onClick={() => setOfficeMode(false)}
          >
            💬 聊天
          </button>
          <button
            className={'seg' + (officeMode ? ' active' : '')}
            onClick={() => setOfficeMode(true)}
          >
            🗂 办公
          </button>
        </span>
        <button
          className={'new-chat' + (ttsOn ? ' active' : '')}
          onClick={() => setTtsOn((v) => !v)}
          title="AI 回复后自动语音播报"
        >
          🔊 语音
        </button>
        <button className="new-chat" onClick={newChat} title="新建对话">
          新对话
        </button>
        {files.length > 0 && (
          <button className="new-chat file-toggle" onClick={() => setShowFiles((v) => !v)} title="文件区域">
            📁 文件 {files.length}
          </button>
        )}
      </div>

      {drawer && (
        <div className="thread-drawer">
          <div className="thread-drawer-head">
            <span>对话历史</span>
            <button className="drawer-close" onClick={() => setDrawer(false)} aria-label="关闭">
              ✕
            </button>
          </div>
          <input
            className="thread-search"
            placeholder="搜索对话…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="thread-list">
            {threads.length === 0 && (
              <div className="thread-empty">{query.trim() ? '没有匹配的对话' : '还没有对话'}</div>
            )}
            {threads.map((t) => (
              <div
                key={t.key}
                className={'thread-item' + (t.key === threadKey ? ' active' : '')}
              >
                <div className="thread-item-main" onClick={() => openThread(t.key)}>
                  {editingKey === t.key ? (
                    <input
                      className="thread-rename"
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingKey(null)
                      }}
                    />
                  ) : (
                    <div className="thread-title">{t.title || '新对话'}</div>
                  )}
                  <div className="thread-sub">
                    {brandOf(t.modelId)}
                    {t.agentName ? ' · ' + t.agentName : ''} · {timeAgo(t.updatedAt)}
                  </div>
                  {editingKey !== t.key && t.messages.length > 1 && (
                    <div className="thread-snippet">{lastSnippet(t.messages)}</div>
                  )}
                </div>
                <div className="thread-actions">
                  <button
                    className="thread-del"
                    title="重命名"
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(t)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="thread-del"
                    title="删除"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeThread(t.key)
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => {
          const thinking = busy && i === messages.length - 1 && !m.content
          return (
            <div key={i} className={'msg-row ' + m.role}>
              {m.role === 'assistant' && (
                <div className="avatar assistant" aria-hidden>
                  <Icon name="sparkles" size={16} />
                </div>
              )}
              <div className={'bubble ' + m.role + (thinking ? ' thinking' : '')}>
                {m.role === 'assistant' ? (
                  thinking ? (
                    '思考中…'
                  ) : (
                    <>
                      <MessageContent content={m.content} onSaveAsApp={saveAsApp} />
                      {m.content && (
                        <button className="msg-speak" title="朗读" onClick={() => speak(m.content)}>
                          🔊
                        </button>
                      )}
                    </>
                  )
                ) : (
                  <div className="user-content">
                    {m.images && m.images.length > 0 && (
                      <div className="user-images">
                        {m.images.map((src, idx) => (
                          <img key={idx} src={src} alt="附件" className="user-thumb" />
                        ))}
                      </div>
                    )}
                    {m.doc && <div className="doc-chip">📄 已附文档《{m.doc.name}》</div>}
                    {m.content && <span className="md-text">{m.content}</span>}
                  </div>
                )}
              </div>
              {m.role === 'user' && (
                <div className="avatar user" aria-hidden>
                  <Icon name="user" size={14} />
                </div>
              )}
            </div>
          )
        })}

        {officeMode && officeJob && (
          <div className="office-card-inline">
            <div className="ot-title">
              ⚙️ 办公任务{OFFICE_STATUS_LABEL[officeJob.status] || ''}
              {officeJobId && <span className="ot-id">#{officeJobId.slice(0, 8)}</span>}
            </div>
            {Array.isArray(officeJob.plan) && officeJob.plan.length > 0 && (
              <div className="ot-stages">
                {officeJob.plan.map((p: any, i: number) => (
                  <div key={i} className={'ot-stage' + (p.done ? ' done' : '')}>
                    <span className="ot-dot">{p.done ? '✓' : '·'}</span>
                    <span>{p.title}</span>
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(officeJob.artifacts) && officeJob.artifacts.length > 0 && (
              <div className="ot-artifacts">
                <div className="ot-sub">📦 交付物（点击下载）</div>
                <div className="ot-files">
                  {officeJob.artifacts.map((a: any, i: number) => (
                    <button key={i} className="ot-file" onClick={() => downloadArtifact(a.path)}>
                      {a.name} <span className="ot-dl">↓</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {officeJob.logs && (
              <details className="ot-logs">
                <summary>执行日志</summary>
                <pre>{officeJob.logs}</pre>
              </details>
            )}
            {officeJob.status === 'error' && officeJob.error && (
              <div className="ot-err">⚠️ {officeJob.error}</div>
            )}
          </div>
        )}

        {showSuggestions && !officeMode && (
          <div className="suggestions">
            <div className="suggestions-hint">试试这些：</div>
            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {officeMode && officeJob && (
        <div className="office-card-inline">
          <div className="ot-title">
            ⚙️ 办公任务{OFFICE_STATUS_LABEL[officeJob.status] || ''}
            {officeJobId && <span className="ot-id">#{officeJobId.slice(0, 8)}</span>}
          </div>
          {Array.isArray(officeJob.plan) && officeJob.plan.length > 0 && (
            <div className="ot-stages">
              {officeJob.plan.map((p: any, i: number) => (
                <div key={i} className={'ot-stage' + (p.done ? ' done' : '')}>
                  <span className="ot-dot">{p.done ? '✓' : '·'}</span>
                  <span>{p.title}</span>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(officeJob.artifacts) && officeJob.artifacts.length > 0 && (
            <div className="ot-artifacts">
              <div className="ot-sub">📦 交付物（点击下载）</div>
              <div className="ot-files">
                {officeJob.artifacts.map((a: any, i: number) => (
                  <button key={i} className="ot-file" onClick={() => downloadArtifact(a.path)}>
                    {a.name} <span className="ot-dl">↓</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {officeJob.logs && (
            <details className="ot-logs">
              <summary>执行日志</summary>
              <pre>{officeJob.logs}</pre>
            </details>
          )}
          {officeJob.status === 'error' && officeJob.error && (
            <div className="ot-err">⚠️ {officeJob.error}</div>
          )}
        </div>
      )}

      {officeMode && officeJob && (
        <div className="office-card-inline">
          <div className="ot-title">
            ⚙️ 办公任务{OFFICE_STATUS_LABEL[officeJob.status] || ''}
            {officeJobId && <span className="ot-id">#{officeJobId.slice(0, 8)}</span>}
          </div>
          {Array.isArray(officeJob.plan) && officeJob.plan.length > 0 && (
            <div className="ot-stages">
              {officeJob.plan.map((p: any, i: number) => (
                <div key={i} className={'ot-stage' + (p.done ? ' done' : '')}>
                  <span className="ot-dot">{p.done ? '✓' : '·'}</span>
                  <span>{p.title}</span>
                </div>
              ))}
            </div>
          )}
          {Array.isArray(officeJob.artifacts) && officeJob.artifacts.length > 0 && (
            <div className="ot-artifacts">
              <div className="ot-sub">📦 交付物（点击下载）</div>
              <div className="ot-files">
                {officeJob.artifacts.map((a: any, i: number) => (
                  <button key={i} className="ot-file" onClick={() => downloadArtifact(a.path)}>
                    {a.name} <span className="ot-dl">↓</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {officeJob.logs && (
            <details className="ot-logs">
              <summary>执行日志</summary>
              <pre>{officeJob.logs}</pre>
            </details>
          )}
          {officeJob.status === 'error' && officeJob.error && (
            <div className="ot-err">⚠️ {officeJob.error}</div>
          )}
        </div>
      )}

      {error && <div className="chat-error">{error}</div>}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        {officeMode && (
          <div className="office-compose">
            <div className="office-quick">
              <span className="oq-label">格式</span>
              {['', 'pptx', 'docx', 'xlsx', 'pdf'].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={'oq' + (officeFormat === f ? ' active' : '')}
                  onClick={() => setOfficeFormat(f)}
                >
                  {f === '' ? '自动' : f.toUpperCase()}
                </button>
              ))}
              <span className="oq-label">篇幅</span>
              {['精简', '适中', '详细'].map((l) => (
                <button
                  key={l}
                  type="button"
                  className={'oq' + (officeLength === l ? ' active' : '')}
                  onClick={() => setOfficeLength(l)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="office-tasks-row">
              {OFFICE_TASKS.map((tk) => (
                <button
                  key={tk.label}
                  type="button"
                  className="office-chip"
                  onClick={() => setInput(tk.prompt)}
                >
                  <span>{tk.icon}</span>
                  <span>{tk.label}</span>
                </button>
              ))}
            </div>
            {officeFiles.length > 0 && (
              <div className="office-file-chips">
                {officeFiles.map((f, i) => (
                  <span key={i} className={'of-chip ' + f.kind}>
                    {f.error ? '⚠️ ' : '📎 '}
                    {f.name}
                    <button
                      type="button"
                      className="of-chip-x"
                      onClick={() => setOfficeFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="移除"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {(pendingImages.length > 0 || pendingDoc) && (
          <div className="attach-tray">
            {pendingImages.map((src, idx) => (
              <div className="attach-thumb" key={idx}>
                <img src={src} alt="待发送" />
                <button type="button" className="attach-x" onClick={() => removeImage(idx)} aria-label="移除">
                  ×
                </button>
              </div>
            ))}
            {pendingDoc && (
              <div className="attach-doc">
                📄 {pendingDoc.name}
                <button type="button" className="attach-x" onClick={() => setPendingDoc(null)} aria-label="移除">
                  ×
                </button>
              </div>
            )}
          </div>
        )}
        <div className="chat-input-inner">
          <div className="input-tools">
            {!officeMode && (
              <button
                type="button"
                className="tool-btn"
                title="发送图片"
                onClick={() => imgInputRef.current?.click()}
                disabled={reading}
              >
                📷
              </button>
            )}
            {!officeMode && (
              <button
                type="button"
                className="tool-btn"
                title="发送文档"
                onClick={() => docInputRef.current?.click()}
                disabled={reading}
              >
                📄
              </button>
            )}
            {officeMode && (
              <button
                type="button"
                className="tool-btn"
                title="添加文件"
                onClick={() => officeFileRef.current?.click()}
                disabled={officeReading}
              >
                📎
              </button>
            )}
            <button type="button" className="tool-btn" title="定位当前位置" onClick={locate}>
              📍
            </button>
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              officeMode
                ? '描述你要完成的任务目标（如：基于上传的销售表做 12 页复盘 PPT）…'
                : `和 ${provider.brand} 聊聊…（Enter 发送）`
            }
          />
          <button className="btn-primary send" type="submit" disabled={busy} aria-label="发送">
            <Icon name="send" size={18} />
          </button>
        </div>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onPickImages}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".txt,.md,.text,.csv,.json,.log,.xml,.html,.js,.ts,.css,.py,.yaml,.yml,text/*"
          hidden
          onChange={onPickDoc}
        />
        <input
          ref={officeFileRef}
          type="file"
          multiple
          hidden
          accept=".txt,.md,.csv,.json,.log,.xml,.yaml,.yml,.html,.js,.ts,.css,.py,.docx,.xlsx,.xls,image/*"
          onChange={onPickOfficeFiles}
        />
      </form>
      </div>

      <FilePanel files={files} onClose={() => setShowFiles(false)} />

      {saveCode && (
        <SaveAppModal code={saveCode} onClose={() => setSaveCode(null)} onSave={doSaveApp} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
