import { useEffect, useRef, useState } from 'react'
import { PROVIDERS } from '../lib/modelRegistry'
import { loadApiKeys, saveApiKey, deleteApiKey } from '../lib/userKeys'
import { ApkBuildModal } from '../components/ApkBuildModal'
import * as sync from '../lib/sync'

export default function ProfilePage() {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, string>>({})
  const [syncState, setSyncState] = useState<string>('unknown')
  const [syncBusy, setSyncBusy] = useState(false)
  const [appBuild, setAppBuild] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // key 存于本机 localStorage，无需登录即可配置
    loadApiKeys()
      .then((k) => {
        setKeys(k)
        setDrafts(k)
      })
      .catch((e) => setStatus({ global: '读取已存 key 失败：' + e.message }))
    sync.getSyncStatus().then(setSyncState)
  }, [])

  async function doSync() {
    setSyncBusy(true)
    try {
      await sync.forceSync()
      setSyncState(await sync.getSyncStatus())
    } finally {
      setSyncBusy(false)
    }
  }

  function exportData() {
    const data = sync.exportPayload()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lingjing-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        sync.importPayload(parsed)
        loadApiKeys()
          .then((k) => {
            setKeys(k)
            setDrafts(k)
          })
          .catch(() => {})
        setStatus({ global: '已导入备份（对话/智能体/Key 已合并）' })
      } catch (e: any) {
        setStatus({ global: '导入失败：' + e.message })
      }
    }
    reader.readAsText(file)
  }

  async function save(p: string) {
    const next = { ...status }
    delete next.global
    try {
      const v = (drafts[p] ?? '').trim()
      if (!v) {
        await deleteApiKey(p)
        setKeys((k) => ({ ...k, [p]: '' }))
        setStatus({ ...next, [p]: '已清空' })
        return
      }
      await saveApiKey(p, v)
      setKeys((k) => ({ ...k, [p]: v }))
      setStatus({ ...next, [p]: '已保存' })
    } catch (e: any) {
      setStatus({ ...next, [p]: '保存失败：' + e.message })
    }
  }

  const needKey = PROVIDERS.filter((p) => p.needsKey)

  return (
    <div className="profile">
      <section className="profile-card">
        <h3>模型 API Key</h3>
        <p className="muted">
          key 保存在 <strong>本机浏览器</strong>（localStorage，仅你这台设备可见），
          切换模型时由前端直连对应厂商 API。请仅在个人设备上填写，公共电脑请勿保存。
          在 Supabase 部署 <code>sync-proxy</code> 后，Key 会按<strong>设备识别</strong>自动云同步（无需登录）。
        </p>
        <div className="key-list">
          {needKey.map((p) => (
            <div className="key-row" key={p.id}>
              <div className="key-meta">
                <span className="key-brand">{p.brand}</span>
                <span className="key-base">{p.apiBase}</span>
                {p.route === 'proxy' && <span className="key-flag">经 model-proxy 代理（需在 Supabase 部署）</span>}
              </div>
              <div className="key-input-row">
                <input
                  type="password"
                  placeholder={keys[p.id] ? '已保存（留空则清空）' : `粘贴 ${p.brand} 的 API Key`}
                  value={drafts[p.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
                <button className="btn-primary" onClick={() => save(p.id)}>
                  保存
                </button>
                {status[p.id] && <span className="key-status">{status[p.id]}</span>}
              </div>
            </div>
          ))}
        </div>
        {status.global && <p className="warn-line">{status.global}</p>}
      </section>

      <section className="profile-card">
        <h3>云同步（无登录 · 设备识别）</h3>
        <p className="muted">
          首次访问自动生成匿名设备 ID，Key 与对话/快应用按设备云同步。无需注册登录；
          清除浏览器数据即视为新设备（无登录的通病）。
        </p>
        <div className="sync-status-row">
          <span className={'sync-dot ' + syncState} />
          <span className="sync-text">
            {syncState === 'connected'
              ? '已开启 · 数据正按设备云同步'
              : syncState === 'undeployed'
                ? '未部署 sync-proxy · 当前仅本机保存（部署后自动云同步）'
                : syncState === 'offline'
                  ? '离线 · 仅本机保存'
                  : '检测中…'}
          </span>
          <button className="btn-ghost" onClick={doSync} disabled={syncBusy}>
            {syncBusy ? '同步中…' : '立即同步'}
          </button>
        </div>
      </section>

      <section className="profile-card">
        <h3>数据备份</h3>
        <p className="muted">
          导出包含对话历史、当前智能体、API Key 的 JSON 备份；导入会合并到当前设备。
          云端同步（deviceId）开启后，这些数据也会随设备同步。
        </p>
        <div className="backup-actions">
          <button className="btn-primary" onClick={exportData}>
            导出备份
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importData(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      <section className="profile-card">
        <h3>手机 APP（安卓 APK）</h3>
        <p className="muted">
          一键在云端把平台打包成可直接安装的安卓 APK（GitHub Actions 自动编译，无需本机环境）。
          装到手机后打开就是本平台，你做好的快应用也在里面。
        </p>
        <div className="backup-actions">
          <button className="btn-primary" onClick={() => setAppBuild(true)}>
            📦 生成并下载 APP（APK）
          </button>
        </div>
      </section>

      {appBuild && (
        <ApkBuildModal
          asset="app-debug.apk"
          mode="platform"
          title="打包平台 APP 为 APK"
          onClose={() => setAppBuild(false)}
        />
      )}
    </div>
  )
}
