// render14.mjs — 三阶段管线：规划(Plan) → 生成(Generate) → 渲染(Render)
// 核心改动（相对 render13c）：
//  1. 规划层从结构化 storyboard JSON 读取分镜，支持 --dry-run 先展示计划（人机确认闸门）
//  2. 生成层用 keyframes 链式锁帧：每段 extra_body.image=[首帧URL, 尾帧URL] + mode:keyframes
//     尾帧直接取"下一段的定格图 URL" → shot N-1 结尾 == shot N 开头，按构造无缝衔接
//  3. 渲染层用 frameutil.concat 把各段拼成成片
// 用法：
//   node render14.mjs --dry-run     # 只输出解析后的分镜计划，不烧 API
//   node render14.mjs               # 完整跑 规划→生成→渲染
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PROJECT = dirname(fileURLToPath(import.meta.url))
const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const PY = 'C:/Users/sxiao/.workbuddy/binaries/python/envs/default/Scripts/python.exe'
const STORYBOARD = resolve(PROJECT, 'storyboard_v1.json')
const OUT = resolve(PROJECT, 'render14_out')
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n'); console.log(s) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchWithTimeout(url, opts, ms = 90_000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

async function videoCreate(body) {
  let lastErr
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const res = await fetchWithTimeout(AGNES_BASE + '/v1/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
        body: JSON.stringify(body)
      }, 90_000)
      if (res.status === 429 || res.status === 503) {
        const t = await res.text().catch(() => '')
        throw new Error(`${res.status} ${t.slice(0, 120)}`)
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        const msg = `${res.status} ${t.slice(0, 160)}`
        // keyframes 模式不被支持 → 立即退出重试，交给上层回退
        if (/keyframe|unsupported|invalid param|parameter|mode/i.test(msg)) throw new Error('KEYFRAME_UNSUPPORTED:' + msg)
        throw new Error('create ' + msg)
      }
      return res.json()
    } catch (e) {
      lastErr = e
      if (e.message && e.message.startsWith('KEYFRAME_UNSUPPORTED')) throw e
      const isLimit = /429|503|rate_limit|queue|aborted|fetch failed/i.test(e?.message || '')
      const wait = isLimit ? 20000 + attempt * 5000 : 8000
      log(`  create retry ${attempt}/20: ${e?.message?.slice(0, 80)} (wait ${wait}ms)`)
      if (attempt < 20) await sleep(wait)
    }
  }
  throw lastErr
}

async function videoStatus(video_id) {
  let lastErr
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const res = await fetchWithTimeout(`${AGNES_BASE}/agnesapi?video_id=${encodeURIComponent(video_id)}`, { method: 'GET' }, 60_000)
      if (res.status === 429) { await sleep(20000 + attempt * 3000); continue }
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`status ${res.status} ${t.slice(0, 120)}`) }
      return res.json()
    } catch (e) {
      lastErr = e
      const isLimit = /429|aborted|fetch failed/i.test(e?.message || '')
      const wait = isLimit ? 20000 : 8000
      log(`  status retry ${attempt}/20: ${e?.message?.slice(0, 80)} (wait ${wait}ms)`)
      if (attempt < 20) await sleep(wait)
    }
  }
  throw lastErr
}

function findUrl(d) { return d?.metadata?.url || d?.video_url || d?.result?.url || d?.url }
async function download(url, path) {
  const res = await fetchWithTimeout(url, {}, 120_000)
  if (!res.ok) throw new Error('dl ' + res.status)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}
function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
function fmt(sec) { const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }

// ---------- 规划层 ----------
function loadPlan() {
  const sb = JSON.parse(readFileSync(STORYBOARD, 'utf8'))
  const g = sb.global
  let t = 0
  const shots = sb.shots.map((sh, i) => {
    const readKey = (p) => p ? readFileSync(resolve(PROJECT, p), 'utf8').trim() : null
    const firstURL = readKey(sh.firstFrameKey)
    const lastURL = readKey(sh.lastFrameKey)
    const plan = {
      index: i + 1,
      id: sh.id,
      title: sh.title,
      timecodeStart: fmt(t),
      durationSec: +(sh.durationFrames / g.frame_rate).toFixed(2),
      durationFrames: sh.durationFrames,
      shotSize: sh.shotSize,
      cameraHint: sh.cameraHint,
      transition: sh.transition,
      dialogue: sh.dialogue,
      firstURL,
      lastURL,
      videoPrompt: sh.videoPrompt,
      chain: lastURL ? `结尾锁定 = 下一段(${sb.shots[i + 1]?.id || '—'}) 首帧` : '尾帧不锁（收尾镜）'
    }
    t += sh.durationFrames / g.frame_rate
    return plan
  })
  return { global: g, shots, totalSec: +t.toFixed(2) }
}

function printPlan(plan) {
  log('========== 规划层输出（storyboard_v1.json 解析）==========')
  log(`总时长 ≈ ${fmt(plan.totalSec)} (${plan.totalSec}s)，共 ${plan.shots.length} 镜`)
  log(`模型 ${plan.global.model} | ${plan.global.width}x${plan.global.height} @${plan.global.frame_rate}fps`)
  log('---------------------------------------------------------------')
  for (const s of plan.shots) {
    log(`[${s.id}] ${s.title}  TC ${s.timecodeStart}  时长 ${s.durationSec}s (${s.durationFrames}f)  ${s.shotSize}`)
    log(`     机位:${s.cameraHint}  转场:${s.transition}  台词:${s.dialogue || '—'}`)
    log(`     首帧: ${s.firstURL ? s.firstURL.slice(0, 64) + '…' : 'MISSING'}`)
    log(`     尾帧: ${s.lastURL ? s.lastURL.slice(0, 64) + '…' : '(不锁)'}`)
    log(`     链式: ${s.chain}`)
  }
  log('===============================================================')
  writeFileSync(resolve(OUT, 'plan.json'), JSON.stringify(plan, null, 2))
}

// ---------- 生成层 ----------
function keyframesBody(g, s, seed) {
  return {
    model: g.model,
    prompt: s.videoPrompt,
    negative_prompt: g.negative_prompt,
    num_frames: s.durationFrames,
    frame_rate: g.frame_rate,
    seed,
    height: g.height,
    width: g.width,
    extra_body: { image: [s.firstURL, s.lastURL], mode: 'keyframes' }
  }
}
function fallbackBody(g, s, seed) {
  return {
    model: g.model,
    prompt: s.videoPrompt,
    image: s.firstURL,
    negative_prompt: g.negative_prompt,
    num_frames: s.durationFrames,
    frame_rate: g.frame_rate,
    seed,
    height: g.height,
    width: g.width
  }
}

async function generateStage(plan) {
  log('[render14] 生成阶段开始（串行队列，创建限流 ≥62s）')
  let lastCreate = 0
  for (const s of plan.shots) {
    const base = resolve(OUT, `vid_${s.id}_${s.title}`)
    if (existsSync(base + '.mp4')) { log(`跳过已有 [${s.id}] ${s.title}`); continue }
    if (!s.firstURL) { log(`缺少首帧 URL，跳过 [${s.id}]`); continue }
    const seed = hashSeed(plan.global.seedBase + s.id)
    let body = s.lastURL ? keyframesBody(plan.global, s, seed) : fallbackBody(plan.global, s, seed)
    const elapsed = Date.now() - lastCreate
    if (lastCreate && elapsed < 62000) await sleep(62000 - elapsed)
    log(`创建视频 [${s.index}/${plan.shots.length}] ${s.title}（${s.lastURL ? 'keyframes 链式' : '首帧锁'}）`)
    let created
    try {
      created = await videoCreate(body)
    } catch (e) {
      if (e.message && e.message.startsWith('KEYFRAME_UNSUPPORTED')) {
        log('  keyframes 不支持，回退首帧锁 (top-level image)')
        body = fallbackBody(plan.global, s, seed)
        created = await videoCreate(body)
      } else throw e
    }
    lastCreate = Date.now()
    const video_id = created?.video_id || created?.id
    if (!video_id) { log('  无 video_id: ' + JSON.stringify(created).slice(0, 160)); continue }
    writeFileSync(base + '.id.txt', video_id)
    let url
    for (let i = 0; i < 60; i++) {
      await sleep(22000)
      const st = await videoStatus(video_id)
      const u = findUrl(st)
      const status = st?.status || (u ? 'completed' : 'pending')
      log(`  轮询 ${i}: status=${status}`)
      if (u) { url = u; break }
      if (status === 'failed') throw new Error('视频生成失败')
    }
    if (!url) throw new Error('轮询超时未拿到 url')
    await download(url, base + '.mp4')
    log(`  ok vid_${s.id}_${s.title}.mp4`)
  }
  log('[render14] 生成阶段完成')
}

// ---------- 渲染层 ----------
function renderStage(plan) {
  log('[render14] 渲染阶段：拼接成片')
  const manifest = resolve(OUT, 'segments.txt')
  const lines = plan.shots.map((s) => resolve(OUT, `vid_${s.id}_${s.title}.mp4`)).filter(existsSync)
  if (lines.length < plan.shots.length) log('  警告：部分片段缺失，仅拼接已有的 ' + lines.length + ' 段')
  writeFileSync(manifest, lines.join('\n') + '\n')
  const out = resolve(OUT, 'final.mp4')
  execFileSync(PY, ['frameutil.py', 'concat', manifest, out], { cwd: PROJECT, stdio: ['ignore', 'inherit', 'inherit'] })
  log(`[render14] 成片 -> ${out}`)
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const plan = loadPlan()
  printPlan(plan)
  if (dryRun) { log('[render14] --dry-run 完成，未烧 API。确认计划后去掉 --dry-run 重跑。'); return }
  await generateStage(plan)
  renderStage(plan)
  log('[render14] 全部完成')
}

main().catch((e) => { log('[render14] FATAL ' + (e?.message || e)); process.exit(1) })
