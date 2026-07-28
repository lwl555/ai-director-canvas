// Edge Function: office —— 纯 Supabase 自包含办公智能体（无 VPS / 无 E2B）
//
// 路由（均 verify_jwt=false，配合无登录模型）：
//   POST /           启动任务：建 job 行 → EdgeRuntime.waitUntil(runTask) 后台跑 → 立刻返回 {jobId}
//   POST /files      签名下载 URL（给定 path 返回 1h 有效 URL）
//   GET  /           查询 job 状态（?jobId=&deviceId=）
//
// runTask 在同一函数内完成：调 agnes-proxy 做 LLM 规划+出内容 → 用 esm.sh 的纯 JS 文档库
// 现场生成二进制 → 经签名上传 URL PUT 到 office-artifacts 私有桶 → 逐步写回 DB。
//
// 安全：service_role 仅存于本函数内；device_id 隔离由 .eq('device_id',deviceId) 强制；
//       Storage 私有桶 + 函数签发临时 URL；/files 强校验 path 以 ${deviceId}/ 开头。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AGNES_PROXY = `${SB_URL}/functions/v1/agnes-proxy`
const BUCKET = 'office-artifacts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FILES = 6
const MAX_FILE_BYTES = 3_000_000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

const sb = () => createClient(SB_URL, SB_SVC)

// —— 调用大模型（经 agnes-proxy，OpenAI 兼容）——
async function llm(system: string, user: string, model: string): Promise<string> {
  const res = await fetch(AGNES_PROXY + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) throw new Error('LLM 调用失败: ' + (await res.text()).slice(0, 200))
  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? ''
}

// —— 写回 job 字段 ——
async function patchJob(jobId: string, deviceId: string, patch: Record<string, unknown>) {
  const client = sb()
  const { error } = await client
    .from('office_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('device_id', deviceId)
  if (error) throw new Error('DB 更新失败: ' + error.message)
}

// —— 从 LLM 文本里提取第一个 JSON 对象 ——
function extractJson(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

// —— 探测任务里是否含网址（用于只读型网页总结）——
function findUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'）)]+/i)
  return m ? m[0] : null
}

// —— 抓取网页正文（只读，无浏览器）——
async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 office-agent' } })
    if (!res.ok) return ''
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    return text.slice(0, 20000)
  } catch {
    return ''
  }
}

function detectFormat(task: string, explicit?: string): string {
  const t = (explicit || '').toLowerCase()
  if (['ppt', 'pptx', '幻灯片', 'slides'].includes(t)) return 'pptx'
  if (['doc', 'docx', 'word', '报告', '文档', '纪要', '总结'].includes(t)) return 'docx'
  if (['xlsx', 'excel', '表格', 'csv'].includes(t)) return 'xlsx'
  if (t === 'pdf') return 'pdf'
  const s = task.toLowerCase()
  if (s.includes('ppt') || s.includes('幻灯片') || s.includes('演示')) return 'pptx'
  if (s.includes('excel') || s.includes('表格') || s.includes('xlsx')) return 'xlsx'
  if (s.includes('pdf')) return 'pdf'
  if (s.includes('报告') || s.includes('文档') || s.includes('纪要') || s.includes('总结') || s.includes('word')) return 'docx'
  return 'docx' // 默认出 Word 报告
}

// —— 根据 spec 现场生成文档二进制 ——
async function buildDocument(
  format: string,
  spec: any
): Promise<{ bytes: Uint8Array; filename: string; kind: string }> {
  const title = String(spec?.title || '办公交付物').slice(0, 60)
  if (format === 'pptx') {
    const PptxGenJS = (await import('https://esm.sh/pptxgenjs@3.12.0')).default
    const pptx = new PptxGenJS()
    const slides = Array.isArray(spec.slides) ? spec.slides : []
    for (const s of slides.slice(0, 20)) {
      const slide = pptx.addSlide()
      slide.addText(String(s.title || ''), { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 28, bold: true })
      const bullets = Array.isArray(s.bullets) ? s.bullets.map((b: any) => String(b)).filter(Boolean) : []
      if (bullets.length) slide.addText(bullets, { x: 0.6, y: 1.6, w: 9, h: 5, fontSize: 18, bullet: true })
      if (s.notes) slide.addNotes(String(s.notes))
    }
    const buf = (await pptx.write({ outputType: 'nodebuffer' })) as Uint8Array
    return { bytes: new Uint8Array(buf), filename: `${title}.pptx`, kind: 'pptx' }
  }
  if (format === 'docx') {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('https://esm.sh/docx@8.5.0')
    const sections = Array.isArray(spec.sections) ? spec.sections : []
    const children: any[] = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })]
    for (const sec of sections.slice(0, 40)) {
      children.push(new Paragraph({ text: String(sec.heading || ''), heading: HeadingLevel.HEADING_1 }))
      const body = String(sec.body || '')
      for (const para of body.split('\n').filter(Boolean)) {
        children.push(new Paragraph({ children: [new TextRun(para)] }))
      }
    }
    const doc = new Document({ sections: [{ children }] })
    const buf = (await Packer.toBuffer(doc)) as Uint8Array
    return { bytes: new Uint8Array(buf), filename: `${title}.docx`, kind: 'docx' }
  }
  if (format === 'xlsx') {
    const XLSX = (await import('https://esm.sh/xlsx@0.18.5')).default
    const sheets = Array.isArray(spec.sheets) ? spec.sheets : []
    const wb = XLSX.utils.book_new()
    for (const sh of sheets.slice(0, 10)) {
      const rows = Array.isArray(sh.rows) ? sh.rows : []
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, String(sh.name || 'Sheet1').slice(0, 28))
    }
    if (!sheets.length) {
      const ws = XLSX.utils.aoa_to_sheet([['项目', '数值'], ['示例', 1]])
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    }
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    return { bytes: new Uint8Array(buf), filename: `${title}.xlsx`, kind: 'xlsx' }
  }
  // pdf（pdf-lib 手动排版，偏弱但可用）
  const { PDFDocument, StandardFonts } = await import('https://esm.sh/pdf-lib@1.17.1')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const sections = Array.isArray(spec.sections) ? spec.sections : []
  const lines: string[] = [title, '']
  for (const sec of sections.slice(0, 40)) {
    lines.push(String(sec.heading || ''))
    lines.push(...String(sec.body || '').split('\n').filter(Boolean))
    lines.push('')
  }
  let y = 750
  const page = pdf.addPage([595, 842])
  for (const line of lines) {
    if (y < 50) {
      y = 750
      page = pdf.addPage([595, 842])
    }
    page.drawText(line.slice(0, 90), { x: 40, y, size: 12, font })
    y -= 18
  }
  const buf = (await pdf.save()) as Uint8Array
  return { bytes: new Uint8Array(buf), filename: `${title}.pdf`, kind: 'pdf' }
}

// —— 核心：后台执行一个办公任务 ——
async function runTask(
  jobId: string,
  deviceId: string,
  task: string,
  files: { name: string; content: string }[],
  model: string,
  explicitFormat?: string
) {
  const client = sb()
  try {
    const format = detectFormat(task, explicitFormat)
    await patchJob(jobId, deviceId, {
      status: 'planning',
      plan: [
        { title: '分析任务需求', done: false },
        { title: '规划文档结构', done: false },
        { title: '生成内容并排版', done: false },
        { title: '导出成品', done: false }
      ]
    })

    // 组装上下文：用户文件 + 网页正文
    let context = ''
    for (const f of files.slice(0, MAX_FILES)) {
      context += `\n\n[用户文件: ${f.name}]\n${String(f.content || '').slice(0, 8000)}`
    }
    const url = findUrl(task)
    let pageText = ''
    if (url) {
      pageText = await fetchPageText(url)
      if (pageText) context += `\n\n[网页 ${url} 正文]\n${pageText}`
    }

    const fmtName = { pptx: 'PPT', docx: 'Word 文档', xlsx: 'Excel 表格', pdf: 'PDF' }[format] || '文档'
    await patchJob(jobId, deviceId, {
      status: 'running',
      plan: [
        { title: '分析任务需求', done: true },
        { title: '规划文档结构', done: false },
        { title: '生成内容并排版', done: false },
        { title: '导出成品', done: false }
      ],
      logs: `已接收任务，目标格式：${fmtName}${url ? '（含网页抓取）' : ''}`
    })

    const sysPrompt =
      `你是一个办公文档生成助手。根据用户需求，输出一个 JSON 规格，不要任何解释、不要代码块标记。` +
      `格式为：{"title":"标题",` +
      (format === 'pptx'
        ? '"slides":[{"title":"页标题","bullets":["要点1","要点2"],"notes":"讲解词(可选)"}]}'
        : format === 'xlsx'
        ? '"sheets":[{"name":"表名","rows":[["列1","列2"],["值1","值2"]]}]}'
        : '"sections":[{"heading":"章节标题","body":"章节正文，可含换行"}]}') +
      `。内容要专业、具体、可直接使用。`
    const userPrompt = `任务：${task}\n${context ? '参考素材：' + context : ''}\n请输出符合上述格式的 JSON。`

    const raw = await llm(sysPrompt, userPrompt, model)
    let spec = extractJson(raw)
    if (!spec) {
      // 兜底：把原文当一个章节
      spec = { title: task.slice(0, 50), sections: [{ heading: '内容', body: raw.slice(0, 4000) }] }
    }

    await patchJob(jobId, deviceId, {
      status: 'generating',
      plan: [
        { title: '分析任务需求', done: true },
        { title: '规划文档结构', done: true },
        { title: '生成内容并排版', done: true },
        { title: '导出成品', done: false }
      ]
    })

    const { bytes, filename, kind } = await buildDocument(format, spec)

    // 上传到私有桶（经签名上传 URL）
    const path = `${deviceId}/${jobId}/${filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')}`
    const { data: up, error: upErr } = await client.storage.from(BUCKET).createSignedUploadUrl(path)
    if (upErr) throw new Error('签名上传失败: ' + upErr.message)
    const putRes = await fetch(up.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes
    })
    if (!putRes.ok) throw new Error('上传成品失败: ' + (await putRes.text()).slice(0, 200))

    await patchJob(jobId, deviceId, {
      status: 'done',
      plan: [
        { title: '分析任务需求', done: true },
        { title: '规划文档结构', done: true },
        { title: '生成内容并排版', done: true },
        { title: '导出成品', done: true }
      ],
      artifacts: [{ name: filename, path, size: bytes.length, kind }],
      logs: '已完成，可下载成品。'
    })
  } catch (e: any) {
    await patchJob(jobId, deviceId, { status: 'error', error: String(e?.message || e) })
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/office/, '') || '/'
  try {
    // —— 启动任务 ——
    if (req.method === 'POST' && path === '/') {
      const { deviceId, task, files, model, format } = await req.json()
      if (!UUID.test(deviceId)) return json({ error: 'invalid deviceId' }, 400)
      if (!task || !String(task).trim()) return json({ error: 'empty task' }, 400)

      const client = sb()
      const { data: job, error } = await client
        .from('office_jobs')
        .insert({
          device_id: deviceId,
          task: String(task).slice(0, 4000),
          model: model || 'agnes-2.0-flash',
          status: 'pending'
        })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)

      const fList = Array.isArray(files) ? files.slice(0, MAX_FILES) : []
      const payload = fList.map((f: any) => ({
        name: String(f.name || 'file'),
        content: String(f.content || '').slice(0, MAX_FILE_BYTES)
      }))

      // 后台异步执行（EdgeRuntime.waitUntil 保证响应返回后继续跑）
      const jobId = job.id
      const did = deviceId
      const tk = String(task)
      const md = model || 'agnes-2.0-flash'
      const fm = format ? String(format) : undefined
      // @ts-ignore Deno 全局
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(runTask(jobId, did, tk, payload, md, fm))
      } else {
        // 兜底：同步跑（部分运行环境）
        runTask(jobId, did, tk, payload, md, fm)
      }

      return json({ jobId: job.id, status: 'pending' })
    }

    // —— 签名下载 URL ——
    if (req.method === 'POST' && path === '/files') {
      const { deviceId, path: p } = await req.json()
      if (!UUID.test(deviceId) || !p || !String(p).startsWith(`${deviceId}/`)) {
        return json({ error: 'bad params' }, 400)
      }
      const client = sb()
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(p, 3600)
      if (error) return json({ error: error.message }, 500)
      return json({ url: data.signedUrl })
    }

    // —— 查询状态 ——
    if (req.method === 'GET' && path === '/') {
      const jobId = url.searchParams.get('jobId')
      const deviceId = url.searchParams.get('deviceId')
      if (!UUID.test(deviceId || '') || !jobId) return json({ error: 'bad params' }, 400)
      const client = sb()
      const { data, error } = await client
        .from('office_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('device_id', deviceId)
        .single()
      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    return json({ error: 'not found' }, 404)
  } catch (e: any) {
    return json({ error: e?.message ?? 'office error' }, 500)
  }
})
