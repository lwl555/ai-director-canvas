// Agnes AI 客户端
// 复用你原 ai-tools 的接口：chat / image / video / video_status / translate
// 开发态：请求 /api/agnes（由 vite proxy 在服务端注入 key，bundle 里没有 key）
// 生产态：VITE_AGNES_BASE 指向 Supabase Edge Function；调用时只带 Supabase 匿名 key 鉴权函数本身。
//          Agnes key 仅存在于函数端 secret，前端永远不持有、不发送它。

import { ROUTES } from './modelRouter'

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
  /** 用户消息附带的多模态图片（data URL），随消息一起发给模型（OpenAI 兼容 image_url 形态） */
  images?: string[]
  /** 用户附加的文档（仅文本）：随消息一起发给模型，但不塞进气泡正文，气泡里只显示名称芯片 */
  doc?: { name: string; text: string }
}

/**
 * 把内部 ChatMsg 转成 OpenAI 兼容 API 的 content 形态：
 * - 用户消息且带图片 / 文档 → 多模态 parts（text + image_url）
 * - 其余 → 纯文本字符串
 * 这样 agnesChat 与 chat.ts 的代理 / 直连路由都能复用同一套转换，向后兼容。
 */
export function toApiContent(m: ChatMsg): string | any[] {
  if (m.role === 'user') {
    const parts: any[] = []
    let text = m.content || ''
    if (m.doc) {
      text = `【用户附加文档《${m.doc.name}》全文】\n${m.doc.text}\n【文档结束】\n\n` + (text ? `用户留言：\n${text}` : '')
    }
    if (text) parts.push({ type: 'text', text })
    for (const u of (m.images || []).slice(0, 8)) {
      parts.push({ type: 'image_url', image_url: { url: u } })
    }
    if (parts.length === 1 && parts[0].type === 'text') return parts[0].text
    if (parts.length === 0) return ''
    return parts
  }
  return m.content
}

export async function agnesChat(
  messages: ChatMsg[],
  model: string = ROUTES.chat,
  maxTokens = 4096
): Promise<string> {
  const data = await call('/v1/chat/completions', {
    body: {
      model,
      messages: messages.map((m) => ({ role: m.role, content: toApiContent(m) })),
      max_tokens: Math.min(maxTokens, 8192),
      stream: false
    }
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
      model: ROUTES.translate,
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
  model = ROUTES.image,
  size = '1024x768',
  image?: string | string[]
): Promise<string> {
  if (!prompt || !prompt.trim()) {
    throw new Error('提示词为空，无法生成图片（请先填写英文提示词，或上传一张参考图作为首帧）')
  }
  const body: any = {
    model,
    prompt,
    size,
    extra_body: { response_format: 'url' }
  }
  // 图生图：把首帧/主参考图作为 image 输入，让定格图继承人物外貌与服装（角色一致性）
  if (image) {
    if (Array.isArray(image) && image.length) {
      // 多参考图（角色定妆 + 场景 + 道具）条件化构图
      body.extra_body.image = image.slice(0, 3)
    } else if (typeof image === 'string') {
      body.image = image
    }
  }
  // 上游偶发 503（Service busy），自动重试 2 次，避免用户感知为"点了没反应"
  let lastErr: any
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const data = await call('/v1/images/generations', { body })
      // 兼容不同返回结构
      if (data?.data?.[0]?.url) return data.data[0].url
      if (data?.data?.url) return data.data.url
      if (typeof data?.url === 'string') return data.url
      if (typeof data === 'string' && /^https?:\/\//.test(data)) return data
      throw new Error('图片生成未返回可用 URL：' + JSON.stringify(data).slice(0, 200))
    } catch (e: any) {
      lastErr = e
      // 仅在 503/网络抖动时重试
      if (/503|Service busy|timeout|network|abort/i.test(e?.message || '')) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
  throw lastErr
}

export interface VideoCreateOpts {
  prompt: string
  numFrames?: number
  frameRate?: number
  seed?: number
  height?: number
  width?: number
  firstFrameUrl?: string // 首帧关键帧（图生视频 ti2vid）
  lastFrameUrl?: string // 尾帧关键帧（与首帧一起走 keyframes 模式）
  negativePrompt?: string // 独立负向提示词（从正向 prompt 的 [NEGATIVE] 段剥离）
  model?: string // Agnes 视频模型名（如 agnes-video-v2.0）
}

export interface VideoCreateResult {
  video_id: string // 官方推荐用于轮询的 ID
  task_id?: string // 旧兼容端点使用的 ID
  status?: string
}

// 真实 Agnes 视频端点：POST /v1/videos（需 model 字段）
export const AGNES_VIDEO_MODEL = ROUTES.video

export async function agnesVideoCreateRaw(opts: VideoCreateOpts): Promise<VideoCreateResult> {
  const numFrames = opts.numFrames ?? 121
  const body: any = {
    model: opts.model || AGNES_VIDEO_MODEL,
    prompt: (opts.prompt || '').trim(),
    // 官方要求 num_frames 满足 8n+1 且 <= 441（约 18 秒上限）
    // 注意：取整必须是 8 * floor((C-1)/8) + 1，不能用 floor(((C-1)/8)*8)+1（后者会原样返回 C）
    num_frames: 8 * Math.floor((Math.min(Math.max(numFrames, 1), 441) - 1) / 8) + 1,
    frame_rate: Math.min(Math.max(opts.frameRate || 24, 1), 60),
    seed: opts.seed ?? Math.floor(Math.random() * 2147483647)
  }
  if (opts.height) body.height = opts.height
  if (opts.width) body.width = opts.width
  // —— 官方关键帧规范 ——
  // 首帧 + 尾帧都存在 → 走 keyframes 模式（extra_body.image 数组）
  // 仅首帧 → 走 ti2vid（顶层 image）
  // 注意：官方没有顶层 last_frame 字段，必须用 extra_body 数组，否则会被忽略或 400
  if (opts.firstFrameUrl && opts.lastFrameUrl && opts.firstFrameUrl !== opts.lastFrameUrl) {
    body.extra_body = { image: [opts.firstFrameUrl, opts.lastFrameUrl], mode: 'keyframes' }
  } else if (opts.firstFrameUrl) {
    body.image = opts.firstFrameUrl
  }
  if (opts.negativePrompt) body.negative_prompt = opts.negativePrompt

  const data = await call('/v1/videos', { body })
  // 官方返回同时含 id / task_id / video_id，优先用 video_id（推荐轮询端点）
  const video_id = data?.video_id || data?.id || data?.task_id
  if (!video_id) throw new Error('视频创建未返回任务 ID：' + JSON.stringify(data).slice(0, 200))
  return { video_id, task_id: data?.task_id || data?.id, status: data?.status }
}

// —— 视频创建限速器 ——
// Agnes 免费档硬限制：视频「创建」请求每分钟最多 1 个（超限返回 429 rate_limit_exceeded
// 或 video_queue_full）。上层 produceAll / generateAllVideos 为提速会每批并发 3 个视频，
// 必然撞限流。把串行化放在 API 客户端层（而非上层），无论调用方怎么并发，所有视频创建
// 都会被串到一条全局链上、并保证相邻两次间隔 >= VIDEO_MIN_GAP_MS；遇到 429 / 队列满则
// 指数退避重试，而不是把错误直接甩给 UI。
const VIDEO_MIN_GAP_MS = 62_000
let lastVideoCreateAt = 0
let videoCreateChain: Promise<unknown> = Promise.resolve()

function videoSleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function agnesVideoCreate(opts: VideoCreateOpts): Promise<VideoCreateResult> {
  const run = videoCreateChain.then(async () => {
    // 与上一次创建至少间隔 VIDEO_MIN_GAP_MS
    const elapsed = Date.now() - lastVideoCreateAt
    if (elapsed < VIDEO_MIN_GAP_MS) await videoSleep(VIDEO_MIN_GAP_MS - elapsed)
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        const res = await agnesVideoCreateRaw(opts)
        lastVideoCreateAt = Date.now()
        return res
      } catch (e: any) {
        const msg = String(e?.message || '')
        // 限流 / 队列满：退避后重试（40 次足够覆盖十几分钟的排队）
        if (/rate_limit|429|video_queue_full/i.test(msg)) {
          const wait = 65_000 + attempt * 15_000
          console.warn(`[agnes] 视频创建限流，退避 ${Math.round(wait / 1000)}s（第 ${attempt + 1} 次）`)
          await videoSleep(wait)
          continue
        }
        throw e
      }
    }
    throw new Error('视频创建多次限流重试后仍失败')
  })
  // 不让单次失败阻断后续排队调用（run 本身仍会向原调用方 reject）
  videoCreateChain = run.then(
    () => {},
    () => {}
  )
  return run
}

export interface VideoStatus {
  status: string
  video_url?: string
}

// 官方轮询：推荐 GET /agnesapi?video_id=<ID>；旧兼容 GET /v1/videos/<TASK_ID>
// 最终视频地址在 metadata.url（也兼容顶层 url / video_url）
//
// ⚠️ 限流容错（关键）：Agnes 免费档对「视频状态查询」也有频率上限。若轮询过密（<15s）
// 会撞 429（video status query rate limit exceeded）；瞬时网络抖动也可能 fetch failed。
// 这里统一退避重试，不把错误甩给上层 UI —— 否则长视频生成会因一次查询失败而整体中断。
const STATUS_MAX_RETRY = 20
async function queryStatusOnce(videoId: string): Promise<VideoStatus> {
  const parse = (data: any): VideoStatus => {
    const st = (data?.status || 'processing').toLowerCase()
    const done = st === 'completed' || st === 'succeeded' || st === 'done'
    const url = data?.metadata?.url || data?.video_url || data?.url
    return {
      status: done ? 'completed' : st === 'failed' ? 'failed' : 'processing',
      video_url: url
    }
  }
  // 1) 推荐端点（video_id）
  try {
    const data = await call<VideoStatus & { url?: string; metadata?: { url?: string } }>(
      `/agnesapi?video_id=${encodeURIComponent(videoId)}`,
      { method: 'GET' }
    )
    return parse(data)
  } catch (e: any) {
    // 2) 降级旧端点（task_id），仅当推荐端点明确 404 时尝试
    if (/404/.test(e?.message || '')) {
      throw e // 404 不是限流，直接上抛由重试层决定是否走旧端点
    }
    throw e
  }
}

export async function agnesVideoStatus(videoId: string, taskId?: string, attempt = 0): Promise<VideoStatus> {
  try {
    return await queryStatusOnce(videoId)
  } catch (e: any) {
    const msg = String(e?.message || '')
    // 查询限流：退避重试（覆盖约 5 分钟排队），不中断流程
    if (/rate_limit|429/i.test(msg) && attempt < STATUS_MAX_RETRY) {
      await new Promise((r) => setTimeout(r, 20_000 + attempt * 5_000))
      return agnesVideoStatus(videoId, taskId, attempt + 1)
    }
    // 瞬时网络错误：退避重试，不中断
    if (/fetch failed|network|timeout|abort|ECONN|ETIMEDOUT/i.test(msg) && attempt < STATUS_MAX_RETRY) {
      await new Promise((r) => setTimeout(r, 15_000 + attempt * 5_000))
      return agnesVideoStatus(videoId, taskId, attempt + 1)
    }
    // 推荐端点 404 且提供了 task_id：试旧端点
    if (taskId && /404/.test(msg)) {
      try {
        const data = await call<VideoStatus & { url?: string; metadata?: { url?: string } }>(
          `/v1/videos/${encodeURIComponent(taskId)}`,
          { method: 'GET' }
        )
        const st = (data?.status || 'processing').toLowerCase()
        const done = st === 'completed' || st === 'succeeded' || st === 'done'
        const url = data?.metadata?.url || data?.video_url || data?.url
        return { status: done ? 'completed' : st === 'failed' ? 'failed' : 'processing', video_url: url }
      } catch {
        throw e
      }
    }
    throw e
  }
}
