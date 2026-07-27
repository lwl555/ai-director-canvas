// render11.mjs — 修复后管线逻辑，只出【分镜定格图】(图片层验证)
// 加：每请求 100s 超时 + 重试3次 + 实时 append 日志（避免后台吞错/卡死误判）
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'

const AGNES_BASE = 'https://wcnssyiqitugqfmcbdhe.functions.supabase.co/agnes-proxy'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbnNzeWlxaXR1Z3FmbWNiZGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDEyNzUsImV4cCI6MjA5ODk3NzI3NX0.9EfbEr7BQhZtbOwHJ3IrkOy16kcaxlmzuJuV0A2Z8Eg'
const OUT = 'render11_out'
mkdirSync(OUT, { recursive: true })
const LOG = `${OUT}/progress.log`
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; appendFileSync(LOG, s + '\n') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchWithTimeout(url, opts, ms = 100_000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ctrl.signal }) }
  finally { clearTimeout(id) }
}

async function call(path, opts = {}) {
  const MAX = 12
  let lastErr
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const res = await fetchWithTimeout(AGNES_BASE + path, {
        method: opts.method || 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ANON },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }, 60_000)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(`${res.status} ${t.slice(0, 160)}`)
      }
      return res.json()
    } catch (e) {
      lastErr = e
      const isQueue = /503|queue is full/i.test(e?.message || '')
      const wait = isQueue ? 20000 + attempt * 5000 : 8000
      log(`  retry ${attempt}/${MAX}: ${e?.message?.slice(0, 80)} (wait ${wait}ms)`)
      if (attempt < MAX) await sleep(wait)
    }
  }
  throw lastErr
}

async function genImage(prompt, image) {
  const body = {
    model: 'agnes-image-2.1-flash',
    prompt,
    size: '768x1024',
    extra_body: { response_format: 'url', image }
  }
  const d = await call('/v1/images/generations', { body })
  const url = d?.data?.[0]?.url
  if (!url) throw new Error('no url: ' + JSON.stringify(d).slice(0, 160))
  return url
}

async function download(url, path) {
  const res = await fetchWithTimeout(url, {}, 120_000)
  if (!res.ok) throw new Error('dl ' + res.status)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

const REFS = [
  { key: '林晚定妆', type: 'character', prompt: 'Cinematic realistic photo of a 25-year-old Chinese woman, long straight black hair, wearing a beige trench coat, calm aloof temperament, half-body portrait, plain neutral background, soft film lighting, photorealistic, detailed skin.' },
  { key: '陈默定妆', type: 'character', prompt: 'Cinematic realistic photo of a 30-year-old Chinese man, short neat hair, wearing a dark grey jacket, composed steady temperament, half-body portrait, plain neutral background, soft film lighting, photorealistic, detailed skin.' },
  { key: '雨夜巷口', type: 'scene', prompt: 'Cinematic realistic wide shot of a rainy night alley in an old urban village, neon reflections, wet glistening pavement, dim atmospheric lighting, photorealistic, moody.' },
  { key: '末班车站', type: 'scene', prompt: 'Cinematic realistic wide shot of a late-night empty bus stop, cold blue station lighting, light rain, desolate mood, wet ground, photorealistic, atmospheric.' }
]

const SHOTS = [
  { title: '巷口独候', cast: ['林晚定妆', '陈默定妆'], scene: '雨夜巷口', prompt: 'Cinematic realistic medium shot, a rainy night alley, a young Chinese woman in beige trench coat (林晚) waiting alone under neon light, a Chinese man in dark grey jacket (陈默) walking toward her from the far end of the alley, wet pavement reflections, moody atmospheric lighting, photorealistic, film still.' },
  { title: '站台相遇', cast: ['林晚定妆', '陈默定妆'], scene: '末班车站', prompt: 'Cinematic realistic two-shot, late-night empty bus stop in light rain, a young Chinese woman in beige trench coat (林晚) and a Chinese man in dark grey jacket (陈默) standing close together under the cold station light, both clearly visible, wet ground, photorealistic, film still.' },
  { title: '欲言又止', cast: ['林晚定妆', '陈默定妆'], scene: '末班车站', prompt: 'Cinematic realistic close shot, the same bus stop, the young Chinese woman in beige trench coat (林晚) looking at the Chinese man in dark grey jacket (陈默) with hesitant expression, he looks away, light rain, consistent appearance and clothing with previous shot, photorealistic, film still.' },
  { title: '同撑一伞', cast: ['林晚定妆', '陈默定妆'], scene: '雨夜巷口', prompt: 'Cinematic realistic medium shot, rainy night alley, the young Chinese woman in beige trench coat (林晚) and the Chinese man in dark grey jacket (陈默) sharing one umbrella walking together, neon reflections on wet ground, same appearances and clothing as before, photorealistic, film still.' }
]

async function main() {
  log('[render11] 开始')
  const refUrls = {}
  for (const r of REFS) {
    const jpg = `${OUT}/ref_${r.key}.jpg`
    const txt = `${OUT}/ref_${r.key}.txt`
    if (existsSync(jpg) && existsSync(txt)) {
      refUrls[r.key] = readFileSync(txt, 'utf8').trim()
      log('跳过已有参考图: ' + r.key)
      continue
    }
    log('生成参考图: ' + r.key)
    const url = await genImage(r.prompt)
    refUrls[r.key] = url
    writeFileSync(txt, url)
    await download(url, jpg)
    log('  ok ' + r.key)
    await sleep(10000)
  }
  for (let i = 0; i < SHOTS.length; i++) {
    const shot = SHOTS[i]
    const base = `${OUT}/shot_${i + 1}_${shot.title}`
    if (existsSync(base + '.jpg') && existsSync(base + '.txt')) {
      log(`跳过已有定格图 [${i + 1}/4] ${shot.title}`)
      continue
    }
    if (existsSync(base + '.txt')) {
      // jpg 缺失但 url 已有，直接复用下载，避免重复打 API 撞队列
      try {
        const u = readFileSync(base + '.txt', 'utf8').trim()
        await download(u, base + '.jpg')
        log(`  ok(复用url) shot_${i + 1}_${shot.title}.jpg`)
        await sleep(10000)
        continue
      } catch (e) {
        log(`  复用url下载失败，改重生成: ${e?.message?.slice(0, 60)}`)
      }
    }
    const cond = []
    for (const c of shot.cast) if (refUrls[c]) cond.push(refUrls[c])
    if (refUrls[shot.scene]) cond.push(refUrls[shot.scene])
    const condTrim = cond.slice(0, 3)
    log(`生成定格图 [${i + 1}/4] ${shot.title} cond=${condTrim.length}张`)
    const url = await genImage(shot.prompt, condTrim)
    writeFileSync(base + '.txt', url)
    await download(url, base + '.jpg')
    log(`  ok shot_${i + 1}_${shot.title}.jpg`)
    await sleep(10000)
  }
  log('[render11] 完成')
}
main().catch((e) => { log('[render11] FATAL ' + (e?.message || e)); process.exit(1) })
