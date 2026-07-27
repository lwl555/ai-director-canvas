// render13c.mjs — 增强版视频验证：render11 定格图首帧 + 强负面词 + 近静态微运动
// 目标：压住 render13b 暴露的失控（尾段陈默身份漂移成西装男、林晚下半身变短裙、陈默突然大笑）
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render13c_out'
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n'); console.log(s) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 增强负面词：在 render13b 基础上加 identity/extra-people/laugh/sudden-motion 约束
const NEGATIVE_BASE = 'no extra people, no additional person, no bystander, no third character, no crowd, no identity change, no face change, no face swap, no different person, no outfit change, no clothing change, no hairstyle change, no hair color change, no laughing, no grin, no smiling, no open-mouth laugh, no exaggerated expression, no creepy smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no extra limbs, no twisted limbs, no sudden movement, no abrupt motion, no pose change, no jumping, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, low resolution, blurry, washed out, oversaturated.'

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

// 详细 videoPrompt：运动降到近静态 micro-motion，说话镜头部动作 barely perceptible
const VIDEOS = [
  {
    n: 1, title: '巷口候车',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, nearly static shot
[SCENE] rainy night old alley, wet stone pavement, amber streetlamp left, cold blue neon puddle reflections
[SUBJECT] the two characters EXACTLY as shown in the first frame: a young Chinese woman in a BEIGE double-breasted knee-length wool trench coat (left ear tiny silver stud), and a Chinese man in a DARK GREY overcoat — no other people present
[ACTION] almost still; only rain falling diagonally, tiny fabric sway from wind, faint breath; NO walking, NO new characters, NO movement of feet
[CONSISTENCY] lock exact character identity, face, clothing, hair, earring to the first frame; the same two people only; no identity change, no extra person
[REALISM] natural skin texture, real-world wet-night lighting
[DELIVERY] calm, neutral, no expression change, no smile
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 2, title: '并肩',
    prompt: `[PARAMS] cinematic, photorealistic, 24fps, nearly static shot
[SCENE] rainy night bus stop, shallow DoF, rainy bokeh background, warm-cool mixed light
[SUBJECT] the two characters EXACTLY as shown in first frame: the dark-grey-overcoat man and the beige-trench-coat woman, standing about one step apart — no third person
[ACTION] almost still; very slow horizontal drift of camera, hair gently blown by wind, rain falling; no body movement, no pose change, no clothing change
[CONSISTENCY] identical appearance, clothing, hair, lower body (trench coat covers knees), shoes as first frame; the same two people only; no extra person
[REALISM] natural skin, real wet-night light, photorealistic
[DELIVERY] subdued, introspective, neutral face, no smile
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 3, title: '搭话',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, very subtle
[SCENE] rainy night bus stop, shallow DoF, streetlamp side light, blurred rainy bokeh bg
[SUBJECT] the two characters EXACTLY as shown in first frame (beige-trench woman, dark-grey-overcoat man) — no other people
[ACTION] the woman turns her head BARELY perceptibly and asks quietly; the man turns his eyes toward her with a neutral restrained look; minimal motion, no smile, no laughter
[CONSISTENCY] identical appearance, clothing, hair, identity as prior shots; the same two people only; no identity change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, internal, neutral, no smile, no exaggerated expression
[SPEAKING] The woman speaks in quiet, natural Mandarin Chinese: "也等末班车？". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, neutral restrained expression. NO English speech.`
  },
  {
    n: 4, title: '欲言又止',
    prompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, very slow, intimate
[SCENE] rainy night, warm streetlamp on lit half, profile in shadow, shallow DoF
[SUBJECT] the two characters EXACTLY as shown in first frame (dark-grey-overcoat man, beige-trench-coat woman) — no other people
[ACTION] the man opens his mouth as if to speak, then shakes his head slightly and looks down; the woman watches him, eyes softening; minimal, natural, restrained motion, no laughter, no smile
[CONSISTENCY] identical appearance, clothing, hair, earring, identity as first frame; the same two people only; no identity change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, vulnerable but restrained, neutral, no exaggerated smile, no theatrical laugh
[SPEAKING] The man speaks in quiet, natural Mandarin Chinese: "算了，没事。". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained, eyes lowered. NO English speech.`
  }
]

async function main() {
  log('[render13c] 开始 — 增强版视频验证（render11 定格图首帧 + 强负面词 + 近静态微运动）')
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
  log('[render13c] 完成')
}

main().catch((e) => { log('[render13c] FATAL ' + (e?.message || e)); process.exit(1) })
