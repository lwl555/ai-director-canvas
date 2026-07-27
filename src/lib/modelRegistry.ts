// 模型注册表：国内 + 国外品牌预设模板
// 用户只需在「设置」里填入对应品牌的 API key，即可切换使用。
// Agnes 是平台默认模型（走已有 agnes-proxy，无需用户填 key）。
//
// 接入方式分两类：
// - route: 'direct'（默认）：前端浏览器直连厂商 OpenAI 兼容端点，key 取自本机缓存。
//   适用于 OpenAI 兼容协议的厂商（含国内大部分）。
// - route: 'proxy'：由已部署的 model-proxy Edge Function 转发。该函数在服务端做
//   协议/ schema 转换（Anthropic / Gemini / MiniMax / 文心 与 OpenAI 格式不同），
//   浏览器把本机 key 经 Authorization 头带上，函数转发到厂商，规避浏览器 CORS。
//   若无 model-proxy，这几家会提示「请先部署代理」而非崩溃。

export type RouteMode = 'direct' | 'proxy'

export interface ModelProvider {
  id: string
  brand: string
  region: 'cn' | 'global'
  /** 该品牌默认聊天模型名 */
  defaultModel: string
  /** 官方 API 基址（展示用） */
  apiBase: string
  /** 是否需要用户填 key */
  needsKey: boolean
  /** OpenAI 兼容的聊天端点（route:'direct' 用） */
  chatEndpoint?: string
  /** 接入方式：direct=浏览器直连；proxy=经 model-proxy 服务端转发 */
  route?: RouteMode
  /** 一句话简介（可含填 key 格式提示） */
  note?: string
}

export const PROVIDERS: ModelProvider[] = [
  {
    id: 'agnes',
    brand: 'Agnes（默认）',
    region: 'global',
    defaultModel: 'agnes-2.0-flash',
    apiBase: 'Agnes AI（专用代理）',
    needsKey: false,
    note: '平台内置，开箱即用，无需配置'
  },
  // —— 国内（OpenAI 兼容，浏览器直连） ——
  { id: 'deepseek', brand: 'DeepSeek', region: 'cn', defaultModel: 'deepseek-chat', apiBase: 'api.deepseek.com', needsKey: true, chatEndpoint: 'https://api.deepseek.com/chat/completions', note: '性价比高，中文强' },
  { id: 'doubao', brand: '豆包（火山方舟）', region: 'cn', defaultModel: 'doubao-seed-1.6-250615', apiBase: 'ark.cn-beijing.volces.com', needsKey: true, chatEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', note: '字节系，生图/生视频亦有' },
  { id: 'qwen', brand: '通义千问', region: 'cn', defaultModel: 'qwen-max', apiBase: 'dashscope.aliyuncs.com', needsKey: true, chatEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', note: '阿里系' },
  { id: 'hunyuan', brand: '腾讯混元', region: 'cn', defaultModel: 'hunyuan-turbo', apiBase: 'api.hunyuan.cloud.tencent.com', needsKey: true, chatEndpoint: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', note: '腾讯系' },
  { id: 'kimi', brand: 'Kimi（月之暗面）', region: 'cn', defaultModel: 'moonshot-v1-8k', apiBase: 'api.moonshot.cn', needsKey: true, chatEndpoint: 'https://api.moonshot.cn/v1/chat/completions', note: '长文本强' },
  { id: 'zhipu', brand: '智谱 GLM', region: 'cn', defaultModel: 'glm-4-plus', apiBase: 'open.bigmodel.cn', needsKey: true, chatEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', note: '清华系' },
  { id: 'step', brand: '阶跃星辰', region: 'cn', defaultModel: 'step-1.5-flash', apiBase: 'api.stepfun.com', needsKey: true, chatEndpoint: 'https://api.stepfun.com/v1/chat/completions', note: '多模态' },
  { id: 'baichuan', brand: '百川', region: 'cn', defaultModel: 'baichuan4', apiBase: 'api.baichuan-ai.com', needsKey: true, chatEndpoint: 'https://api.baichuan-ai.com/v1/chat/completions', note: '医疗/金融垂域' },
  // —— 国外（OpenAI 兼容，浏览器直连；OpenAI 官方受 CORS 限制） ——
  { id: 'openai', brand: 'OpenAI', region: 'global', defaultModel: 'gpt-4o-mini', apiBase: 'api.openai.com', needsKey: true, chatEndpoint: 'https://api.openai.com/v1/chat/completions', note: '通用强（浏览器直连可能受 CORS 限制）' },
  { id: 'grok', brand: 'Grok（xAI）', region: 'global', defaultModel: 'grok-2', apiBase: 'api.x.ai', needsKey: true, chatEndpoint: 'https://api.x.ai/v1/chat/completions', note: 'OpenAI 兼容' },
  { id: 'mistral', brand: 'Mistral', region: 'global', defaultModel: 'mistral-large-latest', apiBase: 'api.mistral.ai', needsKey: true, chatEndpoint: 'https://api.mistral.ai/v1/chat/completions', note: '欧洲开源系' },
  // —— 需服务端协议转换（route:'proxy'，须在 Supabase 部署 model-proxy） ——
  { id: 'claude', brand: 'Claude（Anthropic）', region: 'global', defaultModel: 'claude-3-5-sonnet-latest', apiBase: 'api.anthropic.com', needsKey: true, route: 'proxy', note: '经 model-proxy 转发（Anthropic Messages 协议）' },
  { id: 'gemini', brand: 'Gemini（Google）', region: 'global', defaultModel: 'gemini-1.5-pro', apiBase: 'generativelanguage.googleapis.com', needsKey: true, route: 'proxy', note: '经 model-proxy 转发（Gemini 协议）' },
  { id: 'minimax', brand: 'MiniMax', region: 'cn', defaultModel: 'abab6.5s-chat', apiBase: 'api.minimax.chat', needsKey: true, route: 'proxy', note: '经 model-proxy 转发（MiniMax 协议）' },
  { id: 'ernie', brand: '文心一言', region: 'cn', defaultModel: 'ernie-4.5-8k', apiBase: 'qianfan.baidu.com', needsKey: true, route: 'proxy', note: '格式：API_KEY:SECRET_KEY（冒号分隔，经 model-proxy 换 token）' }
]

export function getProvider(id: string): ModelProvider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}
