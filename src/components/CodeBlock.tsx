// 通用代码块：仅提供复制（用于 AI 回复里的非 html 代码，如 Python/JS 片段）
import { useState } from 'react'

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }
  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="code-lang">{lang || 'code'}</span>
        <button className="mini-btn" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="code-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}
