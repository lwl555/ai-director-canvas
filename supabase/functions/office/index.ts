// Edge Function: office —— VPS 浏览器智能体网关
//
// 路由（均 verify_jwt=false，配合无登录模型）：
//   POST /           启动任务：建 job 行 → 转发到 OFFICE_WORKER_URL（VPS 上跑 Playwright）→ 返回 {jobId}
//   POST /report     VPS 回报进度（校验 job+device 后 service_role 写 office_jobs）
//   POST /files-upload  签名上传 URL（返回 signedUrl + path）
//   POST /files          签名下载 URL（给定 path 返回 1h 有效 URL）
//   GET  /           查询 job 状态（?jobId=&deviceId=）
//
// 安全：service_role 仅存于本函数内；VPS 只拿到回报地址/jobId/deviceId/Agnes 代理地址，
//       不直接持有 Supabase 密钥。Storage 写入经本函数签发的临时上传 URL。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AGNES_PROXY = `${SB_URL}/functions/v1/agnes-proxy`
const OFFICE_URL = `${SB_URL}/functions/v1/office`
const WORKER_URL = Deno.env.get('OFFICE_WORKER_URL') || ''

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/office/, '') || '/'
  try {
    // —— 启动任务 ——
    if (req.method === 'POST' && path === '/') {
      const { deviceId, task, files, model } = await req.json()
      if (!UUID.test(deviceId)) return json({ error: 'invalid deviceId' }, 400)
      if (!task || !String(task).trim()) return json({ error: 'empty task' }, 400)
      if (!WORKER_URL) {
        return json({ error: '办公执行后端未配置（缺少 OFFICE_WORKER_URL）' }, 503)
      }

      const client = sb()
      const { data: job, error } = await client
        .from('office_jobs')
        .insert({ device_id: deviceId, task: String(task).slice(0, 4000), model: model || 'agnes-2.0-flash', status: 'pending' })
        .select()
        .single()
      if (error) return json({ error: error.message }, 500)

      // 转发任务到 VPS worker（同步等待其确认接收，但不被长任务阻塞）
      const fList = Array.isArray(files) ? files.slice(0, MAX_FILES) : []
      const payload = {
        jobId: job.id,
        deviceId,
        task: String(task).slice(0, 4000),
        model: model || 'agnes-2.0-flash',
        officeUrl: OFFICE_URL,
        agnesProxyUrl: AGNES_PROXY,
        files: fList.map((f: any) => ({
          name: String(f.name || 'file'),
          content: String(f.content || '').slice(0, MAX_FILE_BYTES)
        }))
      }
      try {
        const workerRes = await fetch(WORKER_URL.replace(/\/$/, '') + '/task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!workerRes.ok) {
          const txt = await workerRes.text().catch(() => '')
          return json({ error: 'worker rejected task: ' + txt }, 502)
        }
      } catch (e: any) {
        return json({ error: 'worker unreachable: ' + (e?.message || String(e)) }, 503)
      }

      return json({ jobId: job.id, status: 'pending' })
    }

    // —— VPS 回报进度 ——
    if (req.method === 'POST' && path === '/report') {
      const { jobId, deviceId, status, plan, logs, artifacts, error } = await req.json()
      if (!UUID.test(deviceId) || !jobId) return json({ error: 'bad params' }, 400)
      const client = sb()
      const upd: any = { updated_at: new Date().toISOString() }
      if (status) upd.status = status
      if (plan !== undefined) upd.plan = plan
      if (logs !== undefined) upd.logs = String(logs)
      if (artifacts !== undefined) upd.artifacts = artifacts
      if (error !== undefined) upd.error = String(error)
      const { error: e } = await client
        .from('office_jobs')
        .update(upd)
        .eq('id', jobId)
        .eq('device_id', deviceId)
      if (e) return json({ error: e.message }, 500)
      return json({ ok: true })
    }

    // —— 签名上传 URL ——
    if (req.method === 'POST' && path === '/files-upload') {
      const { jobId, deviceId, name, size } = await req.json()
      if (!UUID.test(deviceId) || !jobId || !name) return json({ error: 'bad params' }, 400)
      if (size > 50_000_000) return json({ error: 'file too large' }, 413)
      const client = sb()
      const p = `${deviceId}/${jobId}/${String(name).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')}`
      const { data, error } = await client.storage
        .from('office-artifacts')
        .createSignedUploadUrl(p)
      if (error) return json({ error: error.message }, 500)
      return json({ url: data.signedUrl, path: p })
    }

    // —— 签名下载 URL ——
    if (req.method === 'POST' && path === '/files') {
      const { deviceId, path: p } = await req.json()
      if (!UUID.test(deviceId) || !p || !String(p).startsWith(`${deviceId}/`)) {
        return json({ error: 'bad params' }, 400)
      }
      const client = sb()
      const { data, error } = await client.storage
        .from('office-artifacts')
        .createSignedUrl(p, 3600)
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
