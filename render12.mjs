// render12.mjs — 视频层验证：用分镜定格图作首帧 + 独立 negative_prompt
// 复用 render11_out 的 4 张定镜定格图 url 作为首帧，验证"一致性修复 + negative_prompt 剥离"
// 走 Supabase 代理 agnes-proxy；受 Agnes 免费档 1 视频/分钟限流，脚本自限速串链 + 断点续跑
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render12_out'
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 与线上 NEGATIVE_BASE 一致（已剥离到独立 negative_prompt 字段）
const NEGATIVE_BASE = 'no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated.'

async function fetchWithTimeout(url, opts, ms = 90_000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

// 视频创建：处理 429/503/网络抖动退避重试（限流由调用方串链保证）
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
        throw new Error(`create ${res.status} ${t.slice(0, 160)}`)
      }
      return res.json()
    } catch (e) {
      lastErr = e
      const isLimit = /429|503|rate_limit|queue|aborted|fetch failed/i.test(e?.message || '')
      const wait = isLimit ? 20000 + attempt * 5000 : 8000
      log(`  create retry ${attempt}/20: ${e?.message?.slice(0, 80)} (wait ${wait}ms)`)
      if (attempt < 20) await sleep(wait)
    }
  }
  throw lastErr
}

// 视频状态轮询：GET /agnesapi?video_id= ，429 退避，解析多种 url 字段
async function videoStatus(video_id) {
  let lastErr
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const res = await fetchWithTimeout(`${AGNES_BASE}/agnesapi?video_id=${encodeURIComponent(video_id)}`, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + ANON }
      }, 60_000)
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

function findUrl(d) {
  return d?.metadata?.url || d?.video_url || d?.remixed_from_video_id || d?.result?.url || d?.url
}

async function download(url, path) {
  const res = await fetchWithTimeout(url, {}, 120_000)
  if (!res.ok) throw new Error('dl ' + res.status)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

function hashSeed(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function buildVidPrompt(shot) {
  const speak = shot.dialogue.length
    ? shot.dialogue.map((d) =>
        `The character ${d.speaker} speaks in quiet, natural Mandarin Chinese: "${d.line}". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained expression, no exaggerated smile. NO English speech.`
      ).join(' ')
    : 'No spoken dialogue in this shot.'
  return [
    '[PARAMS] cinematic, photorealistic, high detail, 24fps, smooth natural motion',
    '[SUBJECT & ACTION] ' + shot.prompt,
    '[SPEAKING] ' + speak,
    '[REALISM] natural skin texture, real-world lighting, subtle ambient motion, photorealistic',
    '[CONSISTENCY] keep identical character appearance and clothing as the first frame',
    '[DELIVERY] understated, restrained, natural, not theatrical, no exaggerated smile'
  ].join('\n')
}

// 复用 render11_out 的分镜定格图 url 作为首帧（验证"分镜定格图作首帧"修复）
const SHOTS = [
  { n: 1, title: '巷口独候', dialogue: [],
    prompt: 'Cinematic realistic medium shot, a rainy night alley, a young Chinese woman in beige trench coat waiting alone under neon light, a Chinese man in dark grey jacket walking toward her from the far end, wet pavement reflections, moody atmospheric lighting, photorealistic, film still.' },
  { n: 2, title: '站台相遇', dialogue: [{ speaker: '林晚', line: '也等末班车？' }],
    prompt: 'Cinematic realistic two-shot, late-night empty bus stop in light rain, a young Chinese woman in beige trench coat and a Chinese man in dark grey jacket standing close together under the cold station light, both clearly visible, wet ground, photorealistic, film still.' },
  { n: 3, title: '欲言又止', dialogue: [{ speaker: '陈默', line: '算了，没事。' }],
    prompt: 'Cinematic realistic close shot, the same bus stop, the young Chinese woman in beige trench coat looking at the man in dark grey jacket with hesitant expression, he looks away, light rain, consistent appearance and clothing, photorealistic, film still.' }
]

async function main() {
  log('[render12] 开始')
  let lastCreate = 0
  for (const shot of SHOTS) {
    const base = `${OUT}/vid_${shot.n}_${shot.title}`
    if (existsSync(base + '.mp4')) { log(`跳过已有视频 [${shot.n}] ${shot.title}`); continue }
    const ffPath = `render11_out/shot_${shot.n}_${shot.title}.txt`
    if (!existsSync(ffPath)) { log(`缺少首帧 ${ffPath}，跳过`); continue }
    const ff = readFileSync(ffPath, 'utf8').trim()

    const body = {
      model: 'agnes-video-v2.0',
      prompt: buildVidPrompt(shot),
      image: ff,
      negative_prompt: NEGATIVE_BASE,
      num_frames: 81, // 8n+1，约 3.4s 短镜
      frame_rate: 24,
      seed: hashSeed(shot.title),
      height: 1024,
      width: 768
    }

    // 自限速：相邻创建 ≥ 62s（Agnes 免费档 1 视频/分钟）
    const elapsed = Date.now() - lastCreate
    if (lastCreate && elapsed < 62000) await sleep(62000 - elapsed)

    log(`创建视频 [${shot.n}] ${shot.title}`)
    const created = await videoCreate(body)
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
    log(`  ok vid_${shot.n}_${shot.title}.mp4`)
  }
  log('[render12] 完成')
}
main().catch((e) => { log('[render12] FATAL ' + (e?.message || e)); process.exit(1) })
