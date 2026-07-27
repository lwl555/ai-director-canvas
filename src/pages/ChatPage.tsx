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
import * as sync from '../lib/sync'

const SUGGESTIONS = [
  '帮我写一段周末出游的朋友圈文案',
  '用通俗的话解释一下什么是大模型',
  '把我这段笔记总结成 3 个要点',
  '帮我把下面这句话润色得更专业一些'
]

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
  return u ? u.content.slice(0, 24) : '新对话'
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
  return last ? last.content.replace(/\s+/g, ' ').slice(0, 42) : ''
}
function newAppId() {
  return 'app-' + Math.random().toString(36).slice(2, 10)
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const files = useMemo(() => collectProjectFiles(messages), [messages])

  useEffect(() => sync.subscribe(force), [])

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

  async function send(text: string) {
    const t = text.trim()
    if (!t || busy) return
    setError('')
    const history: ChatMsg[] = [...messages, { role: 'user', content: t }]
    setMessages(history)
    setInput('')
    setBusy(true)
    setMessages([...history, { role: 'assistant', content: '' }])
    try {
      const agent = agentOf()
      const reply = await sendChat(history, modelId, provider.defaultModel, {
        system: agent?.system
      })
      setMessages([...history, { role: 'assistant', content: reply }])
      notifyNative('灵境 AI 已回复', reply.replace(/\s+/g, ' ').slice(0, 80))
    } catch (e: any) {
      setMessages(history)
      setError(e?.message || '请求失败，请重试')
    } finally {
      setBusy(false)
    }
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
                    <MessageContent content={m.content} onSaveAsApp={saveAsApp} />
                  )
                ) : (
                  m.content
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

        {showSuggestions && (
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

      {error && <div className="chat-error">{error}</div>}

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
      >
        <div className="chat-input-inner">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`和 ${provider.brand} 聊聊…（Enter 发送）`}
          />
          <button className="btn-primary send" type="submit" disabled={busy} aria-label="发送">
            <Icon name="send" size={18} />
          </button>
        </div>
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
