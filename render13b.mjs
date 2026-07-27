// render13b.mjs — 绕路视频验证：用 render11 已验证的分镜定格图作首帧（图片层已 PASS）
// 套用新剧本 render13 的详细 videoPrompt（弱化起始姿态强约束，避免与首帧冲突），验证“提示词变细”对表情/一致性的改善
// 复用：独立 negative_prompt + understated 口型 + 视频 1/分钟限速 + 状态轮询容错 + 断点续跑
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render13b_out'
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n'); console.log(s) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const NEGATIVE_BASE = 'no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no hairstyle change, no hair color change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated.'

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
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`create ${res.status} ${t.slice(0, 160)}`) }
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

// 读 render11_out 的 4 张定格图首帧 URL（图片层已 PASS）
const RENDER11_FIRSTFRAME = [
  { n: 1, title: '巷口候车', src: 'render11_out/shot_1_巷口独候.txt' },
  { n: 2, title: '并肩', src: 'render11_out/shot_2_站台相遇.txt' },
  { n: 3, title: '搭话', src: 'render11_out/shot_3_欲言又止.txt' },
  { n: 4, title: '欲言又止', src: 'render11_out/shot_4_同撑一伞.txt' }
]

// 详细 videoPrompt（基于 render13 剧本，[SUBJECT] 改为“首帧所示”，[ACTION] 去强起始姿态，避免与首帧冲突）
const VIDEOS = [
  {
    n: 1, title: '巷口候车',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, slow subtle camera move
[SCENE] rainy night old alley, wet stone pavement, amber streetlamp left, cold blue neon puddle reflections
[SUBJECT] the two characters exactly as shown in the first frame: a young Chinese woman in a BEIGE double-breasted knee-length wool trench coat (left ear tiny silver stud), and a Chinese man in a DARK GREY overcoat
[ACTION] extremely slow subtle motion, rain falling diagonally, tiny fabric sway, ambient life, no abrupt move
[CONSISTENCY] keep exact character appearance, clothing, hair, earring as the first frame; no outfit change, no hairstyle change
[REALISM] natural skin texture, real-world wet-night lighting
[DELIVERY] calm, understated, restrained, no exaggerated expression, no smile
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 2, title: '并肩',
    prompt: `[PARAMS] cinematic, photorealistic, 24fps, slow camera move
[SCENE] rainy night bus stop, shallow DoF, rainy bokeh background, warm-cool mixed light
[SUBJECT] the two characters exactly as shown in first frame: the dark-grey-overcoat man and the beige-trench-coat woman, standing about one step apart
[ACTION] very slow horizontal pan, hair gently blown by wind, rain falling, subtle weight shift, no abrupt move
[CONSISTENCY] identical appearance, clothing, hair as first frame; no change
[REALISM] natural skin, real wet-night light, photorealistic
[DELIVERY] subdued, introspective, no smile, no exaggeration
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 3, title: '搭话',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, slow push-in
[SCENE] rainy night bus stop, shallow DoF, streetlamp side light, blurred rainy bokeh bg
[SUBJECT] the two characters exactly as shown in first frame (beige-trench woman, dark-grey-overcoat man)
[ACTION] the woman turns her head slightly and asks quietly; the man turns to look at her with a restrained almost-smile; very subtle, natural motion
[CONSISTENCY] identical appearance, clothing, hair as prior shots; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, internal, restrained, no exaggerated smile, no theatrical
[SPEAKING] The woman speaks in quiet, natural Mandarin Chinese: "也等末班车？". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained expression. NO English speech.`
  },
  {
    n: 4, title: '欲言又止',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, very slow, intimate
[SCENE] rainy night, warm streetlamp on lit half, profile in shadow, shallow DoF
[SUBJECT] the two characters exactly as shown in first frame (dark-grey-overcoat man, beige-trench-coat woman)
[ACTION] the man opens his mouth as if to speak, then shakes his head slightly and looks down; the woman watches him, eyes softening; minimal, natural motion
[CONSISTENCY] identical appearance, clothing, hair, earring as first frame; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, vulnerable but restrained, no exaggerated smile, no theatrical
[SPEAKING] The man speaks in quiet, natural Mandarin Chinese: "算了，没事。". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained, eyes lowered. NO English speech.`
  }
]

async function main() {
  log('[render13b] 开始 — 绕路视频验证（render11 定格图首帧 + render13 详细 videoPrompt）')
  // 读首帧
  const ffMap = {}
  for (const f of RENDER11_FIRSTFRAME) {
    if (!existsSync(f.src)) { log(`缺少首帧文件 ${f.src}，跳过`); continue }
    ffMap[f.n] = readFileSync(f.src, 'utf8').trim()
    log(`首帧 [${f.n}] ${f.title} from ${f.src}`)
  }

  let lastCreate = 0
  for (const v of VIDEOS) {
    const base = `${OUT}/vid_${v.n}_${v.title}`
    if (existsSync(base + '.mp4')) { log(`跳过已有视频 [${v.n}] ${v.title}`); continue }
    const ff = ffMap[v.n]
    if (!ff) { log(`缺少首帧 shot_${v.n}，跳过`); continue }
    const body = {
      model: 'agnes-video-v2.0',
      prompt: v.prompt,
      image: ff,
      negative_prompt: NEGATIVE_BASE,
      num_frames: 81,
      frame_rate: 24,
      seed: hashSeed(v.title),
      height: 1024,
      width: 768
    }
    const elapsed = Date.now() - lastCreate
    if (lastCreate && elapsed < 62000) await sleep(62000 - elapsed)
    log(`创建视频 [${v.n}/4] ${v.title}`)
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
    log(`  ok vid_${v.n}_${v.title}.mp4`)
  }
  log('[render13b] 完成')
}

main().catch((e) => { log('[render13b] FATAL ' + (e?.message || e)); process.exit(1) })
