// 云端 APK 打包弹窗：触发 GitHub Actions 构建 → 轮询进度 → 给出可安装 APK 下载链接。
import { useEffect, useRef, useState } from 'react'
import { startApkBuild, getApkBuildStatus, type BuildStatus } from '../lib/apkBuild'

interface Props {
  asset: 'app-debug.apk' | 'quickapp-debug.apk'
  mode: 'platform' | 'quickapp'
  html?: string
  name?: string
  title: string
  onClose: () => void
  /** 失败时的兜底：下载安卓工程自行用 Android Studio 构建 */
  onFallback?: () => void
}

const STATUS_TEXT: Record<string, string> = {
  pending: '已提交，等待云端构建开始…',
  queued: '云端构建排队中…',
  in_progress: '云端编译 APK 中（约 2–4 分钟，GitHub 机器自动完成）…',
  done: '构建完成！',
  failed: '构建失败'
}

export function ApkBuildModal({ asset, mode, html, name, title, onClose, onFallback }: Props) {
  const [status, setStatus] = useState<BuildStatus>({ status: 'pending' })
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const done = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await startApkBuild({ mode, html, name })
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '发起构建失败')
          setStatus({ status: 'failed' })
        }
        return
      }
      timer.current = setInterval(async () => {
        if (cancelled || done.current) return
        try {
          const s = await getApkBuildStatus(asset)
          setStatus(s)
          if (s.status === 'done' || s.status === 'failed') {
            done.current = true
            if (timer.current) clearInterval(timer.current)
          }
        } catch {
          /* 轮询失败忽略，下次再试 */
        }
      }, 6000)
    })()
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isBuilding = status.status !== 'done' && status.status !== 'failed' && !error

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>📦 {title}</span>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {error ? (
            <>
              <div className="modal-err">{error}</div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                云端构建未能启动。你仍可下载安卓工程，用本机 Android Studio 打开后 Build → Build APK(s)。
              </p>
              {onFallback && (
                <button className="btn-primary block" onClick={onFallback}>
                  ⬇ 下载安卓工程（自行构建）
                </button>
              )}
            </>
          ) : status.status === 'done' && 'url' in status ? (
            <>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                ✅ APK 已生成，可直接安装到安卓手机（在手机「设置 → 安全」开启「未知来源」后点开安装）。
              </p>
              <a className="btn-primary block" href={status.url} target="_blank" rel="noreferrer">
                ⬇ 下载并安装 APK
              </a>
            </>
          ) : status.status === 'not_configured' ? (
            <>
              <div className="modal-err">⚠️ {(status as any).message || 'APK 构建流水线尚未启用'}</div>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                云端打包 APK 需要仓库里的 GitHub Actions 工作流（当前账号令牌缺少 workflows 写权限，暂无法自动推送）。
                你仍可用下方按钮下载安卓工程，本机 Android Studio 打开后 Build → Build APK(s) 即可生成可安装包。
              </p>
              {onFallback && (
                <button className="btn-primary block" onClick={onFallback}>
                  ⬇ 下载安卓工程（自行构建）
                </button>
              )}
            </>
          ) : (
            <>
              <div className="apk-building">
                <span className="apk-spinner" />
                <span>{STATUS_TEXT[status.status] || '云端构建中…'}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>
                构建在你的 GitHub 仓库由 GitHub Actions 自动完成（带 Android SDK），无需本机环境。完成后此窗口会自动出现下载按钮。
              </p>
              {isBuilding && (
                <button className="btn-ghost block" onClick={onClose}>
                  后台继续，先关闭
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
