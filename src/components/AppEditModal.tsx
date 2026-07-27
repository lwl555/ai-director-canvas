// 编辑快应用弹窗：改名 + 改图标
import { useState } from 'react'
import { IconPicker } from './IconPicker'
import type { QuickApp } from '../lib/sync'

export function AppEditModal({
  app,
  onClose,
  onSave
}: {
  app: QuickApp
  onClose: () => void
  onSave: (name: string, icon: string) => void
}) {
  const [name, setName] = useState(app.name)
  const [icon, setIcon] = useState(app.icon)

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>编辑应用</span>
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
            placeholder="应用名称"
            autoFocus
          />
          <label className="field-label">图标</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={() => onSave(name.trim() || '未命名应用', icon)}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
