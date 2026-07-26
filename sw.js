// 灵境 AI 离线壳缓存（PWA）
const CACHE = 'lingjing-v1'
const SHELL = [
  '/ai-director-canvas/',
  '/ai-director-canvas/index.html',
  '/ai-director-canvas/favicon.svg',
  '/ai-director-canvas/manifest.webmanifest'
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// 仅缓存同源 GET（壳资源）；API 请求与跨域一律走网络，避免缓存对话/模型响应。
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && url.pathname.startsWith('/ai-director-canvas/assets/')) {
            c.put(req, res.clone())
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
