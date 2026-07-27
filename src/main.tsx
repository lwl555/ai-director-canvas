import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './theme/ThemeContext'
import ErrorBoundary from './ErrorBoundary'
import * as sync from './lib/sync'
import './styles.css'
import './platform.css'

// 启动前先拉取云端（无登录、按 deviceId 隔离），失败则静默退回本机。
sync.pull().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {/* StoreProvider 已收敛到 CanvasPage（仅画布子路由需要） */}
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  )

  // PWA：注册 Service Worker，使网页可「安装」到手机/桌面（阶段3 手机端）
  if ('serviceWorker' in navigator) {
    const base = (import.meta as any).env?.BASE_URL || '/'
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(base + 'sw.js').catch(() => {})
    })
  }
})
