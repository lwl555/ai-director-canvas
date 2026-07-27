// 无登录云同步中央模块
// ---------------------------------------------------------------
// 身份：匿名 deviceId（src/lib/deviceId.ts），即凭证，不可猜。
// 存储：对话线程 / 当前智能体 / API Key 聚合为一个 payload，按 deviceId 主键
//       存到 Supabase 的 device_sync 表，由 sync-proxy 函数按 device_id 隔离。
// 降级：函数未部署 / 离线 / 网络错误时，自动退回纯本机 localStorage，不报错。
// 合并：pull 时按「每个线程的最后写入时间」做 last-write-wins，避免互覆盖。
import { getDeviceId } from './deviceId'
import type { ChatMsg } from './agnes'
import type { AgentStub } from './agentStore'

const FN_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL?.replace(/\/$/, '') +
  '/functions/v1/sync-proxy'
const ANON = (import.meta as any).env?.VITE_SUPABASE_ANON as string | undefined
const LOCAL_KEY = 'platform.sync'
const PUSH_DEBOUNCE = 800
const MAX_PAYLOAD_BYTES = 1_000_000

export interface Thread {
  key: string
  title: string
  modelId: string
  agentId: string
  messages: ChatMsg[]
  updatedAt: number
  /** 用户是否手动改过标题；true 时 ChatPage 不应再用首条消息覆盖 */
  customTitle?: boolean
  /** 创建线程时的智能体名，用于历史列表展示（避免依赖全局当前智能体） */
  agentName?: string
}

export interface QuickApp {
  id: string
  name: string
  /** emoji 字符 或 压缩后的 PNG data URL */
  icon: string
  /** 完整可运行的单文件 HTML 源码 */
  code: string
  createdAt: number
  updatedAt: number
}

export interface SyncPayload {
  threads: Record<string, Thread>
  currentAgent: AgentStub | null
  apiKeys: Record<string, string>
  apps: Record<string, QuickApp>
  customAgents: Record<string, AgentStub>
  currentThread?: string
  updatedAt: number
}

function emptyPayload(): SyncPayload {
  return { threads: {}, currentAgent: null, apiKeys: {}, apps: {}, customAgents: {}, updatedAt: 0 }
}

function loadLocal(): SyncPayload {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return { ...emptyPayload(), ...JSON.parse(raw) }
  } catch {}
  return emptyPayload()
}

let cache: SyncPayload = loadLocal()
const listeners = new Set<() => void>()
let pushTimer: ReturnType<typeof setTimeout> | null = null
let pulling = false

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(cache))
  } catch {}
}
function emit() {
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
export function getPayload(): SyncPayload {
  return cache
}

// ---------- threads ----------
export function getThread(key: string): Thread | undefined {
  return cache.threads[key]
}
export function getAllThreads(): Thread[] {
  return Object.values(cache.threads).sort((a, b) => b.updatedAt - a.updatedAt)
}
export function setThread(t: Thread) {
  const existing = cache.threads[t.key]
  const merged: Thread = {
    ...t,
    customTitle: t.customTitle ?? existing?.customTitle ?? false,
    agentName: t.agentName ?? existing?.agentName ?? undefined
  }
  cache = { ...cache, threads: { ...cache.threads, [t.key]: merged }, updatedAt: Date.now() }
  persist()
}
export function deleteThread(key: string) {
  const threads = { ...cache.threads }
  delete threads[key]
  const currentThread = cache.currentThread === key ? undefined : cache.currentThread
  cache = { ...cache, threads, currentThread, updatedAt: Date.now() }
  persist()
}
/** 重命名对话（用户改「对方名」）。置 customTitle=true，使首条消息不再覆盖。 */
export function renameThread(key: string, title: string) {
  const t = cache.threads[key]
  if (!t) return
  cache = {
    ...cache,
    threads: {
      ...cache.threads,
      [key]: { ...t, title: title.trim() || '新对话', customTitle: true }
    },
    updatedAt: Date.now()
  }
  persist()
}
export function getCurrentThread(): string | undefined {
  return cache.currentThread
}
export function setCurrentThread(key: string | undefined) {
  cache = { ...cache, currentThread: key, updatedAt: Date.now() }
  persist()
}

// ---------- agent ----------
export function getCurrentAgent(): AgentStub | null {
  return cache.currentAgent
}
export function setCurrentAgent(a: AgentStub | null) {
  cache = { ...cache, currentAgent: a, updatedAt: Date.now() }
  persist()
}

// ---------- 自定义智能体 ----------
export function getCustomAgents(): AgentStub[] {
  return Object.values(cache.customAgents || {}).sort((a, b) => a.name.localeCompare(b.name))
}
export function saveCustomAgent(a: AgentStub) {
  cache = { ...cache, customAgents: { ...cache.customAgents, [a.id]: a }, updatedAt: Date.now() }
  persist()
}
export function deleteCustomAgent(id: string) {
  const customAgents = { ...cache.customAgents }
  delete customAgents[id]
  // 若当前选中正在被删的自定义智能体，一并清除
  const currentAgent = cache.currentAgent?.id === id ? null : cache.currentAgent
  cache = { ...cache, customAgents, currentAgent, updatedAt: Date.now() }
  persist()
}

// ---------- keys ----------
export function getApiKeys(): Record<string, string> {
  return cache.apiKeys
}
export function setApiKeys(o: Record<string, string>) {
  cache = { ...cache, apiKeys: o, updatedAt: Date.now() }
  persist()
}

// ---------- 快应用（网页代码小应用） ----------
export function getApps(): QuickApp[] {
  return Object.values(cache.apps || {}).sort((a, b) => b.updatedAt - a.updatedAt)
}
export function getApp(id: string): QuickApp | undefined {
  return cache.apps?.[id]
}
export function saveApp(a: QuickApp) {
  cache = { ...cache, apps: { ...cache.apps, [a.id]: a }, updatedAt: Date.now() }
  persist()
}
export function deleteApp(id: string) {
  const apps = { ...cache.apps }
  delete apps[id]
  cache = { ...cache, apps, updatedAt: Date.now() }
  persist()
}
/** 改小应用名。置 customTitle 概念不需要，这里直接改 name。 */
export function renameApp(id: string, name: string) {
  const a = cache.apps?.[id]
  if (!a) return
  saveApp({ ...a, name: name.trim() || '未命名应用', updatedAt: Date.now() })
}
/** 改图标（emoji 或压缩后的 data URL） */
export function setAppIcon(id: string, icon: string) {
  const a = cache.apps?.[id]
  if (!a) return
  saveApp({ ...a, icon, updatedAt: Date.now() })
}
/** AI 改进后整体覆盖代码 */
export function updateAppCode(id: string, code: string) {
  const a = cache.apps?.[id]
  if (!a) return
  saveApp({ ...a, code, updatedAt: Date.now() })
}

// ---------- 导出 / 导入（设置页 2.5） ----------
export function exportPayload(): SyncPayload {
  return cache
}
export function importPayload(p: Partial<SyncPayload>) {
  const threads = { ...cache.threads }
  for (const [k, t] of Object.entries(p.threads || {})) threads[k] = t
  cache = {
    threads,
    currentAgent: p.currentAgent ?? cache.currentAgent,
    apiKeys: { ...cache.apiKeys, ...(p.apiKeys || {}) },
    apps: { ...cache.apps, ...(p.apps || {}) },
    customAgents: { ...cache.customAgents, ...(p.customAgents || {}) },
    currentThread: p.currentThread ?? cache.currentThread,
    updatedAt: Date.now()
  }
  saveLocal()
  emit()
}

function persist() {
  saveLocal()
  emit()
  schedulePush()
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void push(), PUSH_DEBOUNCE)
}

async function post(deviceId: string, payload: SyncPayload | null) {
  if (!FN_URL || !ANON) return null
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify({ deviceId, payload })
  })
  if (!res.ok) return null
  return (await res.json()) as { payload?: SyncPayload }
}

export async function push(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  if (!FN_URL || !ANON) return
  const deviceId = getDeviceId()
  try {
    await post(deviceId, cache)
  } catch {
    // 离线 / 函数未部署：保持本机即可
  }
}

export async function pull(): Promise<void> {
  if (pulling || !FN_URL || !ANON) return
  pulling = true
  const deviceId = getDeviceId()
  try {
    const data = await post(deviceId, null)
    if (data?.payload) merge(data.payload)
  } catch {
    // 离线：保留本机
  } finally {
    pulling = false
  }
}

function merge(remote: Partial<SyncPayload>) {
  const threads = { ...cache.threads }
  for (const [k, t] of Object.entries(remote.threads || {})) {
    const local = threads[k]
    if (!local || (t.updatedAt || 0) > (local.updatedAt || 0)) threads[k] = t
  }
  cache = {
    threads,
    currentAgent: remote.currentAgent ?? cache.currentAgent,
    apiKeys: { ...cache.apiKeys, ...(remote.apiKeys || {}) },
    apps: { ...cache.apps, ...(remote.apps || {}) },
    customAgents: { ...cache.customAgents, ...(remote.customAgents || {}) },
    updatedAt: Date.now()
  }
  saveLocal()
  emit()
}

// ---------- 同步状态探测（无登录云保存是否可用） ----------
export type SyncStatus = 'unknown' | 'connected' | 'undeployed' | 'offline'

/** 探测 sync-proxy 是否已部署：用伪造 uuid 拉取，200=已部署，404=未部署，异常=离线 */
export async function getSyncStatus(): Promise<SyncStatus> {
  if (!FN_URL || !ANON) return 'undeployed'
  const dummy = '11111111-1111-4111-8111-111111111111'
  try {
    const res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
      body: JSON.stringify({ deviceId: dummy, payload: null })
    })
    if (res.status === 200) return 'connected'
    if (res.status === 404) return 'undeployed'
    return 'offline'
  } catch {
    return 'offline'
  }
}

/** 立即把本机数据推到云端并从云端拉取（合并）。 */
export async function forceSync(): Promise<void> {
  await push()
  await pull()
}
