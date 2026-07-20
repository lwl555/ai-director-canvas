// Agnes AI 客户端
// 复用你原 ai-tools 的接口：chat / image / video / video_status / translate
// 开发态：请求 /api/agnes（由 vite proxy 在服务端注入 key，bundle 里没有 key）
// 生产态：VITE_AGNES_BASE 指向 Supabase Edge Function；调用时只带 Supabase 匿名 key 鉴权函数本身。
//          Agnes key 仅存在于函数端 secret，前端永远不持有、不发送它。

const API_HOST = 'https://apihub.agnes-ai.com'

function resolveBase(): string {
  const base = (import.meta as any).env?.VITE_AGNES_BASE as string | undefined
  if (base && base.trim()) return base.trim() // 形如 https://xxxx.functions.supabase.co/agnes-proxy
  return '/api/agnes' // 开发代理（Vite 在服务端注入 key，bundle 里没有 key）
}

// 安全约定：
// - 开发态（base 以 "/" 开头）：不带的任何 key，由本地 Vite 代理在服务端注入 Agnes key。
// - 生产态（base 是 Supabase Edge Function 地址）：只带 Supabase 匿名 key 去鉴权函数调用本身。
//   Agnes key 永远只存在于函数端的 Deno secret 里，绝不进前端 bundle、绝不出现在本函数。
//   因此这里严禁读取/发送任何名为 AGNES 的 key。
function resolveAuthHeaders(): Record<string, string> {
  const base = resolveBase()
  if (base.startsWith('/')) return {} // 开发代理
  const anon = (import.meta as any).env?.VITE_SUPABASE_ANON as string | undefined
  return anon ? { Authorization: `Bearer ${anon}` } : {}
}

async function call<T = any>(
  path: string,
  opts: { method?: string; body?: any; direct?: boolean }
): Promise<T> {
  const base = resolveBase()
  const url = `${base}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...resolveAuthHeaders()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 180000)
  try {
    const res = await fetch(url, {
      method: opts.method || 'POST',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const t = await res.text()
        if (t) msg += ` ${t.slice(0, 300)}`
      } catch {}
      throw new Error(msg)
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) return (await res.json()) as T
    return (await res.text()) as unknown as T
  } finally {
    clearTimeout(timer)
  }
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function agnesChat(
  messages: ChatMsg[],
  model = 'agnes-2.0-flash',
  maxTokens = 4096
): Promise<string> {
  const data = await call('/v1/chat/completions', {
    body: { model, messages, max_tokens: Math.min(maxTokens, 8192), stream: false }
  })
  return data?.choices?.[0]?.message?.content ?? ''
}

export async function agnesTranslate(
  text: string,
  target = 'en',
  source = 'auto'
): Promise<string> {
  const data = await call('/v1/chat/completions', {
    body: {
      model: 'agnes-2.0-flash',
      messages: [
        { role: 'system', content: `Translate from ${source} to ${target}. Only translation, no explanation.` },
        { role: 'user', content: text }
      ],
      max_tokens: 4096,
      stream: false
    }
  })
  return data?.choices?.[0]?.message?.content ?? text
}

export async function agnesImage(
  prompt: string,
  model = 'agnes-image-2.1-flash',
  size = '1024x768'
): Promise<string> {
  const data = await call('/v1/images/generations', {
    body: {
      model,
      prompt,
      size,
      extra_body: { response_format: 'url' }
    }
  })
  // 兼容不同返回结构
  if (data?.data?.[0]?.url) return data.data[0].url
  if (data?.data?.url) return data.data.url
  if (typeof data?.url === 'string') return data.url
  if (typeof data === 'string' && /^https?:\/\//.test(data)) return data
  throw new Error('图片生成未返回可用 URL：' + JSON.stringify(data).slice(0, 200))
}

export interface VideoCreateOpts {
  prompt: string
  numFrames?: number
  frameRate?: number
  seed?: number
  height?: number
  width?: number
  firstFrameUrl?: string // 首帧关键帧（修复原版被丢弃的关键帧）
  lastFrameUrl?: string // 尾帧关键帧
}

export interface VideoCreateResult {
  video_id: string
  status?: string
}

export async function agnesVideoCreate(opts: VideoCreateOpts): Promise<VideoCreateResult> {
  const numFrames =
    opts.numFrames ?? 121
  const body: any = {
    prompt: (opts.prompt || '').trim(),
    num_frames: Math.floor(((Math.min(Math.max(numFrames, 1), 401) - 1) / 8) * 8) + 1,
    frame_rate: Math.min(Math.max(opts.frameRate || 24, 1), 60),
    seed: opts.seed ?? Math.floor(Math.random() * 2147483647)
  }
  if (opts.height) body.height = opts.height
  if (opts.width) body.width = opts.width
  // —— 关键帧透传（原 ai-tools 的 v_ 代理把 image/last_frame 丢了，这里真正传进去）——
  if (opts.firstFrameUrl) body.image = opts.firstFrameUrl
  if (opts.lastFrameUrl && opts.lastFrameUrl !== opts.firstFrameUrl)
    body.last_frame = opts.lastFrameUrl

  const data = await call('/v1/video/create', { body })
  if (!data?.video_id) throw new Error('视频创建未返回 video_id：' + JSON.stringify(data).slice(0, 200))
  return { video_id: data.video_id, status: data.status }
}

export interface VideoStatus {
  status: string
  video_url?: string
}

export async function agnesVideoStatus(videoId: string): Promise<VideoStatus> {
  const data = await call<VideoStatus>(`/v1/videos/${videoId}`, { method: 'GET' })
  return { status: data?.status || 'processing', video_url: data?.video_url }
}
