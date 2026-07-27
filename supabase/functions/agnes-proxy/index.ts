// Supabase Edge Function: agnes-proxy
// 生产环境用它代理 Agnes AI，避免把 API key 暴露在前端 bundle 里。
//
// 部署：
//   supabase secrets set AGNES_API_KEY=sk-xxxx
//   supabase functions deploy agnes-proxy
//
// 前端配置（.env.production 或构建环境变量）：
//   VITE_AGNES_BASE=https://<你的项目>.functions.supabase.co/agnes-proxy
//
// 调用约定：前端请求 https://<ref>.functions.supabase.co/agnes-proxy/v1/chat/completions
// 本函数会剥掉 /agnes-proxy 前缀，转发到 https://apihub.agnes-ai.com/v1/chat/completions

const AGNES_HOST = 'https://apihub.agnes-ai.com'
const AGNES_KEY = Deno.env.get('AGNES_API_KEY') || ''

// 浏览器跨域：前端从 github.io 调本函数，带 Content-Type+Authorization 会触发预检。
// 必须显式回应 OPTIONS，否则浏览器会拦截实际请求（curl 不发预检所以测不出来）。
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

// 只允许来自本站（GitHub Pages）的跨域请求调用，防止他人白嫖函数额度。
// 注意：这是浏览器端防护——攻击者可用 curl 伪造 Origin 绕过，但能挡住绝大多数
// 从第三方网站发起的浏览器调用。若要彻底锁死，需配合前端带 shared secret 校验。
const ALLOWED_ORIGIN = 'https://lwl555.github.io'

Deno.serve(async (req: Request) => {
  // CORS 预检：直接放行，不转发到上游
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }
  // 跨域请求校验来源；不带 Origin 的服务端调用（curl/健康检查）放行
  const origin = req.headers.get('origin') || ''
  if (origin && origin !== ALLOWED_ORIGIN) {
    return new Response('Forbidden: origin not allowed', {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
  try {
    const url = new URL(req.url)
    // 剥掉函数名前缀，例如 /agnes-proxy/v1/chat/completions -> /v1/chat/completions
    let path = url.pathname.replace(/^\/agnes-proxy/, '')
    if (!path.startsWith('/')) path = '/' + path
    const target = AGNES_HOST + path + (url.search || '')

    const body =
      req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await req.text()

    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AGNES_KEY}`
      },
      body
    })

    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        ...CORS_HEADERS
      }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
})
