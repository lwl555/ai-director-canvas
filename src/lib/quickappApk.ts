// 浏览器端：把一个「快应用」打包成可构建的 Android 工程 zip 并触发下载。
// 真正的 .apk 编译需在用户本机 Android Studio 完成（沙箱无 Android SDK）。
import { buildAndroidProject } from './androidTemplate.mjs'
import { zipStore } from './zipStore.mjs'
import type { QuickApp } from './sync'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function safeFile(name: string) {
  return (name || '快应用').replace(/[^\w一-龥-]+/g, '_').slice(0, 40) || 'quickapp'
}

/**
 * 为某个快应用生成 Android 工程 zip 并下载。
 */
export function downloadQuickAppApk(app: QuickApp) {
  const files = buildAndroidProject({
    mode: 'quickapp',
    name: app.name,
    packageId: 'com.lingjing.quickapp',
    icon: app.icon,
    html: app.code,
    seed: app.id
  })

  const entries = Object.entries(files).map(([path, data]) => ({
    path,
    data: typeof data === 'string' ? new TextEncoder().encode(data) : data
  }))

  const zip = zipStore(entries)
  const blob = new Blob([zip], { type: 'application/zip' })
  triggerDownload(blob, `${safeFile(app.name)}.android.zip`)
}
