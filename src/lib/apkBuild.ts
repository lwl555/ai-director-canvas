// 浏览器端：触发云端 APK 构建并轮询进度。
// 真正的编译在 GitHub Actions（带 Android SDK）完成，产出可直接安装的 debug 签名 APK。
const FN_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/$/, '') + '/functions/v1/apk-build'

export type BuildStatus =
  | { status: 'pending' | 'queued' | 'in_progress'; url?: undefined }
  | { status: 'not_configured'; message?: string }
  | { status: 'done'; url: string }
  | { status: 'failed'; conclusion?: string }

/** 发起一次云端构建。mode='platform' 出平台壳 APK；mode='quickapp' 出该快应用 APK。 */
export async function startApkBuild(opts: { mode: 'platform' | 'quickapp'; html?: string; name?: string }): Promise<void> {
  if (!FN_URL) throw new Error('未配置 Supabase 地址，无法云端打包。')
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  })
  if (!res.ok) {
    let msg = `构建请求失败 (${res.status})`
    try {
      const t = await res.text()
      if (t) msg += ' ' + t.slice(0, 160)
    } catch {}
    throw new Error(msg)
  }
}

/** 轮询构建状态。asset 为 'app-debug.apk' 或 'quickapp-debug.apk'。 */
export async function getApkBuildStatus(asset: 'app-debug.apk' | 'quickapp-debug.apk'): Promise<BuildStatus> {
  if (!FN_URL) return { status: 'failed' }
  const res = await fetch(`${FN_URL}?asset=${asset}`, { method: 'GET' })
  if (!res.ok) return { status: 'failed' }
  return (await res.json()) as BuildStatus
}
