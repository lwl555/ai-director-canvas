// 快应用功能区：卡片列表 + 新建（AI 生成）/ 运行 / 改进 / 改名 / 改图标 / 删除
import { useEffect, useReducer, useState } from 'react'
import { useModel } from '../model/ModelContext'
import * as sync from '../lib/sync'
import { improveWebApp } from '../lib/webAppGen'
import { NewAppModal } from '../components/NewAppModal'
import { AppEditModal } from '../components/AppEditModal'
import { ApkBuildModal } from '../components/ApkBuildModal'
import { downloadQuickAppApk } from '../lib/quickappApk'

function newId() {
  return 'app-' + Math.random().toString(36).slice(2, 10)
}
function AppIcon({ icon }: { icon: string }) {
  if (icon?.startsWith('data:')) return <img src={icon} alt="" className="app-card-icon-img" />
  return <span className="app-card-icon">{icon || '📦'}</span>
}

export default function AppsPage() {
  const { modelId, provider } = useModel()
  const [, force] = useReducer((x: number) => x + 1, 0)
  const apps = sync.getApps()

  const [newOpen, setNewOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [improveId, setImproveId] = useState<string | null>(null)
  const [improveText, setImproveText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [buildApp, setBuildApp] = useState<sync.QuickApp | null>(null)

  useEffect(() => sync.subscribe(force), [])

  const editApp = editId ? sync.getApp(editId) : null
  const runApp = runId ? sync.getApp(runId) : null
  const improveApp = improveId ? sync.getApp(improveId) : null

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(
      () => showToast('代码已复制'),
      () => showToast('复制失败')
    )
  }

  function saveNew(app: Omit<sync.QuickApp, 'id' | 'createdAt' | 'updatedAt'>) {
    sync.saveApp({ ...app, id: newId(), createdAt: Date.now(), updatedAt: Date.now() })
    showToast('已保存到快应用')
  }

  function doImprove() {
    if (!improveApp) return
    const ins = improveText.trim()
    if (!ins || busy) return
    setBusy(true)
    setErr('')
    improveWebApp(improveApp.code, ins, modelId, provider.defaultModel)
      .then((newCode) => {
        sync.updateAppCode(improveApp.id, newCode)
        setImproveId(null)
        setImproveText('')
        showToast('已用 AI 改进')
      })
      .catch((e: any) => setErr(e?.message || '改进失败，请重试'))
      .finally(() => setBusy(false))
  }

  function doEdit(name: string, icon: string) {
    if (!editApp) return
    sync.renameApp(editApp.id, name)
    sync.setAppIcon(editApp.id, icon)
    setEditId(null)
    showToast('已保存')
  }

  function doDelete(id: string) {
    if (!confirm('确定删除这个小应用吗？此操作不可恢复。')) return
    sync.deleteApp(id)
    if (runId === id) setRunId(null)
    showToast('已删除')
  }

  function doPackApk(a: sync.QuickApp) {
    setBuildApp(a)
  }

  return (
    <div className="apps">
      <div className="apps-head">
        <div>
          <h2 className="apps-title">快应用</h2>
          <p className="apps-sub">AI 生成的网页小应用，独立保存、随时运行、可让 AI 持续改进</p>
        </div>
        <button className="btn-primary" onClick={() => setNewOpen(true)}>
          ＋ 新建快应用
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="apps-empty">
          <div className="apps-empty-art">🧩</div>
          <div className="apps-empty-title">还没有快应用</div>
          <div className="apps-empty-sub">让 AI 帮你做一个网页小工具，或从对话里把生成的网页代码存进来。</div>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            ＋ 创建第一个快应用
          </button>
        </div>
      ) : (
        <div className="apps-grid">
          {apps.map((a) => (
            <div key={a.id} className="app-card">
              <button className="app-card-main" onClick={() => setRunId(a.id)} title="运行">
                <span className="app-card-icon-wrap">
                  <AppIcon icon={a.icon} />
                </span>
                <span className="app-card-name">{a.name}</span>
              </button>
              <div className="app-card-actions">
                <button className="app-card-btn" title="运行" onClick={() => setRunId(a.id)}>
                  ▶ 运行
                </button>
                <button className="app-card-btn" title="改进" onClick={() => setImproveId(a.id)}>
                  ✨ 改进
                </button>
                <button className="app-card-btn" title="复制代码" onClick={() => copyCode(a.code)}>
                  ⧉ 复制
                </button>
                <button className="app-card-btn" title="打包为安卓 APK 工程" onClick={() => doPackApk(a)}>
                  📦 打包APK
                </button>
                <button className="app-card-btn" title="改名/图标" onClick={() => setEditId(a.id)}>
                  ✎ 编辑
                </button>
                <button className="app-card-btn danger" title="删除" onClick={() => doDelete(a.id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {newOpen && (
        <NewAppModal
          providerId={modelId}
          model={provider.defaultModel}
          onClose={() => setNewOpen(false)}
          onCreated={saveNew}
        />
      )}

      {editApp && (
        <AppEditModal app={editApp} onClose={() => setEditId(null)} onSave={doEdit} />
      )}

      {improveApp && (
        <div className="modal-mask" onClick={() => !busy && setImproveId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>让 AI 改进「{improveApp.name}」</span>
              <button
                className="modal-x"
                onClick={() => !busy && setImproveId(null)}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label className="field-label">你想怎么改进？</label>
              <textarea
                className="modal-textarea"
                rows={4}
                value={improveText}
                onChange={(e) => setImproveText(e.target.value)}
                placeholder="例如：加一个深色模式切换、把按钮做大一点、增加本地保存功能"
                autoFocus
              />
              {err && <div className="modal-err">{err}</div>}
              <button className="btn-primary block" onClick={doImprove} disabled={busy || !improveText.trim()}>
                {busy ? 'AI 改进中…' : '✨ 让 AI 改进'}
              </button>
            </div>
          </div>
        </div>
      )}

      {runApp && (
        <div className="app-fullscreen" onClick={() => setRunId(null)}>
          <div className="app-fullscreen-inner" onClick={(e) => e.stopPropagation()}>
            <div className="app-fullscreen-bar">
              <span>
                <AppIcon icon={runApp.icon} /> {runApp.name}
              </span>
              <div className="app-runner-actions">
                <button
                  className="mini-btn"
                  onClick={() => copyCode(runApp.code)}
                  title="复制代码"
                >
                  ⧉ 复制
                </button>
                <button className="mini-btn" onClick={() => setRunId(null)}>
                  ✕ 关闭
                </button>
              </div>
            </div>
            <iframe
              className="app-fullscreen-frame"
              srcDoc={runApp.code}
              title={runApp.name}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        </div>
      )}

      {buildApp && (
        <ApkBuildModal
          asset="quickapp-debug.apk"
          mode="quickapp"
          html={buildApp.code}
          name={buildApp.name}
          title={`打包「${buildApp.name}」为 APK`}
          onClose={() => setBuildApp(null)}
          onFallback={() => {
            downloadQuickAppApk(buildApp)
            setBuildApp(null)
            showToast('已下载安卓工程 · 用 Android Studio 打开后 Build APK')
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
