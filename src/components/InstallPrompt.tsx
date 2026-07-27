import { useEffect, useState } from 'react'

// 捕获浏览器原生「可安装」事件，提供一个显式「安装到桌面/手机」按钮。
// 仅在支持的浏览器（Chrome/Edge/Android 等）出现，不支持则静默不渲染。
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])

  if (!deferred || dismissed) return null
  return (
    <div className="install-banner">
      <span className="install-text">📲 可安装到桌面 / 手机，像原生 App 一样使用</span>
      <button
        className="btn-ghost"
        onClick={() => {
          void deferred.prompt()
          setDeferred(null)
        }}
      >
        安装
      </button>
      <button className="drawer-close" onClick={() => setDismissed(true)} aria-label="关闭">
        ✕
      </button>
    </div>
  )
}
