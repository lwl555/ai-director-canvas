// 图片工具：把用户选中的图片文件缩放 / 压缩成体积可控的 JPEG data URL。
// 目的：聊天里附带图片时，data URL 体积不能太大，否则会撑爆 localStorage 与
// 云同步（sync-proxy 1MB 上限）。同时避免原图几 MB 直接进消息。

const MAX_DIM = 1024 // 长边最大像素
const QUALITY = 0.82 // JPEG 质量

/** 读取文件为 data URL（不做缩放，作为兜底）。 */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

/**
 * 把图片文件压缩成 JPEG data URL。
 * - 长边超过 MAX_DIM 则等比缩放到 MAX_DIM；
 * - 输出 image/jpeg（即使原图是 PNG，聊天缩略图用 JPEG 足够，体积更小）；
 * - 任何一步失败都用原始 data URL 兜底，保证「能发得出去」。
 */
export async function fileToScaledDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file)
  if (!file.type.startsWith('image/')) return original
  return new Promise<string>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      try {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(original)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', QUALITY))
      } catch {
        resolve(original)
      }
    }
    img.onerror = () => resolve(original)
    img.src = original
  })
}
