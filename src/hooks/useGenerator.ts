import { useCallback } from 'react'
import { useStore } from '../store'
import { agnesImage, agnesVideoCreate, agnesVideoStatus, agnesTranslate } from '../lib/agnes'
import type { CanvasNode } from '../types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function whFromSize(size?: string): { w?: number; h?: number } {
  if (!size) return {}
  const [w, h] = size.split('x').map(Number)
  return { w, h }
}

export function useGenerator() {
  const { project, updateNode, addEdge } = useStore()

  const generateImage = useCallback(
    async (node: CanvasNode) => {
      updateNode(node.id, { status: 'pending', error: undefined })
      try {
        const url = await agnesImage(node.prompt || '', node.model || 'agnes-image-2.1-flash', node.size || '1024x768')
        updateNode(node.id, { imageUrl: url, status: 'done' })
      } catch (e: any) {
        updateNode(node.id, { status: 'failed', error: e?.message || '生成失败' })
      }
    },
    [updateNode]
  )

  const generateVideo = useCallback(
    async (node: CanvasNode) => {
      const { w, h } = whFromSize(node.size || '768x1152')
      const ff = node.firstFrameNodeId ? project.nodes.find((n) => n.id === node.firstFrameNodeId) : undefined
      const lf = node.lastFrameNodeId ? project.nodes.find((n) => n.id === node.lastFrameNodeId) : undefined
      updateNode(node.id, { status: 'processing', error: undefined })
      try {
        const { video_id } = await agnesVideoCreate({
          prompt: node.promptEn || node.prompt || '',
          numFrames: node.numFrames || 121,
          frameRate: node.frameRate || 24,
          seed: node.seed,
          height: h,
          width: w,
          firstFrameUrl: ff?.imageUrl,
          lastFrameUrl: lf?.imageUrl
        })
        let url: string | undefined
        for (let i = 0; i < 45; i++) {
          await sleep(8000)
          const st = await agnesVideoStatus(video_id)
          if (st.status === 'completed' && st.video_url) {
            url = st.video_url
            break
          }
          if (st.status === 'failed') throw new Error('视频生成失败')
        }
        if (!url) throw new Error('视频生成超时（>6分钟），请稍后在节点上重试')
        updateNode(node.id, { videoUrl: url, status: 'done' })
      } catch (e: any) {
        updateNode(node.id, { status: 'failed', error: e?.message || '生成失败' })
      }
    },
    [project.nodes, updateNode]
  )

  const generateAllVideos = useCallback(async () => {
    const shots = project.nodes.filter(
      (n) => n.type === 'video' && (n.status === 'idle' || n.status === 'pending' || n.status === 'failed')
    )
    for (let i = 0; i < shots.length; i += 3) {
      const batch = shots.slice(i, i + 3)
      await Promise.allSettled(batch.map((s) => generateVideo(s)))
    }
  }, [project.nodes, generateVideo])

  const translateToZh = useCallback(
    async (node: CanvasNode) => {
      if (!node.promptEn) return
      const zh = await agnesTranslate(node.promptEn, 'zh')
      updateNode(node.id, { prompt: zh })
    },
    [updateNode]
  )

  return { generateImage, generateVideo, generateAllVideos, translateToZh }
}
