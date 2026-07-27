// render13.mjs — 完整链：定妆图 → 分镜定格图 → 视频（用 screenplay_v2 详细 prompt）
// 复用已验证修复：分镜定格图作首帧 + 双角色定妆参考图 + 独立 negative_prompt + understated 口型
// 走 Supabase 代理 agnes-proxy；图片受 503 queue full 退避，视频免费档 1 个/分钟限速
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render13_out'
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n'); console.log(s) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 全局负面词（与线上一致 + 加 outfit/hairstyle 锁定，针对上一版漂移）
const NEGATIVE_BASE = 'no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no hairstyle change, no hair color change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated.'

async function fetchWithTimeout(url, opts, ms = 90_000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

// ---------- 图片生成（支持多张条件参考图） ----------
async function genImage(prompt, cond = []) {
  let lastErr
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const body = { model: 'agnes-image-2.1-flash', prompt, size: '768x1024', extra_body: { response_format: 'url' } }
      if (cond.length) body.extra_body.image = cond
      const res = await fetchWithTimeout(AGNES_BASE + '/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
        body: JSON.stringify(body)
      }, 90_000)
      if (res.status === 429 || res.status === 503) {
        const t = await res.text().catch(() => '')
        throw new Error(`${res.status} ${t.slice(0, 120)}`)
      }
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`img ${res.status} ${t.slice(0, 160)}`) }
      const d = await res.json()
      const url = d?.data?.[0]?.url || d?.url
      if (!url) throw new Error('no img url ' + JSON.stringify(d).slice(0, 120))
      return url
    } catch (e) {
      lastErr = e
      const isLimit = /429|503|rate_limit|queue|aborted|fetch failed/i.test(e?.message || '')
      const wait = isLimit ? 20000 + attempt * 5000 : 8000
      log(`  img retry ${attempt}/12: ${e?.message?.slice(0, 80)} (wait ${wait}ms)`)
      if (attempt < 12) await sleep(wait)
    }
  }
  throw lastErr
}

// ---------- 视频创建（429/503 退避） ----------
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

// ---------- 视频状态轮询（GET，429 退避） ----------
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

// ---------- 定妆参考图（人物小传精确描述） ----------
const REFS = [
  {
    key: '林晚定妆',
    prompt: `Cinematic realistic full-body portrait of a young Chinese woman, long straight black hair slightly wavy to collarbone, air bangs, single eyelid, cool fair skin, wearing a BEIGE double-breasted knee-length wool trench coat, beige turtleneck, black straight trousers, camel loafers, a tiny 3mm silver stud earring on her LEFT ear, neutral calm expression, soft studio light, photorealistic, fashion editorial.`
  },
  {
    key: '陈默定妆',
    prompt: `Cinematic realistic full-body portrait of a Chinese man, short dark-brown hair parted 3:7, single eyelid, defined jawline, tired faint dark circles under eyes, neutral-medium skin, wearing a DARK GREY ankle-length wool overcoat (NOT trench, NOT jacket), charcoal turtleneck, black slim trousers, matte black derby shoes, calm restrained expression, soft studio light, photorealistic, fashion editorial.`
  }
]

// ---------- 分镜（5 镜，详细 prompt 来自 screenplay_v2.md） ----------
const SHOTS = [
  {
    n: 1, title: '巷口候车', dialogue: [],
    imagePrompt: `Cinematic realistic wide establishing shot, a rainy night in an old Chinese alley with wet blue-grey stone pavement, a warm amber streetlamp on the left casting long light, distant cold blue neon reflecting in puddles. A young Chinese woman with long straight black hair slightly wavy to collarbone, air bangs, single eyelid, cool fair skin, wearing a BEIGE double-breasted knee-length wool trench coat, beige turtleneck, black straight trousers, camel loafers, a tiny 3mm silver stud earring on her LEFT ear, holding a clear long-handle umbrella, standing still under a bus-stop sign. A Chinese man with short dark-brown hair parted 3:7, single eyelid, defined jawline, tired faint dark circles, neutral-medium skin, wearing a DARK GREY ankle-length wool overcoat (NOT trench, NOT jacket), charcoal turtleneck, black slim trousers, matte black derby shoes, walking in from the right side of frame and stopping two steps diagonally ahead of her. Both fully visible, no eye contact, atmosphere of quiet waiting, photorealistic, film still, shallow wet reflections, moody cinematic lighting, 35mm lens look.`,
    videoPrompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, smooth subtle camera move
[SCENE] rainy night old alley, wet stone pavement, amber streetlamp left, cold blue neon puddle reflections
[SUBJECT] the beige-trench-coat woman holds a clear umbrella standing still under the bus sign; the dark-grey-overcoat man walks in from the right and stops two steps ahead of her, both quiet, no eye contact
[ACTION] extremely slow dolly-in, tiny move, rain falling diagonally, slight fabric sway, ambient life
[CONSISTENCY] keep exact character appearance, clothing, hair, earring as the first frame; no outfit change, no hairstyle change
[REALISM] natural skin texture, real-world wet-night lighting, subtle ambient motion
[DELIVERY] calm, understated, restrained, no exaggerated expression, no smile
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 2, title: '并肩', dialogue: [],
    imagePrompt: `Cinematic realistic medium two-shot, a rainy night at the same bus stop, shallow depth of field with rainy night bokeh behind. On the right, a Chinese man in a DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, looking down at a phone then pocketing it, neutral-medium skin, defined jawline, tired eyes. On the left, a young Chinese woman in a BEIGE double-breasted knee-length wool trench coat, beige turtleneck, long straight black hair slightly wavy to collarbone, air bangs, single eyelid, cool fair skin, tiny silver stud on LEFT ear, turning her face toward the rain, not looking at him. They stand about one step apart, no eye contact, intimate yet distant, photorealistic, film still, wet reflections, moody cinematic lighting.`,
    videoPrompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, slow camera move
[SCENE] rainy night bus stop, shallow DoF, rainy bokeh background, warm-cool mixed light
[SUBJECT] the dark-grey-overcoat man on right looks down at phone, then pockets it; the beige-trench-coat woman on left turns her face toward the rain; they stand one step apart, no eye contact
[ACTION] very slow horizontal pan from man to woman, hair gently blown by wind, rain falling, subtle weight shift, no abrupt move
[CONSISTENCY] identical appearance, clothing, hair, earring as shot 1 first frame; no change
[REALISM] natural skin, real wet-night light, photorealistic
[DELIVERY] subdued, introspective, no smile, no exaggeration
[SPEAKING] No spoken dialogue in this shot.`
  },
  {
    n: 3, title: '搭话', dialogue: [{ speaker: '林晚', line: '也等末班车？' }],
    imagePrompt: `Cinematic realistic medium close-up over-the-shoulder shot, viewed from behind the beige-trench-coat woman's left shoulder (her shoulder and hair softly out of focus in lower-left foreground), focusing on a Chinese man in a DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, single eyelid, defined jawline, who has just turned his head toward her with a faint, restrained almost-smile (lips barely moved, NOT a grin), neutral-medium skin, tired eyes. Rainy night bus stop background softly blurred with bokeh. Photorealistic, film still, shallow DoF, dramatic side light from streetlamp.`,
    videoPrompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, slow push-in
[SCENE] rainy night bus stop, over-shoulder from woman's left shoulder, shallow DoF, streetlamp side light, blurred rainy bokeh bg
[SUBJECT] focus on the dark-grey-overcoat man; the beige-trench-coat woman's shoulder/hair in soft foreground
[ACTION] the woman turns her head slightly and asks quietly; the man, slightly startled, turns to look at her, lips barely move in a restrained almost-smile; very subtle, natural motion
[CONSISTENCY] identical appearance, clothing, hair as prior shots; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, internal, restrained, no exaggerated smile, no theatrical
[SPEAKING] The woman speaks in quiet, natural Mandarin Chinese: "也等末班车？". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained expression. NO English speech.`
  },
  {
    n: 4, title: '欲言又止', dialogue: [{ speaker: '陈默', line: '算了，没事。' }],
    imagePrompt: `Cinematic realistic close-up of two faces in frame, the Chinese man in DARK GREY ankle-length wool overcoat, charcoal turtleneck, short dark-brown 3:7 hair, single eyelid, defined jawline, occupying the right side, looking down and shaking his head slightly, lips forming restrained words, faint tired eyes. On the left, softly out of focus, the young Chinese woman in BEIGE double-breasted knee-length wool trench coat, long straight black hair, air bangs, single eyelid, cool fair skin, tiny silver stud LEFT ear, looking at him with a hint of softness in her eyes. Rainy night, warm streetlamp light on the man's lit half, woman's profile in shadow. Photorealistic, film still, shallow DoF, intimate moody lighting.`,
    videoPrompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, very slow, intimate
[SCENE] rainy night, warm streetlamp on man's lit half, woman's profile in shadow, shallow DoF
[SUBJECT] two faces in frame: the dark-grey-overcoat man on right (main), the beige-trench-coat woman on left (soft focus)
[ACTION] the man opens his mouth as if to speak, then shakes his head slightly and looks down, says the line with lowered eyes; the woman watches him, eyes softening; minimal, natural motion
[CONSISTENCY] identical appearance, clothing, hair, earring as prior shots; no change
[REALISM] natural skin, real light, photorealistic
[DELIVERY] understated, vulnerable but restrained, no exaggerated smile, no theatrical
[SPEAKING] The man speaks in quiet, natural Mandarin Chinese: "算了，没事。". Understated, internal delivery — not performative. Mouth moving subtly, lip-synced, restrained, eyes lowered. NO English speech.`
  },
  {
    n: 5, title: '车过', dialogue: [],
    imagePrompt: `Cinematic realistic wide static shot, a rainy night at the old alley bus stop, two figures standing still — a woman in a BEIGE knee-length double-breasted wool trench coat with long straight black hair and a man in a DARK GREY ankle-length wool overcoat with short dark-brown hair — seen from behind/side, small in frame. In the distance, two beams of bus headlights approach through the rain, illuminating the wet street and rain curtain, then recede. Warm amber streetlamp and cold blue neon reflections on wet pavement. Photorealistic, film still, cinematic depth, moody atmospheric lighting, 35mm look, sense of stillness and quiet missed connection.`,
    videoPrompt: `[PARAMS] cinematic, photorealistic, high detail, 24fps, static wide, subtle
[SCENE] rainy night old alley bus stop, warm amber + cold blue neon on wet pavement, two small figures (beige trench woman, dark-grey overcoat man) standing still from behind/side
[ACTION] in the distance two bus headlight beams approach through rain, brighten the wet street and rain curtain, slow briefly near them, then drive away and recede; the two figures do not move, rain continues; ending on their still silhouettes
[CONSISTENCY] identical appearance, clothing, hair as prior shots even from behind; no change
[REALISM] natural rain, real light, photorealistic, cinematic depth
[DELIVERY] calm, wistful, no expression needed, no dialogue
[SPEAKING] No spoken dialogue in this shot.`
  }
]

async function main() {
  log('[render13] 开始 — 完整链：定妆图 → 定格图 → 视频')

  // 阶段 A：定妆参考图
  log('=== 阶段A：定妆参考图 ===')
  const refUrls = {}
  for (const r of REFS) {
    const base = `${OUT}/ref_${r.key}`
    if (existsSync(base + '.txt')) { refUrls[r.key] = readFileSync(base + '.txt', 'utf8').trim(); log(`跳过已有定妆图 ${r.key}`); continue }
    log(`生成定妆图: ${r.key}`)
    const url = await genImage(r.prompt)
    refUrls[r.key] = url
    writeFileSync(base + '.txt', url)
    await download(url, base + '.jpg')
    log(`  ok ${r.key}.jpg`)
    await sleep(3000)
  }
  const cond = [refUrls['林晚定妆'], refUrls['陈默定妆']].filter(Boolean)

  // 阶段 B：分镜定格图（双角色定妆作条件图）
  log('=== 阶段B：分镜定格图 ===')
  const ffUrls = {}
  for (const shot of SHOTS) {
    const base = `${OUT}/shot_${shot.n}_${shot.title}`
    if (existsSync(base + '.jpg') && existsSync(base + '.txt')) { ffUrls[shot.n] = readFileSync(base + '.txt', 'utf8').trim(); log(`跳过已有定格图 [${shot.n}] ${shot.title}`); continue }
    log(`生成定格图 [${shot.n}/5] ${shot.title} cond=${cond.length}张`)
    const url = await genImage(shot.imagePrompt, cond)
    ffUrls[shot.n] = url
    writeFileSync(base + '.txt', url)
    await download(url, base + '.jpg')
    log(`  ok shot_${shot.n}_${shot.title}.jpg`)
    await sleep(5000)
  }

  // 阶段 C：视频（定格图作首帧）
  log('=== 阶段C：视频 ===')
  let lastCreate = 0
  for (const shot of SHOTS) {
    const base = `${OUT}/vid_${shot.n}_${shot.title}`
    if (existsSync(base + '.mp4')) { log(`跳过已有视频 [${shot.n}] ${shot.title}`); continue }
    const ff = ffUrls[shot.n]
    if (!ff) { log(`缺少首帧 shot_${shot.n}，跳过`); continue }
    const body = {
      model: 'agnes-video-v2.0',
      prompt: shot.videoPrompt,
      image: ff,
      negative_prompt: NEGATIVE_BASE,
      num_frames: 81,
      frame_rate: 24,
      seed: hashSeed(shot.title),
      height: 1024,
      width: 768
    }
    const elapsed = Date.now() - lastCreate
    if (lastCreate && elapsed < 62000) await sleep(62000 - elapsed)
    log(`创建视频 [${shot.n}/5] ${shot.title}`)
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
  log('[render13] 完成')
}

main().catch((e) => { log('[render13] FATAL ' + (e?.message || e)); process.exit(1) })
