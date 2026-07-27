// 规划层：多 Agent 流水线编排（短剧 Harness 之 P1）
//
// planStoryboard(brief) 串行调 4 个专职 Agent：
//   A1 创意理解 → A2 剧本结构 → A3 分镜绘制（无台词） → A4 对话/节奏控制（稀疏注入台词）
// 每步解析 JSON 并交接上下文，最后合并成 DirectorStoryboard（与 store.applyStoryboard 同格式）。
//
// 核心收益：对话密度控制（A4）是独立可关的开关，不再污染剧本/分镜质量。
//           之前「对话太密/太夸张」的根因（规则写在总 prompt 里）因此被结构性消除。

import { agnesChat } from './agnes'
import { parseStoryboard, type DirectorStoryboard } from './directorPrompt'
import { A1_SYSTEM, A2_SYSTEM, A3_SYSTEM, A4_SYSTEM } from './plannerPrompts'
import { ROUTES } from './modelRouter'

export type PlanStage = 'A1' | 'A2' | 'A3' | 'A4'

// 进度回调：前端可用来显示「AI 协作」过程（可选）
export type OnStage = (stage: PlanStage, label: string) => void

async function runStep(system: string, user: string, label: string): Promise<any> {
  const text = await agnesChat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    ROUTES.chat,
    4096
  )
  const json = parseStoryboard(text)
  if (!json) throw new Error(`${label} 未返回有效 JSON，请重试`)
  return json
}

export async function planStoryboard(brief: string, onStage?: OnStage): Promise<DirectorStoryboard> {
  // —— A1 创意理解 ——
  onStage?.('A1', '理解创意')
  const a1 = await runStep(
    A1_SYSTEM,
    `用户创意简报：\n"""\n${brief}\n"""\n请提炼创作纲领，输出 JSON。`,
    'A1'
  )

  // —— A2 剧本结构 ——
  onStage?.('A2', '设计角色与结构')
  const a2 = await runStep(
    A2_SYSTEM,
    `创意理解结果：\n${JSON.stringify(a1, null, 2)}\n\n请设计角色与参考图清单，输出 JSON。`,
    'A2'
  )

  // —— A3 分镜绘制（不含台词） ——
  onStage?.('A3', '绘制分镜')
  const a3 = await runStep(
    A3_SYSTEM,
    `创意理解：\n${JSON.stringify(a1, null, 2)}\n\n剧本结构（角色+参考图）：\n${JSON.stringify(
      { characters: a2.characters, references: a2.references, emotionArc: a2.emotionArc },
      null,
      2
    )}\n\n请绘制无台词分镜序列，输出 JSON。`,
    'A3'
  )

  // —— A4 对话/节奏控制（稀疏注入台词） ——
  onStage?.('A4', '注入克制对话')
  const a4 = await runStep(
    A4_SYSTEM,
    `分镜序列（无台词）：\n${JSON.stringify(a3.shots, null, 2)}\n\n请稀疏注入克制台词，输出 JSON。`,
    'A4'
  )

  // —— 合并：A3 分镜 + A4 按 index 注入 dialogue ——
  const dlgByIndex = new Map<number, any[]>()
  for (const s of a4.shots || []) {
    dlgByIndex.set(s.index, Array.isArray(s.dialogue) ? s.dialogue : [])
  }
  const shots = (a3.shots || []).map((s: any) => ({
    ...s,
    dialogue: dlgByIndex.get(s.index) || []
  }))

  const board: DirectorStoryboard = {
    title: a1.theme || a1.logline || '未命名作品',
    style: a1.style || '',
    durationSec: a1.durationSec || a2.durationSec || 30,
    emotionArc: a2.emotionArc || '',
    characters: a2.characters || [],
    references: a2.references || [],
    shots
  }
  return board
}
