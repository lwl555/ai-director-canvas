// AI 网页小应用生成 / 改进封装
// ---------------------------------------------------------------
// 复用 chat.ts 的 sendChat 统一入口（Agnes / 直连 / 代理 三通路自动路由），
// 仅额外注入「只输出自包含单文件 HTML」的专用 system 提示。
// 输出统一剥离 ```html 围栏，并裁剪到 <!DOCTYPE … </html> 之间，
// 保证存进快应用、塞进 iframe srcDoc 的都是干净可运行的 HTML。
import { sendChat } from './chat'
import type { ChatMsg } from './agnes'

const WEBAPP_SYSTEM = `你是一个擅长做「单文件网页小应用」的前端工程师。
当用户描述一个想法时，请直接输出一个**完整、自包含、可直接在浏览器打开运行**的单文件 HTML 文档。
要求：
1. 必须是一份完整 HTML 文档：以 <!DOCTYPE html> 开头、</html> 结尾；所有 CSS 写在 <style> 内，所有 JS 写在 <script> 内。
2. 不要引用任何外部资源（不要用外链 CSS/JS/CDN 依赖），除非是公共 CDN 且页面在无网时也能优雅降级。
3. 视觉精致、现代、有设计感；移动端友好（含 viewport meta + 响应式）。
4. 功能真正可用，不只是静态展示。
5. 只输出代码本身，**不要**任何解释文字、**不要**使用 \`\`\`html 代码围栏、前后不要加多余文字。
如果用户要求改进/修改已有代码，在原有代码基础上修改，并返回完整的新代码（同样只输出代码本身）。`

/** 从模型原始回复里抽取干净的 HTML 文档 */
function extractHtml(raw: string): string {
  let s = raw.replace(/```(?:html)?/gi, '').trim()
  const startDoctype = s.search(/<!DOCTYPE/i)
  const startHtml = s.search(/<html/i)
  const start = startDoctype !== -1 ? startDoctype : startHtml
  const end = s.lastIndexOf('</html>')
  if (start === -1 || end === -1) return s // 退化：原样返回（至少能跑）
  return s.slice(start, end + '</html>'.length).trim()
}

/** 根据自然语言描述生成一个网页小应用（完整可运行 HTML） */
export async function generateWebApp(desc: string, providerId: string, model: string): Promise<string> {
  const messages: ChatMsg[] = [{ role: 'user', content: `请帮我做一个网页小应用：${desc}` }]
  const raw = await sendChat(messages, providerId, model, { system: WEBAPP_SYSTEM })
  return extractHtml(raw)
}

/** 在已有代码基础上，按指令让 AI 改进，返回完整新代码 */
export async function improveWebApp(
  code: string,
  instruction: string,
  providerId: string,
  model: string
): Promise<string> {
  const messages: ChatMsg[] = [
    {
      role: 'user',
      content: `以下是当前的网页小应用完整代码：\n\n\`\`\`html\n${code}\n\`\`\`\n\n请根据以下要求改进它：${instruction}\n只返回改进后的完整代码本身。`
    }
  ]
  const raw = await sendChat(messages, providerId, model, { system: WEBAPP_SYSTEM })
  return extractHtml(raw)
}
