// 当前选中的智能体（无登录，经中央 sync 模块，可云同步）。
// 智能体广场点击后写入，对话页读取并作为 system 注入。
import * as sync from './sync'

export interface AgentStub {
  id: string
  name: string
  emoji: string
  system: string
  desc: string
}

export function getCurrentAgent(): AgentStub | null {
  return sync.getCurrentAgent()
}

export function setCurrentAgent(a: AgentStub | null) {
  sync.setCurrentAgent(a)
}
