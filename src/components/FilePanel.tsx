// 文件区域：陈列当前对话里 AI 生成的多文件项目，支持浏览 / 预览 / 打包下载。
import { useMemo, useState } from 'react'
import type { ProjectFile } from '../lib/codeFiles'
import { findEntryHtml } from '../lib/codeFiles'
import { zipStore } from '../lib/zipStore.mjs'

interface Props {
  files: ProjectFile[]
  onClose?: () => void
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function FilePanel({ files, onClose }: Props) {
  const [active, setActive] = useState<string | null>(null)
  const sorted = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files])
  const current = sorted.find((f) => f.path === active) ?? null

  function downloadZip() {
    if (files.length === 0) return
    const entries = files.map((f) => ({
      path: f.path,
      data: new TextEncoder().encode(f.code)
    }))
    const blob = new Blob([zipStore(entries)], { type: 'application/zip' })
    downloadBlob(blob, 'lingjing-project.zip')
  }

  function previewHtml() {
    const entry = current?.lang === 'html' ? current : findEntryHtml(files)
    if (!entry) return
    const blob = new Blob([entry.code], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  if (files.length === 0) {
    return (
      <aside className="file-panel">
        <div className="file-panel-head">
          <span>📁 文件区域</span>
          {onClose && (
            <button className="file-panel-x" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          )}
        </div>
        <div className="file-panel-empty">
          让 AI「搭建一个前后端项目」后，生成的多文件代码会自动出现在这里，可一键打包下载或预览。
        </div>
      </aside>
    )
  }

  return (
    <aside className="file-panel">
      <div className="file-panel-head">
        <span>📁 文件区域 ({files.length})</span>
        <div className="file-panel-actions">
          <button className="mini-btn" onClick={downloadZip} title="打包为 ZIP 下载">
            ⬇ ZIP
          </button>
          <button className="mini-btn" onClick={previewHtml} title="预览 HTML 入口">
            🌐 预览
          </button>
          {onClose && (
            <button className="file-panel-x" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="file-panel-body">
        <ul className="file-list">
          {sorted.map((f) => (
            <li
              key={f.path}
              className={'file-item' + (f.path === active ? ' active' : '')}
              onClick={() => setActive(f.path)}
              title={f.path}
            >
              <span className="file-item-icon">
                {f.lang === 'html' ? '🌐' : f.lang === 'js' || f.lang === 'ts' ? '📜' : '📄'}
              </span>
              <span className="file-item-path">{f.path}</span>
            </li>
          ))}
        </ul>
        {current && (
          <div className="file-view">
            <div className="file-view-head">
              <span className="file-view-path">{current.path}</span>
              <button
                className="mini-btn"
                onClick={() => navigator.clipboard?.writeText(current.code)}
              >
                ⧉ 复制
              </button>
            </div>
            <pre className="file-view-code">
              <code>{current.code}</code>
            </pre>
          </div>
        )}
      </div>
    </aside>
  )
}
