// 消息内容渲染：拆分文本与代码块
// ---------------------------------------------------------------
// - 文本段：保留换行（pre-wrap）
// - ```html 代码块：渲染为 AppRunner（可运行/复制/全屏/存为快应用）
// - ```lang:path/to/file 代码块：识别为「文件」，渲染带路径标签的文件块（汇入文件区域）
// - 其他语言代码块：渲染为 CodeBlock（仅复制）
import { Fragment } from 'react'
import { AppRunner } from './AppRunner'
import { CodeBlock } from './CodeBlock'

interface Props {
  content: string
  /** 对话界面里把 html 块「存为快应用」时的回调（传入该段代码） */
  onSaveAsApp?: (code: string) => void
}

const FENCE = /```([^\n`]*)\n([\s\S]*?)```/gi
const PATH_LIKE = /(\/|\\|\.[a-z0-9]{1,6}$)/i

export function MessageContent({ content, onSaveAsApp }: Props) {
  const parts: Array<{ type: 'text' | 'code'; lang: string; text: string }> = []
  let last = 0
  let m: RegExpExecArray | null
  FENCE.lastIndex = 0
  while ((m = FENCE.exec(content))) {
    if (m.index > last) parts.push({ type: 'text', lang: '', text: content.slice(last, m.index) })
    parts.push({ type: 'code', lang: (m[1] || '').trim(), text: m[2] })
    last = m.index + m[0].length
  }
  if (last < content.length) parts.push({ type: 'text', lang: '', text: content.slice(last) })

  if (parts.length === 0) return <span className="md-text">{content}</span>

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'text') {
          if (!p.text.trim()) return <Fragment key={i} />
          return (
            <span key={i} className="md-text">
              {p.text}
            </span>
          )
        }

        const code = p.text.replace(/\n+$/, '')
        // 文件块：`lang:path/to/file`
        const sep = p.lang.indexOf(':')
        if (sep > 0) {
          const maybeLang = p.lang.slice(0, sep).trim().toLowerCase()
          const maybePath = p.lang.slice(sep + 1).trim()
          if (maybePath && PATH_LIKE.test(maybePath)) {
            return (
              <div key={i} className="file-block">
                <div className="file-block-head">
                  <span className="file-block-path">📄 {maybePath}</span>
                  <span className="file-block-lang">{maybeLang || 'file'}</span>
                </div>
                <CodeBlock code={code} lang={maybeLang || ''} />
              </div>
            )
          }
        }

        if (p.lang === 'html') {
          return (
            <AppRunner
              key={i}
              code={code}
              title="网页应用"
              compact
              onSaveAsApp={onSaveAsApp ? () => onSaveAsApp(code) : undefined}
            />
          )
        }
        return <CodeBlock key={i} code={code} lang={p.lang} />
      })}
    </>
  )
}
