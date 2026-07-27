// 新建快应用弹窗：描述 → AI 生成 → 预览 + 命名 + 图标 → 保存
import { useState } from 'react'
import { generateWebApp } from '../lib/webAppGen'
import { IconPicker } from './IconPicker'
import { AppRunner } from './AppRunner'
import type { QuickApp } from '../lib/sync'

const EMOJI_DEFAULTS = ['📱', '🎮', '🎨', '🚀', '💡', '⭐', '🔧', '📝']

export function NewAppModal({
  providerId,
  model,
  onClose,
  onCreated
}: {
  providerId: string
  model: string
  onClose: () => void
  onCreated: (app: Omit<QuickApp, 'id' | 'createdAt' | 'updatedAt'>) => void
}) {
  const [step, setStep] = useState<'describe' | 'name'>('describe')
  const [desc, setDesc] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(EMOJI_DEFAULTS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function gen() {
    const d = desc.trim()
    if (!d || busy) return
    setBusy(true)
    setErr('')
    try {
      const c = await generateWebApp(d, providerId, model)
      setCode(c)
      setName(d.slice(0, 12))
      setStep('name')
    } catch (e: any) {
      setErr(e?.message || '生成失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (!code) return
    onCreated({ name: name.trim() || '未命名应用', icon, code })
    onClose()
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>新建快应用</span>
          <button className="modal-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {step === 'describe' ? (
            <>
              <label className="field-label">描述你想要的小应用</label>
              <textarea
                className="modal-textarea"
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="例如：一个番茄钟计时器，可选 25/5 分钟，有进度环和提示音"
                autoFocus
              />
              {err && <div className="modal-err">{err}</div>}
              <button className="btn-primary block" onClick={gen} disabled={busy || !desc.trim()}>
                {busy ? 'AI 生成中…' : '🤖 让 AI 生成'}
              </button>
            </>
          ) : (
            <>
              <AppRunner code={code} title="预览" compact />
              <label className="field-label">应用名称</label>
              <input
                className="modal-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="给应用起个名字"
              />
              <label className="field-label">图标</label>
              <IconPicker value={icon} onChange={setIcon} />
              <div className="modal-row">
                <button className="btn-ghost" onClick={() => setStep('describe')} disabled={busy}>
                  ← 重新描述
                </button>
                <button className="btn-primary" onClick={save}>
                  保存到快应用
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
