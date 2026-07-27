import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 开发态：把 /api/agnes/* 代理到 Agnes AI，并在服务端注入 key，
// 这样 key 不会进浏览器 bundle（生产请用 Supabase Edge Function，见 supabase/functions/agnes-proxy）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.AGNES_API_KEY || ''
  // 网页版部署在 GitHub Pages 子目录 /ai-director-canvas/；
  // 原生 APP（Capacitor）把静态资源 serve 在 webview 根路径，base 必须是 '/'。
  const isCapacitor = !!process.env.CAPACITOR
  return {
    plugins: [react()],
    base: isCapacitor ? '/' : '/ai-director-canvas/',
    server: {
      port: 5180,
      proxy: {
        '/api/agnes': {
          target: 'https://apihub.agnes-ai.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/agnes/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (key) proxyReq.setHeader('Authorization', `Bearer ${key}`)
              proxyReq.setHeader('Content-Type', 'application/json')
            })
          }
        }
      }
    }
  }
})
