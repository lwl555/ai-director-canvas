import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import {
  parseStoryboard,
  novelSystemPrompt,
  buildNovelUserMessage
} from '../lib/directorPrompt'
import { planStoryboard, type PlanStage } from '../lib/planner'
import { findStuckVariants } from '../lib/harness'
import { agnesChat } from '../lib/agnes'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

type Mode = 'chat' | 'novel'

export default function DirectorChat({ onClose }: { onClose: () => void }) {
  const { project, setMeta, applyStoryboard, addRef, addShot } = useStore()
  const { produceAll, resumeStuckVideos } = useGenerator()
  const [mode, setMode] = useState<Mode>('chat')
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: '你好，我是你的 AI 导演。描述你的创意（主题、风格、时长、角色），我会自动规划角色定妆、场景、分镜并铺到画布上。' }
  ])
  const [input, setInput] = useState('')
  const [novel, setNovel] = useState('')
  const [duration, setDuration] = useState(50)
  const [busy, setBusy] = useState(false)
  const stuckCount = findStuckVariants(project).length
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const send = async () => {
    const brief = input.trim()
    if (!brief || busy) return
    setBusy(true)
    const next = [...messages, { role: 'user' as const, content: brief }]
    setMessages(next)
    setInput('')
    // 规划层多 Agent 进度提示（A1-A4 串行）
    const stageLabel: Record<PlanStage, string> = {
      A1: '🧠 理解创意…',
      A2: '👥 设计角色与结构…',
      A3: '🎬 绘制分镜…',
      A4: '💬 注入克制对话…'
    }
    setMessages((m) => [...m, { role: 'assistant', content: stageLabel.A1 }])
    try {
      const board = await planStoryboard(brief, (stage, label) => {
        // 更新最后一条 assistant 进度气泡
        setMessages((m) => {
          const copy = [...m]
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'assistant' && (copy[i].content.startsWith('🧠') || copy[i].content.startsWith('👥') || copy[i].content.startsWith('🎬') || copy[i].content.startsWith('💬'))) {
              copy[i] = { ...copy[i], content: stageLabel[stage] }
              break
            }
          }
          return copy
        })
      })
      if (board && board.shots && board.shots.length) {
        applyStoryboard(board)
        setMeta({ brief: (project.brief ? project.brief + '\n' : '') + brief })
        setMessages((m) => [
          ...m.filter((x) => !(x.role === 'assistant' && (x.content.startsWith('🧠') || x.content.startsWith('👥') || x.content.startsWith('🎬') || x.content.startsWith('💬')))),
          {
            role: 'assistant',
            content: `规划完成《${board.title || '未命名'}》：${(board.characters || []).length} 个角色、${(board.references || []).length} 张参考图、${(board.shots || []).length} 个分镜（对话已按电影节奏稀疏注入），已铺到画布。\n\n点左侧「生成」出图，或顶栏「生成全部视频」一键出片。`
          }
        ])
      } else {
        setMessages((m) => [...m, { role: 'assistant', content: '未能解析出分镜结构，请换种描述重试。' }])
      }
    } catch (e: any) {
      setMessages((m) => [...m.filter((x) => !(x.role === 'assistant' && (x.content.startsWith('🧠') || x.content.startsWith('👥') || x.content.startsWith('🎬') || x.content.startsWith('💬')))), { role: 'assistant', content: '出错了：' + (e?.message || '调用失败') }])
    } finally {
      setBusy(false)
    }
  }

  // AC：导入小说 → 自动写分镜脚本（含台词）→ 铺画布 → 一键出全部图与视频
  const runNovel = async () => {
    const text = novel.trim()
    if (!text || busy) return
    setBusy(true)
    setMessages((m) => [
      ...m,
      { role: 'user' as const, content: `导入小说（${text.length} 字），目标时长 ${duration} 秒，自动生成分镜与视频` }
    ])
    try {
      const reply = await agnesChat(
        [
          { role: 'system', content: novelSystemPrompt(duration) },
          { role: 'user', content: buildNovelUserMessage(text) }
        ],
        'agnes-2.0-flash',
        8192
      )
      const board = parseStoryboard(reply)
      if (!board) {
        setMessages((m) => [...m, { role: 'assistant', content: '未能从返回中解析出分镜脚本 JSON，请重试或缩短小说。\n\n' + reply.slice(0, 400) }])
        return
      }
      applyStoryboard(board)
      setMeta({ brief: `【小说改编】${text.slice(0, 60)}…`, durationSec: duration })
      const shotCount = board.shots?.length || 0
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: `已生成《${board.title || '未命名'}》分镜脚本：${(board.characters || []).length} 角色 / ${(board.references || []).length} 参考图 / ${shotCount} 分镜（含台词）。\n\n现在开始自动出图 + 出视频，请稍候（会弹窗提示进度）…`
        }
      ])
      // 自动跑完整流水线（图 + 视频），用户全程可见反馈
      const stageEmoji: Record<string, string> = {
        refs: '🖼️ 生成参考图',
        shots: '🎞️ 生成分镜定格图',
        videos: '🎬 生成视频',
        done: '✅ 流水线完成'
      }
      await produceAll((_stage, label) => {
        setMessages((m) => {
          const copy = [...m]
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'assistant' && /^[🖼️🎞️🎬✅]/.test(copy[i].content)) {
              copy[i] = { ...copy[i], content: stageEmoji[_stage] || label }
              return copy
            }
          }
          return [...copy, { role: 'assistant', content: stageEmoji[_stage] || label }]
        })
      })
      const stuck = findStuckVariants(project)
      setMessages((m) => [
        ...m.filter((x) => !(x.role === 'assistant' && /^[🖼️🎞️🎬✅]/.test(x.content))),
        {
          role: 'assistant',
          content: stuck.length
            ? `自动化创作完成！但检测到 ${stuck.length} 个视频仍在生成中（可能受免费档限流），点下方「继续未完成视频」补齐。`
            : '自动化创作完成！所有分镜图与视频已生成并排上时间轴。可在画布与时间轴查看，顶栏「导出」拿工程文件。'
        }
      ])
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: '自动化创作失败：' + (e?.message || '调用失败') }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="director-panel">
      <div className="director-head">
        <span>智能导演</span>
        <button className="btn-ghost" onClick={onClose}>×</button>
      </div>
      <div className="director-tabs">
        <button className={mode === 'chat' ? 'tab on' : 'tab'} onClick={() => setMode('chat')}>创意</button>
        <button className={mode === 'novel' ? 'tab on' : 'tab'} onClick={() => setMode('novel')}>导入小说</button>
      </div>

      {stuckCount > 0 && (
        <div className="director-resume">
          <span>⏳ 有 {stuckCount} 个视频未完成（限流/中断）</span>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await resumeStuckVideos()
                setMessages((m) => [...m, { role: 'assistant', content: '已补齐未完成的视频，可在画布查看。' }])
              } finally {
                setBusy(false)
              }
            }}
          >
            继续未完成视频
          </button>
        </div>
      )}

      {mode === 'chat' ? (
        <>
          <div className="director-msgs" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="bubble assistant typing">导演思考中…</div>}
          </div>
          <div className="director-input">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="描述你的创意，如：一个赛博朋克少女在雨夜霓虹街头奔跑，30秒，治愈系…"
              rows={3}
            />
            <button className="btn btn-primary" onClick={send} disabled={busy}>
              发送
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="director-msgs" ref={scrollRef}>
            <div className="bubble assistant">
              把小说全文粘贴到下方，设定目标时长，点「自动创作」。我会自动写分镜脚本（含角色台词）、出参考图、出分镜定格图、批量生成视频并排上时间轴。
            </div>
            {messages.filter((m) => m.role === 'user' && m.content.startsWith('导入小说')).map((m, i) => (
              <div key={i} className="bubble user">{m.content}</div>
            ))}
            {busy && <div className="bubble assistant typing">AC 引擎创作中…</div>}
          </div>
          <div className="director-novel">
            <div className="novel-row">
              <label>目标时长</label>
              <input
                type="number"
                min={10}
                max={120}
                value={duration}
                onChange={(e) => setDuration(Math.max(10, Math.min(120, Number(e.target.value) || 50)))}
              />
              <span>秒</span>
            </div>
            <textarea
              value={novel}
              onChange={(e) => setNovel(e.target.value)}
              placeholder="在此粘贴小说全文…"
              rows={8}
            />
            <button className="btn btn-primary" onClick={runNovel} disabled={busy || !novel.trim()}>
              {busy ? '创作中…' : '自动创作（AC）'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
