// 组装层：前端 Harness 状态机（短剧 Harness 之 P3b，最小可用版）
//
// 把 render10 脚本里的「RESUME 续跑」逻辑产品化进网站：
// - 流水线阶段（参考图→定格图→视频→完成）落盘 localStorage，关页面再开可续。
// - 检测「卡在 processing 的视频变体」（关页面/网络中断残留），提供续跑入口。
//
// 注意：更彻底的「后端编排（P4）」会把长任务迁到 Supabase Edge Function，
// 彻底摆脱前端存活依赖；本文件是前端架构内能做的最稳方案，P4 之前够用。

import type { DirectorProject } from '../types'

export type HarnessStage = 'idle' | 'refs' | 'shots' | 'videos' | 'done' | 'error'

const KEY = 'harness_run_v1'

export interface HarnessRun {
  brief: string
  stage: HarnessStage
  updatedAt: number
  total?: { refs: number; shots: number; videos: number }
  done?: { refs: number; shots: number; videos: number }
}

export function loadHarnessRun(): HarnessRun | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as HarnessRun) : null
  } catch {
    return null
  }
}

export function saveHarnessRun(r: HarnessRun): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(r))
  } catch {
    /* 隐私模式等场景 localStorage 不可用，静默降级（仅丢失断点续跑能力，不影响生成） */
  }
}

export function clearHarnessRun(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export interface StuckVariant {
  videoId: string
  variantId: string
  title: string
}

// 扫描卡在 processing 且无视频 URL 的变体（关页面/网络中断后残留）
export function findStuckVariants(project: DirectorProject): StuckVariant[] {
  const out: StuckVariant[] = []
  for (const v of project.videos) {
    for (const vt of v.variants) {
      if (vt.status === 'processing' && !vt.videoUrl) {
        out.push({ videoId: v.id, variantId: vt.id, title: v.title })
      }
    }
  }
  return out
}
