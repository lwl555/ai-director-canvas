// 匿名设备标识：无需登录的云同步主键。
// 首次访问时本地生成一个 128 位随机 UUID，持久化到 localStorage。
// deviceId 即「凭证」——不可猜，跨用户自己的设备同步；清空浏览器即丢失（无登录的通病）。
const KEY = 'platform.deviceId'

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing) return existing
  } catch {}
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  try {
    localStorage.setItem(KEY, id)
  } catch {}
  return id
}
