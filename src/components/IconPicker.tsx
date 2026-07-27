// 图标选择器：emoji 选择 + 上传图片自动压缩为 64px PNG data URL
// ---------------------------------------------------------------
// 上传图经 canvas 居中裁剪为正方形并重绘到 64×64，导出 PNG data URL，
// 保证快应用图标在 localStorage / 云同步里占用极小，避免存大图撑爆容量。
import { useRef, useState } from 'react'

const EMOJIS = [
  '📱', '🎮', '🎨', '📝', '⏰', '📊', '🌤️', '🎵',
  '📷', '🔧', '💡', '🚀', '📚', '🧮', '🗺️', '⭐',
  '❤️', '🔥', '🌈', '🍎', '⚡', '🎯', '🧩', '🛠️'
]

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setUploading(true)
    try {
      const dataUrl = await compressToDataUrl(f, 64)
      onChange(dataUrl)
    } catch {
      // 压缩失败静默忽略，保留原图标
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const isImage = value?.startsWith('data:')

  return (
    <div className="icon-picker">
      <div
        className="icon-picker-preview"
        onClick={() => fileRef.current?.click()}
        title="点击上传图片作图标"
      >
        {isImage ? <img src={value} alt="icon" /> : <span>{value || '📦'}</span>}
      </div>
      <div className="icon-picker-emojis">
        {EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            className={'emoji-btn' + (value === em ? ' active' : '')}
            onClick={() => onChange(em)}
          >
            {em}
          </button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      <button type="button" className="icon-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
        {uploading ? '压缩中…' : '上传图片（自动压缩 64px）'}
      </button>
    </div>
  )
}

/** 把图片文件压缩为 size×size 正方形 PNG data URL（居中覆盖裁剪） */
function compressToDataUrl(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read fail'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('img fail'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no ctx'))
        const scale = Math.max(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
