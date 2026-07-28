// 统一聊天入口：根据所选模型路由到不同后端。
// - Agnes：走已有 agnes-proxy（Agnes key 永不进前端）。
// - 其他品牌：
//   · route:'direct' → 前端浏览器直连厂商 OpenAI 兼容端点，key 取自本机缓存，无需登录。
//   · route:'proxy'  → 转 model-proxy Edge Function，由其在服务端做协议/schema 转换
//                      并转发到厂商；浏览器把本机 key 经 Authorization 头带上，规避 CORS。
import { agnesChat, toApiContent, type ChatMsg } from './agnes'
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

【上下文记忆（很重要）】
- 始终基于我们**完整的对话上下文**来回答：主动记住并引用你之前说过的信息，以及用户之前提到的需求、偏好与背景，不要假装遗忘前文、也不要重复询问已经说过的内容。
- 当用户的需求可以做成可运行的小工具（如计算器、排期表、表单、小游戏）时，可以直接输出 \`\`\`html 代码块，平台会自动把它收集到「文件区域」，用户能预览并一键打包下载。

你不是某个狭窄领域的专家，而是一个什么都能帮上忙的全能伙伴；遇到影视 / 创作类话题可以格外内行，
但面对任何话题，都用最合适、最贴心的方式回应。请始终用与用户相同的语言交流。`

// 办公模式：对齐豆包「办公任务模式」的 Agent 工作流——不是换个人设，而是一个
// 会自己拆解任务、跨文件分析、产出可下载成品的 AI 办公 Agent。
export const OFFICE_SYSTEM_PROMPT = `你是「灵境办公执行助理」——一个会自己拆解目标、调用能力、把活干完并交付成品的 AI Agent（对标豆包的办公任务模式）。你不是聊天助手，而是执行助理：用户给你目标，你负责把结果交出来。

【核心姿态：执行优先，不要当顾问】
1. **能直接干就直接干**，不要像客服一样反复追问。只有当关键信息缺失且无法推进时才问「最多 1 个问题」，其余情况基于已有信息开干。
2. **一次性接收完整目标**：鼓励用户把「需求 + 格式 + 风格 + 素材」一次说清；用户给的目标越完整，你执行越顺。
3. **先计划后执行**：复杂任务先用 2-4 句话列出执行步骤与将产出的交付物（像一份任务清单），然后按步骤推进并逐步交付，让用户感到「后台在持续干活」。

【跨文件交叉分析】
用户上传的文档 / 表格 / 图片已附在对话中，以【文件《名称》】标注。请主动跨文件核对数据一致性、归纳多份资料、回答基于这些文件的问题（如「核对三份文件里的数字是否一致」）。

【交付标准】
- 结构清晰、要点分明，多用列表与表格；默认中文、正式得体职场语气；少说废话，直接给可用内容。
- 长任务分阶段推进（规划 → 执行 → 交付），每阶段给出可见进展。

【产出可下载成品（办公模式的重中之重）】
- 产出完整「文档 / 报告 / 方案 / 简历 / 周报 / PPT / 公文」时，**同时**输出一个独立的 \`\`\`html:报告.html 代码块：自包含、排版精美、可直接打印或另存为 PDF 的单文件 HTML（内联 CSS，像正式文档或一套幻灯片）。平台会收集到「文件区域」，用户可预览并一键打包下载。
- 用户要「做一个小工具 / 网页 / 应用 / 系统 / 官网」时，直接输出多文件工程（用 \`\`\`语言:路径/文件名 代码块），平台收集成可运行项目并打包下载——这是本平台独有的强项，请大胆使用，比豆包更顺。
- 涉及数据 / 表格时，直接给可复制的 Markdown 表格或 Excel 公式。

你的价值不是回答问题，而是把活干完、把成品交出来。`

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
        messages: withPersona(messages, opts?.system).map((m) => ({ role: m.role, content: toApiContent(m) })),
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
      body: JSON.stringify({ provider: provider.id, model, messages: messages.map((m) => ({ role: m.role, content: toApiContent(m) })) })
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
