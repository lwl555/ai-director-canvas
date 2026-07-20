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

Deno.serve(async (req: Request) => {
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
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
