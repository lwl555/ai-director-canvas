import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { agnesChat, type ChatMsg } from '../lib/agnes'
import { DIRECTOR_SYSTEM_PROMPT, buildDirectorUserMessage, parseStoryboard } from '../lib/directorPrompt'

const EXAMPLES = [
  '一只橘猫在城市屋顶看霓虹夜景，治愈系，30秒',
  '国风少女在魔法森林寻宝，奇幻冒险，45秒',
  '赛博朋克女黑客潜入数据中心，紧张悬疑，40秒'
]

export default function DirectorChat({ onClose }: { onClose: () => void }) {
  const { project, applyStoryboard } = useStore()
  const { generateImage } = useGenerator()
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [autoGen, setAutoGen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoGen) return
    let cancelled = false
    ;(async () => {
      const refs = project.nodes.filter(
        (n) => n.type === 'reference' && n.status !== 'done' && n.status !== 'pending'
      )
      for (const r of refs) {
        if (cancelled) break
        setLog((l) => [...l, `生成参考图：${r.title}`])
        await generateImage(r)
      }
      setLog((l) => [...l, '✅ 参考图已生成，可在画布上点「生成全部视频」'])
      setAutoGen(false)
    })()
    return () => {
      cancelled = true
    }
  }, [autoGen, project.nodes, generateImage])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9 })
  }, [log])

  const run = async () => {
    if (!brief.trim() || loading) return
    setLoading(true)
    setLog((l) => [...l, `🎬 导演正在规划：《${brief.slice(0, 20)}》`])
    try {
      const messages: ChatMsg[] = [
        { role: 'system', content: DIRECTOR_SYSTEM_PROMPT },
        { role: 'user', content: buildDirectorUserMessage(brief) }
      ]
      const text = await agnesChat(messages, 'agnes-2.0-flash', 8000)
      const board = parseStoryboard(text)
      if (!board || !board.shots || board.shots.length === 0) {
        setLog((l) => [...l, '⚠ 导演没有返回有效故事板，请换个说法再试。'])
      } else {
        applyStoryboard(board)
        setLog((l) => [
          ...l,
          `✅ 已生成 ${board.shots!.length} 个分镜、${board.references?.length || 0} 张参考图`,
          `标题：${board.title} ｜ 风格：${board.style} ｜ 时长：${board.durationSec}s`
        ])
        setAutoGen(true)
        setBrief('')
      }
    } catch (e: any) {
      setLog((l) => [...l, '⚠ 生成失败：' + (e?.message || e)])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="director-drawer">
      <div className="dd-head">
        <span>✨ 智能导演</span>
        <button className="icon-btn" onClick={onClose}>✕</button>
      </div>
      <div className="dd-body" ref={scrollRef}>
        <p className="dd-intro">描述你的创意（主题 / 风格 / 时长 / 角色），导演会规划分镜、生成参考图并铺到画布。</p>
        {log.map((t, i) => (
          <div key={i} className="dd-log">{t}</div>
        ))}
        {loading && <div className="dd-log loading">导演思考中…</div>}
      </div>
      <div className="dd-examples">
        {EXAMPLES.map((e) => (
          <button key={e} className="ex-chip" onClick={() => setBrief(e)}>{e}</button>
        ))}
      </div>
      <div className="dd-input">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="例如：一只橘猫在城市屋顶看霓虹夜景，治愈系，30秒"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
        />
        <button className="btn primary" onClick={run} disabled={loading || !brief.trim()}>
          {loading ? '生成中…' : '生成故事板'}
        </button>
      </div>
    </div>
  )
}
