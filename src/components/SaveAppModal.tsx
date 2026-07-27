// 对话界面里「存为快应用」弹窗：命名 + 选图标
import { useState } from 'react'
import { IconPicker } from './IconPicker'
import type { QuickApp } from '../lib/sync'

const EMOJI_DEFAULTS = ['📱', '🎮', '🎨', '🚀', '💡', '⭐', '🔧', '📝']

export function SaveAppModal({
  code,
  defaultName,
  onClose,
  onSave
}: {
  code: string
  defaultName?: string
  onClose: () => void
  onSave: (app: Omit<QuickApp, 'id' | 'createdAt' | 'updatedAt'>) => void
}) {
  const [name, setName] = useState(defaultName || '')
  const [icon, setIcon] = useState(EMOJI_DEFAULTS[Math.floor(Math.random() * EMOJI_DEFAULTS.length)])

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>存为快应用</span>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <label className="field-label">应用名称</label>
          <input
            className="modal-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="给这个小应用起个名字"
            autoFocus
          />
          <label className="field-label">图标</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={() => onSave({ name: name.trim() || '未命名应用', icon, code })}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
