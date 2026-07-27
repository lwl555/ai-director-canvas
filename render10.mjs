// render10.mjs — 双角色稀疏对话验证片《雨夜相遇》
// 复用线上已部署的修复逻辑：
//   - stableSeed(name)：同名角色跨镜锁死同一 seed，修复「统一有问题」
//   - 电影对话原则：对话稀疏克制、单句≤10字、语气 understated、不表演
//   - CHARACTER_LOCK / NEGATIVE_BASE / REALISM / DELIVERY 等指令与 useGenerator.ts 一致
// 走 Supabase Edge Function agnes-proxy（与线上网站同源），带 anon key。

import { writeFileSync, mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render10_out'
const FINAL = `${OUT}/final_dialogue_v10.mp4`
const VIDEO_MIN_GAP_MS = 62_000
const LOG = `${OUT}/run.log`

mkdirSync(OUT, { recursive: true })

// 实时落盘日志（append），即使进程被回收也能从 log 看进度 + 续跑
function log(...a) {
  const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  console.log(line)
  try { appendFileSync(LOG, line + '\n') } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// —— 与线上 useGenerator.ts 完全一致的指令常量 ——
const QUALITY = '8k resolution, ultra HD, ultra-detailed, sharp focus, highly detailed skin texture and pores, film grain, ARRI Alexa color science, anamorphic cinematic look, smooth cinematic motion, no jitter, no flicker, no frame stutter, stable camera, professional color grading, masterpiece composition.'
const REALISM = 'Photorealistic, hyper-realistic human with natural skin texture and visible pores, subtle micro-expressions, realistic facial muscles, lifelike body language, shot on 35mm anamorphic lens, cinematic realism, no CGI, no uncanny valley, no plastic skin, no porcelain doll look, no waxy face, no airbrushed skin.'
const CHARACTER_LOCK = 'Character lock: the face, hairstyle, outfit color and style must remain strictly identical to the reference image in EVERY frame. No face morphing, no age change, no outfit shift, no lighting-style drift, no sudden appearance change.'
const DELIVERY = 'Natural, conversational Mandarin delivery with realistic pacing, casual pauses and breathing; lines flow like real speech, not recited. Lip-sync is precise: mouth movements match the spoken Chinese words exactly, subtle natural articulation, no mumbling, no mismatched mouth flaps.'
const NEGATIVE_BASE = 'no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated.'

// 角色确定性 seed（同名跨镜锁死）
function stableSeed(name) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2147483647
}

// 角色英文外貌（用于定妆图 + 视频 prompt 重复外貌，减少漂移）
const CHARACTERS = {
  林晚: {
    role: '主角',
    enDesc:
      'A slender Chinese woman in her late 20s, Lin Wan. Oval face, fair skin with visible pores, dark almond eyes, calm and slightly tired expression, long straight black hair past shoulders, wearing a beige wool coat over a cream knit sweater, light makeup, no accessories. Natural, understated, lifelike.'
  },
  陈默: {
    role: '配角',
    enDesc:
      'A Chinese man in his early 30s, Chen Mo. Square jaw, tanned skin with stubble, short neat black hair, deep-set calm eyes, wearing a dark grey hoodie and black jeans, a small canvas shoulder bag. Restrained, realistic, no staged look.'
  }
}

// 角色定妆 / 场景 / 道具参考图
const REFS = [
  { label: '林晚定妆', characterName: '林晚', prompt: `${CHARACTERS['林晚'].enDesc} Full-body character sheet, front view, natural window light, plain muted background, neutral expression, same face/outfit/hairstyle, no creepy smile, no glossy influencer look.` },
  { label: '陈默定妆', characterName: '陈默', prompt: `${CHARACTERS['陈默'].enDesc} Full-body character sheet, front view, natural window light, plain muted background, neutral expression, same face/outfit/hairstyle, no creepy smile, no glossy influencer look.` },
  { label: '雨夜巷口', type: 'scene', prompt: `Empty narrow alley at night in rain, wet asphalt reflecting neon signs, shallow puddles, moody cyan-orange cinematic street light, shallow depth of field, atmospheric, no people, film grain, anamorphic.` },
  { label: '末班车站', type: 'scene', prompt: `A quiet bus stop shelter at night, rain on the glass, a single dim warm light, wet bench, empty road behind, melancholic urban mood, cinematic, film grain.` }
]

// 4 镜视频脚本（稀疏对话、克制）
const SHOTS = [
  {
    title: '雨夜独行',
    durationSec: 4,
    cast: ['林晚'],
    cameraMotion: 'slow_push_in',
    shotType: 'medium_shot',
    cameraAngle: 'eye_level',
    lens: '50mm',
    depthOfField: 'shallow',
    lighting: 'neon',
    mood: 'lonely',
    composition: 'rule_of_thirds',
    actionChain: '林晚撑伞走入巷口 → 停下脚步看向积水 → 雨丝落在伞面',
    promptEn: `${CHARACTERS['林晚'].enDesc} She walks alone into a rain-soaked narrow alley at night, holding a black umbrella. Neon reflections shimmer on wet ground. She stops, glances down at a puddle, rain pattering on the umbrella. ${QUALITY}`,
    firstFrameRef: '林晚定妆',
    sceneRef: '雨夜巷口',
    dialogue: [],
    audioHint: '雨声 + 远处城市低频'
  },
  {
    title: '站台相遇',
    durationSec: 4,
    cast: ['林晚', '陈默'],
    cameraMotion: 'static_tripod',
    shotType: 'two_shot',
    cameraAngle: 'eye_level',
    lens: '35mm',
    depthOfField: 'deep',
    lighting: 'soft',
    mood: 'serious',
    composition: 'rule_of_thirds',
    actionChain: '陈默从右侧走进画面 → 林晚抬眼看他 → 两人隔着雨幕对视',
    promptEn: `${CHARACTERS['林晚'].enDesc} and ${CHARACTERS['陈默'].enDesc} stand under a bus-stop shelter at night, separated by a sheet of rain on the glass. He steps in from the right; she looks up. They exchange a quiet, restrained gaze through the rain. ${QUALITY}`,
    firstFrameRef: '陈默定妆',
    sceneRef: '末班车站',
    dialogue: [
      { speaker: '陈默', line: '也等末班车？' }
    ],
    audioHint: '雨声 + 一句低声中文'
  },
  {
    title: '欲言又止',
    durationSec: 4,
    cast: ['林晚'],
    cameraMotion: 'slow_pull_back',
    shotType: 'close_up',
    cameraAngle: 'eye_level',
    lens: '85mm',
    depthOfField: 'shallow',
    lighting: 'rembrandt',
    mood: 'melancholic',
    composition: 'centered',
    actionChain: '林晚微微张嘴 → 又抿住 → 低头整理伞',
    promptEn: `${CHARACTERS['林晚'].enDesc} Close-up. Under Shelter light, she starts to say something, then stops, presses her lips together and looks down, adjusting her umbrella. Subtle, internal, no performative smile. ${QUALITY}`,
    firstFrameRef: '林晚定妆',
    sceneRef: '末班车站',
    dialogue: [
      { speaker: '林晚', line: '算了，没事。' }
    ],
    audioHint: '雨声 + 一句很轻的中文'
  },
  {
    title: '车灯渐近',
    durationSec: 4,
    cast: ['林晚', '陈默'],
    cameraMotion: 'slow_push_in',
    shotType: 'medium_shot',
    cameraAngle: 'eye_level',
    lens: '50mm',
    depthOfField: 'shallow',
    lighting: 'back_light',
    mood: 'hopeful',
    composition: 'rule_of_thirds',
    actionChain: '远处车灯由暗变亮 → 两人同时望向路口 → 雨幕被灯光切开',
    promptEn: `${CHARACTERS['林晚'].enDesc} and ${CHARACTERS['陈默'].enDesc} at the shelter, both turn toward approaching headlights that grow from dim to bright, cutting through the rain curtain. Calm, anticipatory, natural eye-line off-frame toward the light. ${QUALITY}`,
    firstFrameRef: '陈默定妆',
    sceneRef: '末班车站',
    dialogue: [],
    audioHint: '车声由远及近 + 雨声渐弱'
  }
]

// —— HTTP 调用封装（走 agnes-proxy）——
async function call(path, { method = 'POST', body } = {}) {
  const url = `${AGNES_BASE}${path}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON}`
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  })
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`)
  return ct.includes('application/json') ? JSON.parse(text) : text
}

async function genImage(prompt, image) {
  const body = {
    model: 'agnes-image-2.1-flash',
    prompt,
    size: '768x1024',
    extra_body: { response_format: 'url' }
  }
  if (image) body.image = image
  for (let i = 0; i < 3; i++) {
    try {
      const d = await call('/v1/images/generations', { body })
      if (d?.data?.[0]?.url) return d.data[0].url
      if (d?.data?.url) return d.data.url
      if (typeof d?.url === 'string') return d.url
      throw new Error('no url ' + JSON.stringify(d).slice(0, 200))
    } catch (e) {
      if (/503|busy|timeout/i.test(e.message)) {
        await sleep(1500 * (i + 1))
        continue
      }
      throw e
    }
  }
  throw new Error('image gen failed')
}

// 视频创建限速器（串链 + 退避）
let lastCreate = 0
let chain = Promise.resolve()
function videoCreate(opts) {
  const run = chain.then(async () => {
    const el = Date.now() - lastCreate
    if (el < VIDEO_MIN_GAP_MS) await sleep(VIDEO_MIN_GAP_MS - el)
    for (let i = 0; i < 40; i++) {
      try {
        const numFrames = Math.min(441, Math.max(9, Math.round((opts.numFrames || 97) * 24 / 8) * 8 + 1))
        const body = {
          model: 'agnes-video-v2.0',
          prompt: opts.prompt,
          num_frames: 8 * Math.floor((numFrames - 1) / 8) + 1,
          frame_rate: 24,
          seed: opts.seed,
          height: 1024,
          width: 768
        }
        if (opts.image) body.image = opts.image
        const d = await call('/v1/videos', { body })
        const video_id = d?.video_id || d?.id || d?.task_id
        if (!video_id) throw new Error('no video_id ' + JSON.stringify(d).slice(0, 200))
        lastCreate = Date.now()
        return { video_id, task_id: d?.task_id || d?.id }
      } catch (e) {
        if (/rate_limit|429|video_queue_full/i.test(e.message)) {
          await sleep(65_000 + i * 15_000)
          continue
        }
        throw e
      }
    }
    throw new Error('video create retry exhausted')
  })
  chain = run.then(() => {}, () => {})
  return run
}

// 视频状态查询（带 429 退避重试，避免查询限流直接打断流程）
async function videoStatus(videoId, taskId, attempt = 0) {
  try {
    const d = await call(`/agnesapi?video_id=${encodeURIComponent(videoId)}`, { method: 'GET' })
    const st = (d?.status || 'processing').toLowerCase()
    const done = st === 'completed' || st === 'succeeded' || st === 'done'
    const url = d?.metadata?.url || d?.video_url || d?.url
    return { status: done ? 'completed' : st === 'failed' ? 'failed' : 'processing', video_url: url }
  } catch (e) {
    const msg = String(e?.message || '')
    // 查询限流：退避后重试（最多 20 次，覆盖约 5 分钟排队），不抛错中断
    if (/rate_limit|429/i.test(msg) && attempt < 20) {
      await sleep(20_000 + attempt * 5_000)
      return videoStatus(videoId, taskId, attempt + 1)
    }
    if (taskId && /404/.test(msg)) {
      const d = await call(`/v1/videos/${encodeURIComponent(taskId)}`, { method: 'GET' })
      const st = (d?.status || 'processing').toLowerCase()
      const done = st === 'completed' || st === 'succeeded' || st === 'done'
      const url = d?.metadata?.url || d?.video_url || d?.url
      return { status: done ? 'completed' : st === 'failed' ? 'failed' : 'processing', video_url: url }
    }
    // 瞬时网络错误（fetch failed / network / timeout / abort）：退避重试，不中断流程
    if (/fetch failed|network|timeout|abort|ECONN|ETIMEDOUT/i.test(msg) && attempt < 20) {
      await sleep(15_000 + attempt * 5_000)
      return videoStatus(videoId, taskId, attempt + 1)
    }
    throw e
  }
}

// 说话指令（understated，与线上 SPEAKING 一致）
function speakSentence(d, characters) {
  const ch = characters[d.speaker]
  const who = ch ? `The ${ch.role} ${d.speaker}` : `The character ${d.speaker}`
  return `${who} speaks in quiet, natural Mandarin Chinese: "${d.line}". Understated, internal delivery — not performative, not theatrical. Mouth moving subtly, lip-synced, restrained expression, no exaggerated smile. NO English speech.`
}

function buildVideoPrompt(shot) {
  const base = shot.promptEn
  let speak = 'No spoken dialogue in this shot.'
  if (shot.dialogue && shot.dialogue.length) {
    speak = shot.dialogue.map((d) => speakSentence(d, CHARACTERS)).join(' ')
  }
  const MOTION = {
    zoom_in: 'the camera gradually zooms in toward the subject',
    zoom_out: 'the camera gradually zooms out',
    slow_push_in: 'a slow cinematic dolly pushes in closer to the subject',
    slow_pull_back: 'a slow cinematic dolly pulls back from the subject',
    static_tripod: 'a locked-off static tripod shot with absolutely no camera movement'
  }
  const motionTxt = shot.cameraMotion && shot.cameraMotion !== 'none'
    ? (MOTION[shot.cameraMotion] || `camera ${shot.cameraMotion}`)
    : ''
  const camera = [
    shot.shotType && String(shot.shotType).replace(/_/g, ' '),
    shot.cameraAngle && `${String(shot.cameraAngle).replace(/_/g, ' ')} angle`,
    shot.composition && `${String(shot.composition).replace(/_/g, ' ')} composition`,
    shot.lens && `shot on ${shot.lens} lens`,
    shot.depthOfField && `${String(shot.depthOfField).replace(/_/g, ' ')} depth of field`,
    motionTxt
  ].filter(Boolean).join(', ') + '.'

  const lighting = [shot.lighting && `${shot.lighting} lighting`, shot.mood && `${shot.mood} mood`].filter(Boolean).join(', ') + '.'

  const cast = shot.cast && shot.cast.length ? shot.cast : []
  const gaze = cast.length >= 2
    ? `${cast[0]} looks at ${cast[1]} with focused, natural eye contact; ${cast[1]} returns the gaze subtly, eyes calm and alive, no staring.`
    : `${cast[0] || 'The subject'} looks slightly away, eyes thoughtful and restrained, no direct stare.`

  const action = shot.actionChain ? `Action chain: ${shot.actionChain}.` : ''
  const negative = NEGATIVE_BASE

  return [
    '[PARAMS] ' + QUALITY,
    '',
    '[SUBJECT & ACTION] ' + base + ' ' + action,
    '',
    '[SCENE & LIGHTING] ' + lighting,
    '',
    '[CAMERA] ' + camera,
    '',
    '[SPEAKING] ' + speak,
    '',
    '[REALISM] ' + REALISM,
    '',
    '[CONSISTENCY] ' + CHARACTER_LOCK,
    '',
    '[GAZE] ' + gaze,
    '',
    '[DELIVERY] ' + DELIVERY,
    '',
    '[NEGATIVE] ' + negative
  ].join('\n')
}

// 下载视频（无 ffmpeg，不本地拼接：分别存段落，最后用 HTML 顺序播放页交付）
async function download(url, path) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(path, buf)
  return buf.length
}

async function main() {
  log('[render10] 生成参考图... (RESUME 跳过已存在)')
  const refUrls = {}
  for (const r of REFS) {
    const key = r.label
    const txtPath = `${OUT}/ref_${key}.txt`
    if (existsSync(txtPath)) {
      refUrls[key] = readFileSync(txtPath, 'utf8').trim()
      log(`  - ${key} [跳过，已有]`)
      continue
    }
    log(`  - ${key}`)
    try {
      const url = await genImage(r.prompt)
      refUrls[key] = url
      writeFileSync(txtPath, url)
      log(`    ok ${url.slice(0, 60)}...`)
    } catch (e) {
      log(`    FAILED ${key}:`, e?.message || e)
      throw e
    }
  }

  log('[render10] 出 4 段视频... (RESUME 跳过已下载段)')
  const segments = []
  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i]
    const segPath = `${OUT}/seg_${i + 1}.mp4`
    if (existsSync(segPath)) {
      segments.push(segPath)
      log(`  [${i + 1}/4] ${shot.title} [跳过，已下载]`)
      continue
    }
    const ff = refUrls[shot.firstFrameRef]
    // 双角色时，seed 取首角色，保证该角色跨镜一致；对话角色也用同 seed 链
    const seed = stableSeed(shot.cast?.[0] || shot.title)
    const prompt = buildVideoPrompt(shot)
    log(`  [${i + 1}/4] ${shot.title} seed=${seed}`)
    const { video_id, task_id } = await videoCreate({ prompt, numFrames: Math.round(shot.durationSec * 24), seed, image: ff })
    let url
    for (let k = 0; k < 60; k++) {
      await sleep(25000) // 拉长轮询间隔，避开视频状态查询限流（429）
      const st = await videoStatus(video_id, task_id)
      if (st.status === 'completed' && st.video_url) { url = st.video_url; break }
      if (st.status === 'failed') throw new Error(`seg ${i + 1} failed`)
    }
    if (!url) throw new Error(`seg ${i + 1} timeout`)
    const len = await download(url, segPath)
    log(`  [${i + 1}/4] 下载完成 ${(len / 1024 / 1024).toFixed(1)}MB -> ${segPath}`)
    segments.push(segPath)
  }

  log('[render10] 生成播放页...')
  const captions = SHOTS.map((s) => s.caption || s.title)
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>render10 雨夜相遇 · 顺序播放</title>
<style>body{margin:0;background:#111;color:#eee;font-family:system-ui,sans-serif}video{width:100%;display:block}#cap{position:fixed;bottom:0;left:0;right:0;text-align:center;padding:14px;background:rgba(0,0,0,.6);font-size:18px;letter-spacing:1px}#t{text-align:center;padding:12px;color:#9ad}</style>
</head><body>
<div id="t">render10 · 《雨夜相遇》双角色稀疏对话验证片（4 段顺序播放）</div>
<video id="v" controls autoplay playsinline></video>
<div id="cap"></div>
<script>
const segs = ${JSON.stringify(segments.map((p) => './' + p.split('/').pop()))};
const caps = ${JSON.stringify(SHOTS.map((s) => s.dialogue?.map((d) => d.speaker + '：' + d.line).join(' / ') || s.title))};
let i = 0; const v = document.getElementById('v'); const cap = document.getElementById('cap');
function play(){ if(i>=segs.length){i=0;} v.src = segs[i]; cap.textContent = (i+1)+'/'+segs.length+'  '+caps[i]; v.play().catch(()=>{}); }
v.onended = () => { i++; if(i<segs.length) play(); else cap.textContent='—— 完 ——'; };
play();
</script></body></html>`
  writeFileSync(`${OUT}/index.html`, html)
  log(`[render10] 完成 -> ${OUT}/index.html （${segments.length} 段视频 + 播放页）`)
}

main().catch((e) => {
  log('[render10] FATAL', e?.message || e)
  process.exit(1)
})
