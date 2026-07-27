// 通用模型代理 Edge Function（无登录版）
// 浏览器把本机 key 经 Authorization: Bearer <key> 带上，本函数在服务端做协议/schema
// 转换后转发到对应厂商，规避浏览器 CORS。仅白名单内的 provider 可转发（防开放转发滥用）。
// 支持：claude / gemini / minimax / ernie（其余 OpenAI 兼容模型走前端直连，不经此函数）。
import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

interface Msg { role: 'system' | 'user' | 'assistant'; content: string }
const WHITELIST = ['claude', 'gemini', 'minimax', 'ernie']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const apiKey = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!apiKey) return json({ error: 'missing api key' }, 401)
    const { provider, model, messages } = await req.json()
    if (!WHITELIST.includes(provider)) return json({ error: `unsupported provider: ${provider}` }, 400)
    if (!Array.isArray(messages) || messages.length === 0) return json({ error: 'invalid messages' }, 400)

    // 文心需先换 access_token（两步），单独处理
    if (provider === 'ernie') {
      const text = await ernieForward(apiKey, model, messages as Msg[])
      const data = JSON.parse(text)
      if (data?.error_code) return json({ error: '文心错误：' + (data.error_msg ?? data.error_code) }, 502)
      return json({ choices: [{ message: { role: 'assistant', content: data?.result ?? '' } }] })
    }

    const built = build(provider, model, messages as Msg[], apiKey)
    const upstream = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body)
    })
    const text = await upstream.text()
    if (!upstream.ok) {
      let detail = text.slice(0, 300)
      try { detail = JSON.parse(text)?.error?.message ?? detail } catch {}
      return json({ error: `${provider} 上游返回 ${upstream.status}: ${detail}` }, upstream.status)
    }
    const data = JSON.parse(text)
    const content = extract(provider, data)
    return json({ choices: [{ message: { role: 'assistant', content } }] })
  } catch (e: any) {
    return json({ error: e?.message ?? 'proxy error' }, 500)
  }
})

// 按 provider 构造上游请求（ernie 除外）
function build(provider: string, model: string, messages: Msg[], apiKey: string) {
  if (provider === 'claude') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
    const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: 1024, system: system || undefined, messages: rest }
    }
  }
  if (provider === 'gemini') {
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      headers: { 'Content-Type': 'application/json' },
      body: { systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, contents }
    }
  }
  // minimax：不支持 system 角色，转成 user
  const msgs = messages.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content }))
  return {
    url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: { model, messages: msgs }
  }
}

// 文心两步：先换 token，再对话
async function ernieForward(apiKey: string, model: string, messages: Msg[]) {
  const [ak, sk] = apiKey.split(':')
  if (!sk) throw new Error('文心格式应为 API_KEY:SECRET_KEY（冒号分隔）')
  const tokRes = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${ak}&client_secret=${sk}`
  )
  const tok = await tokRes.json()
  if (!tok.access_token) throw new Error('文心换取 access_token 失败：' + (tok.error_description ?? tok.error))
  const msgs = messages.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content }))
  const r = await fetch(
    `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${model}?access_token=${tok.access_token}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }) }
  )
  return await r.text()
}

// 抽取归一化文本
function extract(provider: string, data: any): string {
  if (provider === 'claude') return (data.content ?? []).map((c: any) => c.text ?? '').join('')
  if (provider === 'gemini') return (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
  if (provider === 'minimax') {
    if (data?.choices?.[0]?.messages?.content) return data.choices[0].messages.content
    if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content
    if (data?.reply) return data.reply
    return ''
  }
  return ''
}
