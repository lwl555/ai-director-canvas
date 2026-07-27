import { useCallback, useRef } from 'react'
import { useStore } from '../store'
import { agnesImage, agnesVideoCreate, agnesVideoStatus, agnesTranslate, agnesChat, AGNES_VIDEO_MODEL } from '../lib/agnes'
import { ROUTES } from '../lib/modelRouter'
import { saveHarnessRun, clearHarnessRun, type HarnessStage } from '../lib/harness'
import type { RefNode, ShotNode, VideoNode, VideoVariant } from '../types'
import { uid } from '../lib/id'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function whFromSize(size: string): { w: number; h: number } {
  const [w, h] = size.split('x').map(Number)
  return { w, h }
}

// 判断是否含中文（用于决定是否需要翻译提示词）
function hasChinese(s: string): boolean {
  return /[一-鿿]/.test(s || '')
}

// 角色一致性引擎：找到分镜首帧来源节点。
// ⚠️ 关键修复：优先用「分镜定格图」(shot.imageUrl) 作视频首帧 —— 它已把角色+场景+服装画在一起，
// 能同时锁死场景/人脸/服装一致性。纯人物定妆图（firstFrameRefId）无背景，用作视频首帧会导致
// 每镜场景被模型重新编造 → 「场景不统一」。定格图不存在时才退回定妆图/主参考图。
function pickFirstFrameUrl(project: ReturnType<typeof useStore>['project'], shot: ShotNode): string | undefined {
  if (shot.imageUrl) return shot.imageUrl
  if (shot.firstFrameRefId) {
    const ref = project.refs.find((r) => r.id === shot.firstFrameRefId)
    if (ref?.imageUrl) return ref.imageUrl
  }
  // 兜底：用该分镜角色对应的主参考图
  const mainRef = project.refs.find((r) => r.isMainRef && r.imageUrl)
  return mainRef?.imageUrl
}

function pickLastFrameUrl(project: ReturnType<typeof useStore>['project'], shot: ShotNode): string | undefined {
  if (shot.lastFrameRefId) {
    const ref = project.refs.find((r) => r.id === shot.lastFrameRefId)
    return ref?.imageUrl
  }
  return undefined
}

// 真实感 / 眼神 / 自然语速 / 负面屏蔽 指令（融合 14 图电影镜头方法论）
const QUALITY = '8k resolution, ultra HD, ultra-detailed, sharp focus, highly detailed skin texture and pores, film grain, ARRI Alexa color science, anamorphic cinematic look, smooth cinematic motion, no jitter, no flicker, no frame stutter, stable camera, professional color grading, masterpiece composition.'
const REALISM = 'Photorealistic, hyper-realistic human with natural skin texture and visible pores, subtle micro-expressions, realistic facial muscles, lifelike body language, shot on 35mm anamorphic lens, cinematic realism, no CGI, no uncanny valley, no plastic skin, no porcelain doll look, no waxy face, no airbrushed skin.'
// 角色一致性锁：视频模型对首帧遵循度有限，必须显式强调「每帧脸/发型/服装严格一致」
const CHARACTER_LOCK = 'Character lock: the face, hairstyle, outfit color and style must remain strictly identical to the reference image in EVERY frame. No face morphing, no age change, no outfit shift, no lighting-style drift, no sudden appearance change.'
const DELIVERY = 'Natural, conversational Mandarin delivery with realistic pacing, casual pauses and breathing; lines flow like real speech, not recited. Delivery may be soft, breathy, slightly mumbled — never crisp broadcaster diction. Lip-sync is precise: mouth movements match the spoken Chinese words exactly, subtle natural articulation, no exaggerated mouth flaps.'
const NEGATIVE_BASE = 'no creepy smile, no exaggerated expression, no big forced smile, no plastic skin, no uncanny valley, no distorted face, no oversized eyes, no weird teeth, no deformed hands, no extra fingers, no twisted limbs, no blurry face, no face morphing, no outfit change, no style drift, no watermark, no text overlay, no logo, no jitter, no flicker, no frame duplication, low resolution, blurry, washed out, oversaturated.'

// 角色确定性 seed：同名角色所有视频共用同一 seed，跨镜锁死外貌/服装，修复「统一有问题」
function stableSeed(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2147483647
}

// 眼神要有动机：双人时互看，独处时看物体/远方，不强迫每镜都看镜头
function gazeOf(cast: string[], shot?: ShotNode): string {
  const c = (cast || []).filter(Boolean)
  if (shot?.cameraAngle === 'side_profile' || shot?.cameraAngle === 'back_view') {
    if (c.length >= 1) return `${c[0]}'s gaze is directed off-frame toward a motivated point, not forced at the camera; natural eye-line.`
    return "The subject's gaze is directed naturally off-frame, not forced at the camera."
  }
  if (c.length >= 2) return `${c[0]} looks at ${c[1]} with focused, natural eye contact; ${c[1]} returns the gaze subtly, eyes calm and alive, no staring.`
  if (c.length === 1) {
    if (shot?.mood === 'lonely' || shot?.mood === 'melancholic' || shot?.mood === 'serious' || shot?.mood === 'mysterious') {
      return `${c[0]} looks slightly away from camera toward a natural point of interest, eyes thoughtful and restrained, no direct stare.`
    }
    return `${c[0]} looks at the camera with calm, restrained eye contact, expression natural, not performative.`
  }
  return 'The subject has natural, relaxed eye direction and a subtle, authentic expression.'
}

// 运镜枚举 → 自然语言电影描述（Agnes 对自然语言运镜指令遵循度高于枚举值）
const MOTION_MAP: Record<string, string> = {
  zoom_in: 'the camera gradually zooms in toward the subject',
  zoom_out: 'the camera gradually zooms out, revealing more of the scene',
  pan_left: 'the camera pans smoothly to the left',
  pan_right: 'the camera pans smoothly to the right',
  pan_up: 'the camera tilts up gently',
  pan_down: 'the camera tilts down gently',
  orbit: 'the camera slowly orbits around the subject in a continuous arc',
  tilt: 'the camera tilts subtly on its axis',
  handheld: 'a subtle restrained handheld camera with natural micro-movement',
  static_tripod: 'a locked-off static tripod shot with absolutely no camera movement',
  slow_push_in: 'a slow cinematic dolly pushes in closer to the subject',
  slow_pull_back: 'a slow cinematic dolly pulls back from the subject',
  follow: 'the camera tracks smoothly alongside the subject, following their movement',
  follow_subject: 'the camera follows the subject as they move through the scene',
  crane_up: 'the camera cranes upward in a smooth arc',
  arc: 'the camera arcs gently around the action'
}
// 把结构化镜头元数据转成自然语言（注入视频 prompt）
function cameraSentence(shot: ShotNode): string {
  const parts: string[] = []
  if (shot.shotType) parts.push(String(shot.shotType).replace(/_/g, ' '))
  if (shot.cameraAngle) parts.push(String(shot.cameraAngle).replace(/_/g, ' ') + ' angle')
  if (shot.composition) parts.push(String(shot.composition).replace(/_/g, ' ') + ' composition')
  if (shot.lens) parts.push('shot on ' + shot.lens + ' lens')
  if (shot.depthOfField) parts.push(String(shot.depthOfField).replace(/_/g, ' ') + ' depth of field')
  if (shot.cameraMotion && shot.cameraMotion !== 'none') {
    parts.push(MOTION_MAP[shot.cameraMotion] || ('camera ' + String(shot.cameraMotion).replace(/_/g, ' ')))
  }
  if (!parts.length) return ''
  return parts.join(', ') + '.'
}

function lightingSentence(shot: ShotNode): string {
  const parts: string[] = []
  if (shot.lighting) parts.push(String(shot.lighting).replace(/_/g, ' ') + ' lighting')
  if (shot.mood) parts.push(String(shot.mood).replace(/_/g, ' ') + ' mood')
  if (!parts.length) return ''
  return parts.join(', ') + '.'
}

// 原生对话音频：把分镜台词注入视频 prompt，让 Agnes 直接生成带口型同步的中文配音。
// 同时按六步公式叠加：硬性参数 + 画质 + 主体/动作链 + 场景/光效/氛围 + 镜头语言 + 写实 + 眼神 + 负面屏蔽。
function buildVideoPrompt(shot: ShotNode, characters: { name: string; role: string; enDesc: string }[], project?: ReturnType<typeof useStore>['project']): string {
  const base = shot.promptEn || shot.title
  const dlg = shot.dialogue
  let speak = 'No spoken dialogue in this shot.'
  if (dlg && dlg.length) {
    speak = dlg
      .map((d) => {
        const ch = characters.find((c) => c.name === d.speaker)
        const who = ch ? `The ${ch.role || 'character'} ${d.speaker}` : `The character ${d.speaker}`
        return `${who} speaks in quiet, natural Mandarin Chinese: "${d.line}". Understated, internal delivery — not performative, not theatrical. Mouth moving subtly, lip-synced, restrained expression, no exaggerated smile. NO English speech.`
      })
      .join(' ')
  }
  // 角色名解析（cast 优先，否则用台词 speaker，再退化为首帧角色）
  let cast = shot.cast && shot.cast.length ? shot.cast : [...new Set((dlg || []).map((d) => d.speaker))]
  if (!cast.length && project && shot.firstFrameRefId) {
    const ref = project.refs.find((r) => r.id === shot.firstFrameRefId)
    if (ref?.characterName) cast = [ref.characterName]
  }
  // 道具
  let props = ''
  if (project && shot.propRefIds && shot.propRefIds.length) {
    const descs = shot.propRefIds
      .map((pid) => project.refs.find((r) => r.id === pid)?.promptEn)
      .filter(Boolean)
    if (descs.length) props = 'Key props present in shot: ' + descs.join('; ') + '.'
  }
  // 动作链
  const action = shot.actionChain ? `Action chain: ${shot.actionChain}.` : ''

  return [
    '[PARAMS] ' + QUALITY,
    '',
    '[SUBJECT & ACTION] ' + base + ' ' + action,
    '',
    '[SCENE & LIGHTING] ' + lightingSentence(shot),
    '',
    '[CAMERA] ' + cameraSentence(shot),
    '',
    '[SPEAKING] ' + speak,
    '',
    '[REALISM] ' + REALISM,
    '',
    '[CONSISTENCY] ' + CHARACTER_LOCK,
    '',
    '[GAZE] ' + gazeOf(cast, shot),
    '',
    '[DELIVERY] ' + DELIVERY,
    props ? '\n[PROPS] ' + props : ''
  ]
    .filter((s) => typeof s === 'string' && s.trim() !== '')
    .join('\n')
}

export function useGenerator() {
  const store = useStore()
  const { project, addRef, updateRef, updateShot, updateVideo, addVideo, addVariant, updateVariant } = store
  // 并发锁：避免重复点击为同一分镜叠加多个 video 版本 / 重复出图
  const genVideoShots = useRef<Set<string>>(new Set())
  const genImageShots = useRef<Set<string>>(new Set())
  // 参考图生成锁：避免「点了没反应→连点」导致同一张参考图并发多次生成
  const genRefs = useRef<Set<string>>(new Set())
  // 始终指向最新 project 的 ref。generateShotImage/generateVideoForShot/retryVariant 依赖闭包捕获的
  // project，在 produceAll 这种长异步流程里会变成「还没有任何图」的旧快照，导致图生图拿不到刚生成的
  // 参考图 URL、丢失角色一致性。用 projectRef.current 实时读取，避免 stale-closure。
  const projectRef = useRef(project)
  projectRef.current = project

  // 从提示词自动推断 2-4 个相关道具，新建 object 参考图并生成（手动路线自动补全道具）
  const autoGenProps = useCallback(
    async (promptEn: string) => {
      try {
        const sys =
          'You are a prop extractor. Given a scene or character description, return ONLY a JSON array of 2-4 key physical props/objects that should appear, each as {"label":"中文短名","enDesc":"English visual description"}. No prose, no code fences. If none, return [].'
        const reply = await agnesChat(
          [
            { role: 'system', content: sys },
            { role: 'user', content: promptEn }
          ],
          ROUTES.chat,
          1024
        )
        const arr = JSON.parse(reply.replace(/```json|```/gi, '').trim())
        if (!Array.isArray(arr)) return
        for (const p of arr.slice(0, 4)) {
          const id = uid()
          addRef({
            id,
            type: 'reference',
            refType: 'object',
            label: String(p?.label || '道具'),
            prompt: String(p?.enDesc || ''),
            promptEn: String(p?.enDesc || ''),
            status: 'idle',
            imageUrl: undefined,
            x: 60 + Math.random() * 80,
            y: 60 + Math.random() * 200
          })
          try {
            const url = await agnesImage(String(p?.enDesc || p?.label), 'agnes-image-2.1-flash', '768x1024')
            updateRef(id, { imageUrl: url, status: 'done', error: undefined })
          } catch {
            updateRef(id, { status: 'failed', error: '道具生成失败' })
          }
        }
      } catch {
        /* 道具推断失败不影响主图，静默跳过 */
      }
    },
    [addRef, updateRef]
  )

  // 生成单张参考图：支持图生图（上传图作为 image 输入）+ 中文提示词自动翻译 + 并发锁
  const generateRef = useCallback(
    async (ref: RefNode, opts?: { autoProps?: boolean }) => {
      // 并发锁：同一张参考图正在生成时直接返回，避免连点产生多张
      if (genRefs.current.has(ref.id)) return
      genRefs.current.add(ref.id)
      updateRef(ref.id, { status: 'processing', error: undefined })
      try {
        // 提示词：优先用已译好的英文；否则若含中文则自动翻译，并写回 promptEn 供复用
        let promptEn = ref.promptEn
        const promptZh = ref.prompt || ref.label
        if (!promptEn) {
          promptEn = hasChinese(promptZh) ? await agnesTranslate(promptZh, 'en') : promptZh
          if (promptEn && promptEn !== promptZh) updateRef(ref.id, { promptEn })
        }
        // 图生图：若该参考图已有一张图（用户上传或上一次生成），作为 image 输入，
        // 让新图继承同一角色/物体的外貌与画风，解决「根本没根据图生图」的问题。
        const url = await agnesImage(promptEn || promptZh, ROUTES.image, '768x1024', ref.imageUrl)
        updateRef(ref.id, { imageUrl: url, status: 'done', error: undefined, promptEn })
        // 手动生成角色/场景时，自动从提示词推断并生成所需道具（一键流程由分镜脚本提供，不重复）
        if (opts?.autoProps && (ref.refType === 'character' || ref.refType === 'scene')) {
          autoGenProps(promptEn || promptZh).catch(() => {})
        }
      } catch (e: any) {
        const msg = e?.message || '生成失败'
        updateRef(ref.id, { status: 'failed', error: msg })
        alert(`⚠️ 参考图「${ref.label}」生成失败：\n${msg}\n\n（可能是上游服务繁忙，请稍后重试；若提示词为空，请先填写提示词或上传参考图）`)
      } finally {
        genRefs.current.delete(ref.id)
      }
    },
    [updateRef, autoGenProps]
  )

  // 生成分镜定格图（用于预览，强化角色一致性：用主参考/首帧图 + 场景 + 道具做图生图 I2I）
  const generateShotImage = useCallback(
    async (shot: ShotNode) => {
      if (genImageShots.current.has(shot.id)) return
      genImageShots.current.add(shot.id)
      updateShot(shot.id, { status: 'pending', error: undefined })
      try {
        // 条件化参考图：本镜所有出场角色的定妆图（双人镜两张都加）+ 场景 + 道具，最多 3 张。
        // 关键作用：分镜定格图因此会画出「角色在场景里」的完整画面，后续用作视频首帧
        // 即可同时锁死 场景 + 人脸 + 服装一致性（含双角色镜第二人）。
        const cond: string[] = []
        const seen = new Set<string>()
        const addCond = (url?: string) => {
          if (url && !seen.has(url)) { cond.push(url); seen.add(url) }
        }
        // 1) 角色定妆图（按 cast 顺序，保证双人同框都有参考）
        const castNames = (shot.cast && shot.cast.length) ? shot.cast : []
        for (const name of castNames) {
          const cr = projectRef.current.refs.find((r) => r.characterName === name && r.imageUrl)
          if (cr) addCond(cr.imageUrl)
        }
        // 2) 无任何角色定妆图时，退回主参考图
        if (!cond.length) {
          const main = projectRef.current.refs.find((r) => r.isMainRef && r.imageUrl)
          addCond(main?.imageUrl)
        }
        // 3) 场景图
        if (shot.sceneRefId) {
          const sc = projectRef.current.refs.find((r) => r.id === shot.sceneRefId)
          addCond(sc?.imageUrl)
        }
        // 4) 道具
        if (shot.propRefIds && shot.propRefIds.length) {
          for (const pid of shot.propRefIds) {
            const pr = projectRef.current.refs.find((r) => r.id === pid)
            addCond(pr?.imageUrl)
          }
        }
        // 定格图提示词：原 shot prompt + 镜头六要素 + 一致性约束 + 去诡异笑容负面词
        const shotMeta = [
          shot.shotType ? `shot type: ${String(shot.shotType).replace(/_/g, ' ')}` : '',
          shot.cameraAngle ? `camera angle: ${String(shot.cameraAngle).replace(/_/g, ' ')}` : '',
          shot.lens ? `lens: ${shot.lens}` : '',
          shot.depthOfField ? `depth of field: ${String(shot.depthOfField).replace(/_/g, ' ')}` : '',
          shot.lighting ? `lighting: ${String(shot.lighting).replace(/_/g, ' ')}` : '',
          shot.mood ? `mood: ${String(shot.mood).replace(/_/g, ' ')}` : '',
          shot.composition ? `composition: ${String(shot.composition).replace(/_/g, ' ')}` : ''
        ].filter(Boolean).join(', ')
        const consistency = 'Keep the character\'s face, outfit, hairstyle and art style strictly identical to the reference image. Same face, same outfit, same hairstyle. No creepy smile, no exaggerated expression, no plastic skin, no distorted hands.'
        const shotPrompt = `${shot.promptEn || shot.title}${shotMeta ? '\nCinematic framing: ' + shotMeta + '.' : ''}\n\n${consistency}`
        const url = cond.length
          ? await agnesImage(shotPrompt, ROUTES.image, '768x1024', cond.slice(0, 3))
          : await agnesImage(shotPrompt, ROUTES.image, '768x1024')
        updateShot(shot.id, { imageUrl: url, status: 'done', error: undefined })
      } catch (e: any) {
        const msg = e?.message || '生成失败'
        updateShot(shot.id, { status: 'failed', error: msg })
        alert(`⚠️ 分镜「${shot.title}」定格图生成失败：\n${msg}`)
      } finally {
        genImageShots.current.delete(shot.id)
      }
    },
    [project, updateShot]
  )

  // 生成视频（单分镜 → 一个视频节点，多版本在此函数内追加）
  const generateVideoForShot = useCallback(
    async (shot: ShotNode) => {
      if (genVideoShots.current.has(shot.id)) return // 已在进行，避免叠加
      genVideoShots.current.add(shot.id)
      let video: VideoNode | undefined
      let variant: VideoVariant | undefined
      try {
        const ff = pickFirstFrameUrl(projectRef.current, shot)
        const lf = pickLastFrameUrl(projectRef.current, shot)
        const seed = stableSeed((shot.cast && shot.cast[0]) || shot.title || 'shot')
        // 按时长算帧数：numFrames = round(durationSec*24/8)*8 + 1，须满足 8n+1 且 ≤441
        const nf = Math.min(441, Math.max(9, Math.round((shot.durationSec || 8) * 24 / 8) * 8 + 1))
        variant = {
          id: uid(),
          status: 'processing',
          seed,
          firstFrameUrl: ff,
          lastFrameUrl: lf,
          createdAt: Date.now()
        }
        // 找或建 video 节点
        video = project.videos.find((v) => v.shotId === shot.id)
        if (!video) {
          video = {
            id: uid(),
            type: 'video',
            shotId: shot.id,
            title: shot.title,
            promptEn: shot.promptEn,
            cameraMotion: shot.cameraMotion,
            durationSec: shot.durationSec,
            numFrames: nf,
            frameRate: 24,
            seed,
            variants: [],
            inTimeline: true,
            x: shot.x,
            y: shot.y + 220
          }
          addVideo(video)
        }
        addVariant(video.id, variant)

        const { video_id, task_id } = await agnesVideoCreate({
          prompt: buildVideoPrompt(shot, projectRef.current.characters, projectRef.current),
          numFrames: video.numFrames,
          frameRate: video.frameRate || 24,
          seed,
          height: 1024,
          width: 768,
          firstFrameUrl: ff,
          lastFrameUrl: lf,
          model: AGNES_VIDEO_MODEL,
          negativePrompt: [NEGATIVE_BASE, shot.negativePrompt].filter(Boolean).join(', ')
        })
        // 动态轮询：间隔 22s（避开 Agnes 状态查询限流），最多约 22 分钟
        let url: string | undefined
        for (let i = 0; i < 60; i++) {
          await sleep(22000)
          const st = await agnesVideoStatus(video_id, task_id)
          if (st.status === 'completed' && st.video_url) {
            url = st.video_url
            break
          }
          if (st.status === 'failed') throw new Error('视频生成失败')
        }
        if (!url) throw new Error('视频生成超时（>8分钟），请在视频卡上重试')
        updateVariant(video.id, variant.id, { videoUrl: url, status: 'done' })
    } catch (e: any) {
      if (video && variant) {
        const msg = e?.message || '生成失败'
        updateVariant(video.id, variant.id, { status: 'failed', error: msg })
        alert(`⚠️ 视频「${shot.title}」生成失败：\n${msg}\n\n可在该视频卡上点重试。`)
      }
    } finally {
      genVideoShots.current.delete(shot.id)
    }
    },
    [project, addVideo, addVariant, updateVariant]
  )

  // AC 一键出片：先出全部参考图 + 分镜定格图，再批量出所有分镜视频。
  // 让用户全程看到进度，不再静默。阶段进度落盘 localStorage（Harness 断点续跑）。
  const produceAll = useCallback(
    async (onStage?: (stage: HarnessStage, label: string) => void) => {
      const setStage = (stage: HarnessStage, label: string) => {
        onStage?.(stage, label)
        saveHarnessRun({
          brief: project.brief,
          stage,
          updatedAt: Date.now(),
          total: { refs: project.refs.length, shots: project.shots.length, videos: project.shots.length }
        })
      }
      // 1) 参考图（跳过已有图或已完成的）
      //    按 refType 排序：场景(scene) → 道具(object) → 角色(character) → 其他，
      //    确保「角色生成前先完成场景/道具背景图」。
      setStage('refs', '生成参考图')
      const typePriority: Record<string, number> = { scene: 0, object: 1, character: 2 }
      const refsToGen = project.refs
        .filter((r) => !r.imageUrl && r.status !== 'done' && (r.prompt || r.label))
        .sort((a, b) => (typePriority[a.refType ?? ''] ?? 9) - (typePriority[b.refType ?? ''] ?? 9))
      for (const r of refsToGen) {
        await generateRef(r).catch(() => {})
      }
      // 2) 分镜定格图
      setStage('shots', '生成分镜定格图')
      const shotsToGen = project.shots.filter((s) => !genImageShots.current.has(s.id))
      for (let i = 0; i < shotsToGen.length; i += 3) {
        const batch = shotsToGen.slice(i, i + 3)
        await Promise.allSettled(batch.map((s) => generateShotImage(s)))
      }
      // 3) 视频（每批 3 个）
      setStage('videos', '生成视频')
      const shotsForVideo = project.shots.filter((s) => !genVideoShots.current.has(s.id))
      for (let i = 0; i < shotsForVideo.length; i += 3) {
        const batch = shotsForVideo.slice(i, i + 3)
        await Promise.allSettled(batch.map((s) => generateVideoForShot(s)))
      }
      setStage('done', '完成')
      clearHarnessRun()
    },
    [project.refs, project.shots, project.brief, generateRef, generateShotImage, generateVideoForShot]
  )

  // 重试单个视频变体（重跑）
  // ⚠️ 必须声明在 resumeStuckVideos 之前：后者依赖数组引用 retryVariant，
  // 而依赖数组在每次渲染（useGenerator 执行）时求值，若 retryVariant 在其后才用 const 声明，
  // 会触发 TDZ（Cannot access 'retryVariant' before initialization），导致整个画布渲染崩溃。
  const retryVariant = useCallback(
    async (video: VideoNode, variantId: string) => {
      const shot = project.shots.find((s) => s.id === video.shotId)
      if (!shot) return
      updateVariant(video.id, variantId, { status: 'processing', error: undefined })
      const ff = pickFirstFrameUrl(projectRef.current, shot)
      const lf = pickLastFrameUrl(projectRef.current, shot)
      try {
        const { video_id, task_id } = await agnesVideoCreate({
          prompt: buildVideoPrompt(shot, projectRef.current.characters, projectRef.current),
          numFrames: video.numFrames,
          frameRate: video.frameRate || 24,
          seed: stableSeed((shot.cast && shot.cast[0]) || shot.title || 'shot'),
          height: 1024,
          width: 768,
          firstFrameUrl: ff,
          lastFrameUrl: lf,
          model: AGNES_VIDEO_MODEL,
          negativePrompt: [NEGATIVE_BASE, shot.negativePrompt].filter(Boolean).join(', ')
        })
        let url: string | undefined
        for (let i = 0; i < 60; i++) {
          await sleep(22000)
          const st = await agnesVideoStatus(video_id, task_id)
          if (st.status === 'completed' && st.video_url) {
            url = st.video_url
            break
          }
          if (st.status === 'failed') throw new Error('视频生成失败')
        }
        if (!url) throw new Error('视频生成超时')
        updateVariant(video.id, variantId, { videoUrl: url, status: 'done' })
      } catch (e: any) {
        updateVariant(video.id, variantId, { status: 'failed', error: e?.message || '生成失败' })
      }
    },
    [project, updateVariant]
  )

  // 续跑卡在 processing 的视频变体（关页面/网络中断后残留），断点续跑的核心入口
  const resumeStuckVideos = useCallback(async () => {
    const stuck = project.videos.flatMap((v) =>
      v.variants.filter((vt) => vt.status === 'processing' && !vt.videoUrl).map((vt) => ({ v, vt }))
    )
    for (const { v, vt } of stuck) {
      await retryVariant(v, vt.id).catch(() => {})
    }
  }, [project.videos, retryVariant])

  // 生成所有视频（并行，每批 3 个；跳过正在进行/刚完成的，避免叠加）
  const generateAllVideos = useCallback(async () => {
    const shots = project.shots.filter((s) => !genVideoShots.current.has(s.id))
    for (let i = 0; i < shots.length; i += 3) {
      const batch = shots.slice(i, i + 3)
      await Promise.allSettled(batch.map((s) => generateVideoForShot(s)))
    }
  }, [project.shots, generateVideoForShot])

  return { generateRef, generateShotImage, generateVideoForShot, generateAllVideos, produceAll, retryVariant, resumeStuckVideos }
}
