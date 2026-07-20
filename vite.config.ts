import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 开发态：把 /api/agnes/* 代理到 Agnes AI，并在服务端注入 key，
// 这样 key 不会进浏览器 bundle（生产请用 Supabase Edge Function，见 supabase/functions/agnes-proxy）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.AGNES_API_KEY || ''
  return {
    plugins: [react()],
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
