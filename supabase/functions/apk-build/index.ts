// 云端 APK 构建触发器（服务端，持有 GitHub PAT）
// 平台点「打包 APK」→ 本函数把快应用 HTML 写入仓库 apk-build 分支 → 触发 GitHub Actions 编译 APK → 发布到 Release。
// 浏览器轮询 ?asset=... 获取进度与最终下载地址。无需本机 Android Studio。
import { serve } from 'https://deno.land/std@0.200.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

const REPO = 'lwl555/ai-director-canvas'
const BRANCH = 'apk-build'
const API = `https://api.github.com/repos/${REPO}`

function gh(opts: RequestInit): RequestInit {
  return {
    ...opts,
    headers: {
      ...(opts.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${Deno.env.get('GH_PAT')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lingjing-apk'
    }
  }
}

function b64utf8(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

// 写入仓库文件（存在则带 sha 更新），触发 push → Actions 构建
async function putContent(path: string, contentB64: string, message: string): Promise<number> {
  let sha: string | undefined
  const g = await fetch(`${API}/contents/${path}?ref=${BRANCH}`, gh({ method: 'GET' }))
  if (g.status === 200) {
    try {
      sha = (await g.json()).sha
    } catch {
      /* ignore */
    }
  }
  const body: Record<string, unknown> = { message, content: contentB64, branch: BRANCH }
  if (sha) body.sha = sha
  const r = await fetch(`${API}/contents/${path}`, gh({ method: 'PUT', body: JSON.stringify(body) }))
  return r.status
}

// 删除仓库文件（壳模式前清掉旧快应用，避免被误判为快应用 APK）
async function deleteContent(path: string): Promise<void> {
  const g = await fetch(`${API}/contents/${path}?ref=${BRANCH}`, gh({ method: 'GET' }))
  if (g.status !== 200) return
  let sha: string | undefined
  try {
    sha = (await g.json()).sha
  } catch {
    return
  }
  if (!sha) return
  await fetch(
    `${API}/contents/${path}`,
    gh({ method: 'DELETE', body: JSON.stringify({ message: 'build: clear quickapp', branch: BRANCH, sha }) })
  )
}

async function handlePost(body: { mode?: string; html?: string; name?: string }) {
  if (body.mode === 'quickapp') {
    const b64 = b64utf8(body.html || '')
    await putContent(
      'android/app/src/main/assets/quickapp.html',
      b64,
      `build: quickapp ${body.name || ''}`
    )
  } else {
    // 壳模式：先清掉可能存在的旧快应用，确保产出平台壳 APK
    await deleteContent('android/app/src/main/assets/quickapp.html')
    const b64 = b64utf8(String(Date.now()))
    await putContent('android/.platform-build', b64, 'build: platform')
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

async function handleGet(asset: string) {
  const r = await fetch(`${API}/actions/runs?branch=${BRANCH}&event=push&per_page=1`, gh({ method: 'GET' }))
  const j = await r.json()
  const run = j.workflow_runs?.[0]
  if (!run) {
    return json({ status: 'pending' })
  }
  if (run.status === 'completed') {
    if (run.conclusion === 'success') {
      const link = `https://github.com/${REPO}/releases/download/android-build/${asset}`
      return json({ status: 'done', url: link })
    }
    return json({ status: 'failed', conclusion: run.conclusion })
  }
  return json({ status: run.status })
}

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = new URL(req.url)
    if (req.method === 'POST') {
      const body = await req.json()
      return await handlePost(body)
    }
    const asset = url.searchParams.get('asset') || 'app-debug.apk'
    return await handleGet(asset)
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }
})
