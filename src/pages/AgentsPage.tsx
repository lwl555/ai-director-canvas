import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setCurrentAgent, type AgentStub } from '../lib/agentStore'
import * as sync from '../lib/sync'

const PRESET: AgentStub[] = [
  {
    id: 'screenwriter',
    name: '剧本医生',
    emoji: '📝',
    system: '你是一位资深影视编剧与剧本医生，擅长诊断剧本结构、人物弧光、对白节奏与视觉化呈现。用专业但亲切的方式帮用户打磨故事，给出可落地的修改建议。',
    desc: '诊断剧本结构、人物弧光、对白节奏，给出可落地的修改建议。'
  },
  {
    id: 'shorts',
    name: '短视频策划',
    emoji: '🎬',
    system: '你是一位爆款短视频策划，熟悉各平台调性与黄金三秒法则。帮用户拆解选题、设计钩子、撰写口播脚本与分镜，让内容更抓人。',
    desc: '拆解选题、设计钩子、写口播脚本与分镜，让内容更抓人。'
  },
  {
    id: 'coder',
    name: '全栈编程助手',
    emoji: '💻',
    system: `你是一位经验丰富的全栈工程师，擅长前端 + 后端系统搭建（前后端分离、REST API、数据库、脚本皆可）。

当用户让你「搭建 / 做一个系统 / 项目 / 应用 / 网站 / 服务」时，请直接产出**多文件项目**，并严格按下面的格式输出，平台会把它们自动收集到「文件区域」，用户可以浏览、预览并一键打包下载：

1) 每个文件用一个围栏代码块，info 串写成 \`语言:路径/文件名\`，例如：
\`\`\`js:src/server.js
...代码...
\`\`\`
\`\`\`html:index.html
...代码...
\`\`\`
2) 路径要像真实工程结构（如 index.html、src/main.js、server/app.py、package.json），不要用中文路径。
3) 先给一句总体说明（技术栈、怎么跑），再依次列出全部文件；最后给运行步骤。
4) 代码必须自洽、可运行；涉及前后端联调时，前后端用一致的接口约定。

对于简单的单文件问答，仍可像往常一样直接回答。回答简洁准确，并解释关键思路。`,
    desc: '前后端系统搭建：按工程结构输出多文件，自动进入「文件区域」可预览/打包。'
  },
  {
    id: 'listener',
    name: '暖心树洞',
    emoji: '🌿',
    system: '你是一个温柔耐心的倾听者，先共情再回应，不急于给建议，让用户感到被理解和陪伴。语气温暖、不评判。',
    desc: '先共情再回应，不急于给建议，让人感到被理解与被陪伴。'
  },
  {
    id: 'translator',
    name: '双语翻译官',
    emoji: '🌐',
    system: '你是一位专业翻译，精通中英互译，保留语气与语境，遇到歧义给出备选译法。仅输出翻译与必要说明。',
    desc: '精通中英互译，保留语气与语境，歧义处给备选译法。'
  },
  {
    id: 'coach',
    name: '效率教练',
    emoji: '⚡',
    system: '你是一位时间管理与目标拆解教练，帮用户把模糊目标变成可执行步骤，用 OKR/番茄钟等工具落地，语气鼓励而务实。',
    desc: '把模糊目标拆成可执行步骤，用工具落地，鼓励而务实。'
  }
]

export default function AgentsPage() {
  const nav = useNavigate()
  const [current, setCur] = useState<AgentStub | null>(sync.getCurrentAgent())
  const [custom, setCustom] = useState<AgentStub[]>(sync.getCustomAgents())
  const [editing, setEditing] = useState<AgentStub | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', emoji: '🤖', desc: '', system: '' })

  useEffect(() => {
    const refresh = () => {
      setCur(sync.getCurrentAgent())
      setCustom(sync.getCustomAgents())
    }
    refresh()
    return sync.subscribe(refresh)
  }, [])

  function pick(a: AgentStub) {
    setCurrentAgent(a)
    setCur(a)
    nav('/')
  }
  function closeAgent() {
    setCurrentAgent(null)
    setCur(null)
  }
  function openCreate() {
    setEditing(null)
    setForm({ name: '', emoji: '🤖', desc: '', system: '' })
    setOpen(true)
  }
  function openEdit(a: AgentStub) {
    setEditing(a)
    setForm({ name: a.name, emoji: a.emoji, desc: a.desc, system: a.system })
    setOpen(true)
  }
  function save() {
    const name = form.name.trim()
    if (!name || !form.system.trim()) {
      alert('请填写「名称」和「系统提示词」')
      return
    }
    const agent: AgentStub = {
      id: editing?.id || 'agent-' + Date.now().toString(36),
      name,
      emoji: form.emoji.trim() || '🤖',
      desc: form.desc.trim() || form.system.slice(0, 40),
      system: form.system.trim()
    }
    sync.saveCustomAgent(agent)
    setCustom(sync.getCustomAgents())
    setOpen(false)
  }
  function remove(id: string) {
    if (!confirm('删除这个自定义智能体？')) return
    sync.deleteCustomAgent(id)
    setCustom(sync.getCustomAgents())
    if (current?.id === id) closeAgent()
  }

  return (
    <div className="agents">
      <h2 className="page-title">智能体广场</h2>
      <p className="muted">
        点选一个智能体，立即以它的身份开始对话（无需登录，仅本机/云同步生效）。
      </p>

      {current && (
        <div className="agent-current">
          当前：<span className="agent-current-name">{current.emoji} {current.name}</span>
          <button className="agent-close" title="关闭当前智能体" onClick={closeAgent}>× 退出</button>
        </div>
      )}

      <h3 className="agent-section">预设智能体</h3>
      <div className="agent-grid">
        {PRESET.map((a) => (
          <button key={a.id} className={'agent-card' + (current?.id === a.id ? ' active' : '')}
            onClick={() => pick(a)}>
            <span className="agent-emoji">{a.emoji}</span>
            <span className="agent-name">{a.name}</span>
            <span className="agent-desc">{a.desc}</span>
          </button>
        ))}
        <button className="agent-card close-card" onClick={closeAgent} title="不使用智能体">
          <span className="agent-emoji">🚪</span>
          <span className="agent-name">默认助手</span>
          <span className="agent-desc">关闭智能体，回到通用 AI 助手</span>
        </button>
      </div>

      <h3 className="agent-section">
        我的智能体
        <button className="agent-add" onClick={openCreate}>＋ 创建</button>
      </h3>
      {custom.length === 0 ? (
        <p className="muted">还没有自定义智能体，点「＋ 创建」打造专属助手。</p>
      ) : (
        <div className="agent-grid">
          {custom.map((a) => (
            <div key={a.id} className={'agent-card' + (current?.id === a.id ? ' active' : '')}>
              <button className="agent-pick" onClick={() => pick(a)}>
                <span className="agent-emoji">{a.emoji}</span>
                <span className="agent-name">{a.name}</span>
                <span className="agent-desc">{a.desc}</span>
              </button>
              <div className="agent-actions">
                <button className="agent-mini" onClick={() => openEdit(a)}>编辑</button>
                <button className="agent-mini danger" onClick={() => remove(a.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal agent-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing ? '编辑智能体' : '创建智能体'}</h3>
            <label className="field">
              <span>名称</span>
              <input value={form.name} maxLength={20} placeholder="如：旅行规划师"
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>图标 Emoji</span>
              <input value={form.emoji} maxLength={4} placeholder="🤖"
                onChange={(e) => setForm({ ...form, emoji: e.target.value })} />
            </label>
            <label className="field">
              <span>一句话简介</span>
              <input value={form.desc} maxLength={60} placeholder="让用户一眼看懂它擅长什么"
                onChange={(e) => setForm({ ...form, desc: e.target.value })} />
            </label>
            <label className="field">
              <span>系统提示词（核心）</span>
              <textarea rows={6} value={form.system}
                placeholder="描述它的身份、语气、擅长领域与回答方式…"
                onChange={(e) => setForm({ ...form, system: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setOpen(false)}>取消</button>
              <button className="btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
