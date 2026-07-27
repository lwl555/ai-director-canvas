// 网页小应用运行器：iframe srcDoc 沙箱预览 + 运行/复制/全屏 浮条
// ---------------------------------------------------------------
// srcDoc 让 AI 写的「完整 HTML 文档」可直接塞进 iframe 跑，无需用户拼壳。
// sandbox 放开 scripts / 表单 / 弹窗 / 同域，使大多数前端应用能正常运行
// （localStorage、fetch CDN 等）。注意：代码来自用户自己的 AI 提示，
// 属于用户自内容，沙箱同域是功能可用性的取舍，非第三方不可信内容。
import { useState } from 'react'

export function AppRunner({
  code,
  title,
  onSaveAsApp,
  onImprove,
  compact
}: {
  code: string
  title?: string
  onSaveAsApp?: () => void
  onImprove?: () => void
  compact?: boolean
}) {
  const [full, setFull] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <>
      <div className={'app-runner' + (compact ? ' compact' : '')}>
        <div className="app-runner-bar">
          <span className="app-runner-title">{title || '网页应用预览'}</span>
          <div className="app-runner-actions">
            {onImprove && (
              <button className="mini-btn" onClick={onImprove} title="让 AI 改进">
                ✨ 改进
              </button>
            )}
            {onSaveAsApp && (
              <button className="mini-btn accent" onClick={onSaveAsApp} title="存为快应用">
                ＋ 存为应用
              </button>
            )}
            <button className="mini-btn" onClick={copy} title="复制代码">
              {copied ? '已复制' : '复制'}
            </button>
            <button className="mini-btn" onClick={() => setFull(true)} title="全屏显示">
              ⛶ 全屏
            </button>
          </div>
        </div>
        <iframe
          className="app-runner-frame"
          srcDoc={code}
          title={title || 'preview'}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>

      {full && (
        <div className="app-fullscreen" onClick={() => setFull(false)}>
          <div className="app-fullscreen-inner" onClick={(e) => e.stopPropagation()}>
            <div className="app-fullscreen-bar">
              <span>{title || '网页应用'}</span>
              <button className="mini-btn" onClick={() => setFull(false)}>
                ✕ 关闭
              </button>
            </div>
            <iframe
              className="app-fullscreen-frame"
              srcDoc={code}
              title={title || 'preview-full'}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      )}
    </>
  )
}
