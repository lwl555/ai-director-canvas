// 执行层：模型自动路由表（短剧 Harness 之 P2）
//
// 现阶段全部锁定 Agnes 免费模型（零成本）。所有模型名集中在此，
// agnes.ts 各函数改为从 ROUTES 取模型名，不再 hardcode。
// 未来要接付费模型 / Seedance / 按难度自动选模型，只需改这里 + 扩展 resolveModel。
//
// 注意：Agnes 免费档有硬限流——
//   - 视频「创建」1 个/分钟（已在 agnesVideoCreate 串链处理）
//   - 视频「状态查询」也有频率上限（见 agnesVideoStatus 的 429 退避）
// 路由层只管「选哪个模型」，限流由 agnes.ts 的客户端层统一处理。

export const ROUTES = {
  /** 规划层 LLM（创意理解 / 剧本 / 分镜 / 对话控制 等 Agent） */
  chat: 'agnes-2.0-flash',
  /** 翻译（中文提示词 → 英文） */
  translate: 'agnes-2.0-flash',
  /** 图像：角色定妆 / 场景 / 道具 / 分镜定格图 */
  image: 'agnes-image-2.1-flash',
  /** 视频：文生视频 / 图生视频 / 关键帧动画（原生口型同步） */
  video: 'agnes-video-v2.0'
} as const

export type RouteKey = keyof typeof ROUTES

/**
 * 路由策略入口。当前为静态映射；预留扩展点：
 * 未来可按任务难度 / 成本打分选模型，例如
 *   resolveModel('video', { difficulty: 'hard', budget: 'paid' }) → 'seedance-xxx'
 */
export function resolveModel(key: RouteKey): string {
  return ROUTES[key]
}
