// 统一聊天入口：根据所选模型路由到不同后端。
// - Agnes：走已有 agnes-proxy（Agnes key 永不进前端）。
// - 其他品牌：
//   · route:'direct' → 前端浏览器直连厂商 OpenAI 兼容端点，key 取自本机缓存，无需登录。
//   · route:'proxy'  → 转 model-proxy Edge Function，由其在服务端做协议/schema 转换
//                      并转发到厂商；浏览器把本机 key 经 Authorization 头带上，规避 CORS。
import { agnesChat, type ChatMsg } from './agnes'
import { getProvider } from './modelRegistry'
import { getApiKey } from './userKeys'

const MODEL_PROXY_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1/model-proxy'

// 平台默认对话的「全能又温柔」人设（原生融入灵境平台）。
// 作用范围：仅本文件 sendChat 注入，画布的 DirectorChat 直接调 agnesChat，不会带上这段，
// 因此画布仍保持导演口吻、默认聊天保持温柔全能口吻，二者互不干扰。
const ASSISTANT_SYSTEM_PROMPT = `你是「灵境」，一个全能又温柔的 AI 助手，也是「灵境 AI」平台的核心智能体。
你知识面广、能力强：写作、创作、编程、翻译、总结、答疑、策划、陪聊、出主意……什么都乐意搭手，也真的擅长。
你的风格温柔、耐心、有温度：像一位可靠又贴心的朋友，说话自然、温暖、不端架子，也不会冷冰冰地甩术语；
当用户需要鼓励时给予支持，当用户迷茫时帮忙理清思路，当用户的想法很棒时由衷地一起高兴。
你不是某个狭窄领域的专家，而是一个什么都能帮上忙的全能伙伴；遇到影视 / 创作类话题可以格外内行，
但面对任何话题，都用最合适、最贴心的方式回应。请始终用与用户相同的语言交流。`

function withPersona(messages: ChatMsg[], system?: string): ChatMsg[] {
  const sys = system ?? ASSISTANT_SYSTEM_PROMPT
  if (messages[0]?.role === 'system') return messages
  return [{ role: 'system', content: sys }, ...messages]
}

export async function sendChat(
  messages: ChatMsg[],
  providerId: string,
  model: string,
  opts?: { system?: string }
): Promise<string> {
  const provider = getProvider(providerId)

  // Agnes：直接复用画布已有的对话客户端，但补上通用助手人设
  if (providerId === 'agnes') {
    return agnesChat(withPersona(messages, opts?.system), model)
  }

  // 经服务端代理（协议/schema 差异，由 model-proxy 做转换）
  if (provider.route === 'proxy') {
    return proxyChat(withPersona(messages, opts?.system), provider, model)
  }

  // 浏览器直连：取本机 key
  const apiKey = await getApiKey(providerId)
  if (!apiKey) {
    throw new Error(`请先在「设置」页填写 ${provider.brand} 的 API Key。`)
  }
  const endpoint = provider.chatEndpoint
  if (!endpoint) {
    throw new Error(`「${provider.brand}」缺少聊天端点配置。`)
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: withPersona(messages, opts?.system),
        stream: false
      })
    })
  } catch {
    throw new Error(
      `无法连接到 ${provider.brand}（可能被浏览器 CORS 策略拦截或网络异常）。\n可改用服务端代理方案，或尝试支持 CORS 的模型。`
    )
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const t = await res.text()
      if (t) msg += ` ${t.slice(0, 200)}`
    } catch {}
    if (res.status === 401) msg = `${provider.brand} 的 API Key 无效或已过期。`
    else if (res.status === 429) msg = `${provider.brand} 请求过于频繁，请稍后再试。`
    throw new Error(msg)
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// 经 model-proxy 转发（Claude / Gemini / MiniMax / 文心 等协议不兼容模型）
async function proxyChat(messages: ChatMsg[], provider: ReturnType<typeof getProvider>, model: string): Promise<string> {
  if (!MODEL_PROXY_URL) {
    throw new Error(`「${provider.brand}」需要服务端 model-proxy，但前端未配置 Supabase 地址。`)
  }
  const apiKey = await getApiKey(provider.id)
  if (!apiKey) {
    throw new Error(`请先在「设置」页填写 ${provider.brand} 的 API Key。`)
  }
  let res: Response
  try {
    res = await fetch(MODEL_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ provider: provider.id, model, messages })
    })
  } catch {
    throw new Error(
      `无法连接到 ${provider.brand} 代理（model-proxy 未部署或网络异常）。\n请在 Supabase 部署 model-proxy 函数。`
    )
  }
  if (!res.ok) {
    let msg = `代理返回 HTTP ${res.status}`
    try {
      const t = await res.text()
      const j = JSON.parse(t)
      if (j?.error) msg = j.error
      else if (t) msg += ` ${t.slice(0, 200)}`
    } catch {}
    if (res.status === 401) msg = `${provider.brand} 的 API Key 无效或已过期。`
    else if (res.status === 429) msg = `${provider.brand} 请求过于频繁，请稍后再试。`
    throw new Error(msg)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}
