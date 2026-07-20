import type { DirectorProject } from '../types'

const LS_KEY = 'director-canvas-project-v1'

export function saveProjectLocal(p: DirectorProject): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p))
  } catch {
    /* 忽略容量错误 */
  }
}

export function loadProjectLocal(): DirectorProject | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DirectorProject
  } catch {
    return null
  }
}

// —— 可选：跨设备保存（复用一个 Supabase 表 director_sessions，需自行加 canvas_json 列）——
// 仅做 best-effort，失败不影响本地使用。
const SB_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined
const SB_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON as string | undefined

export function supabaseConfigured(): boolean {
  return !!SB_URL && !!SB_ANON
}

export async function saveProjectSupabase(p: DirectorProject): Promise<boolean> {
  if (!SB_URL || !SB_ANON) return false
  try {
    const res = await fetch(`${SB_URL}/rest/v1/director_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: p.id,
        canvas_json: p,
        updated_at: new Date().toISOString()
      })
    })
    return res.ok
  } catch {
    return false
  }
}

export async function loadProjectSupabase(id: string): Promise<DirectorProject | null> {
  if (!SB_URL || !SB_ANON) return null
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/director_sessions?select=canvas_json&id=eq.${id}`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    )
    if (!res.ok) return null
    const arr = await res.json()
    if (Array.isArray(arr) && arr[0]?.canvas_json) return arr[0].canvas_json as DirectorProject
    return null
  } catch {
    return null
  }
}
