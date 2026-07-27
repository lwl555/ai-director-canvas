// 用户模型 API Key 存储（无登录：经中央 sync 模块，可云同步 + 本机兜底）。
// key 默认存于本机 localStorage，并（在 sync-proxy 部署后）同步到云端，按 deviceId 隔离。
import * as sync from './sync'

function readAll(): Record<string, string> {
  return sync.getApiKeys()
}

export async function loadApiKeys(): Promise<Record<string, string>> {
  return readAll()
}

export async function getApiKey(provider: string): Promise<string> {
  return readAll()[provider] ?? ''
}

export async function hasApiKey(provider: string): Promise<boolean> {
  return Boolean(readAll()[provider])
}

export async function saveApiKey(provider: string, key: string): Promise<void> {
  const o = { ...readAll() }
  const v = (key ?? '').trim()
  if (!v) delete o[provider]
  else o[provider] = v
  sync.setApiKeys(o)
  notifyChanged()
}

export async function deleteApiKey(provider: string): Promise<void> {
  const o = { ...readAll() }
  delete o[provider]
  sync.setApiKeys(o)
  notifyChanged()
}

function notifyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('lingjing:keys-changed'))
  }
}
