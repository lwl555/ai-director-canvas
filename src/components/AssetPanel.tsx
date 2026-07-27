import { useRef, type ChangeEvent } from 'react'
import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { REF_TYPE_LABEL, type RefNode } from '../types'
import { uid } from '../lib/id'

const SB_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined
const SB_ANON = (import.meta as any).env?.VITE_SUPABASE_ANON as string | undefined
const STORAGE_BUCKET = 'references'

// 本地兜底：把图片读成 data URL（仅在 Supabase 未配置或上传失败时使用）
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 上传到 Supabase Storage，返回公开可访问的 URL。
// 走 anon key 直连（与 persistence.ts 存工程 JSON 同一套鉴权），bucket 需预先在
// Supabase 建好且设为 public + 允许 anon insert。
async function uploadToStorage(file: File): Promise<string> {
  if (!SB_URL || !SB_ANON) throw new Error('Supabase 未配置')
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'png'
  const path = `references/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`
  const res = await fetch(`${SB_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SB_ANON,
      Authorization: `Bearer ${SB_ANON}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  })
  if (!res.ok) throw new Error(`上传失败 ${res.status}`)
  return `${SB_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`
}

// 优先上传到后端 Storage；任何一步失败则降级为本地 data URL，保证功能不崩。
async function resolveImageUrl(file: File, onFallback: () => void): Promise<string> {
  try {
    return await uploadToStorage(file)
  } catch (e) {
    onFallback()
    return await fileToDataURL(file)
  }
}

export default function AssetPanel() {
  const { project, addRef, updateRef, removeRef, setMainRef } = useStore()
  const { generateRef } = useGenerator()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingTypeRef = useRef<RefNode['refType']>('character')

  const triggerUpload = (refType: RefNode['refType']) => {
    pendingTypeRef.current = refType
    fileInputRef.current?.click()
  }

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件')
      return
    }
    try {
      const imageUrl = await resolveImageUrl(file, () => {})
      const refType = pendingTypeRef.current
      const ref: RefNode = {
        id: uid(),
        type: 'reference',
        refType,
        label: file.name.replace(/\.[^.]+$/, '') || `上传${REF_TYPE_LABEL[refType]}`,
        characterName: refType === 'character' ? '' : undefined,
        isMainRef: false,
        prompt: '',
        promptEn: '',
        status: 'done',
        imageUrl,
        error: undefined,
        x: 60 + Math.random() * 80,
        y: 60 + Math.random() * 200
      }
      addRef(ref)
    } catch {
      alert('图片读取失败')
    }
  }

  const addAsset = (refType: RefNode['refType']) => {
    const ref: RefNode = {
      id: uid(),
      type: 'reference',
      refType,
      label: `新${REF_TYPE_LABEL[refType]}`,
      characterName: refType === 'character' ? '' : undefined,
      isMainRef: false,
      prompt: '',
      promptEn: '',
      status: 'idle',
      imageUrl: undefined,
      error: undefined,
      x: 60 + Math.random() * 80,
      y: 60 + Math.random() * 200
    }
    addRef(ref)
  }

  const characters = project.refs.filter(Boolean).filter((r) => r.refType === 'character')
  const scenes = project.refs.filter(Boolean).filter((r) => r.refType === 'scene')
  const objects = project.refs.filter(Boolean).filter((r) => r.refType === 'object' || r.refType === 'other_character')

  return (
    <aside className="asset-panel">
      <div className="asset-header">资产库</div>

      <Section title="角色定妆" onAdd={() => addAsset('character')} onUpload={() => triggerUpload('character')} badge={characters.length}>
        {characters.map((r) => (
          <AssetCard
            key={r.id}
            node={r}
            onGenerate={() => generateRef(r, { autoProps: true })}
            onSetMain={() => setMainRef(r.id)}
            onRemove={() => removeRef(r.id)}
            onUpdate={(patch) => updateRef(r.id, patch)}
          />
        ))}
      </Section>

      <Section title="场景概念" onAdd={() => addAsset('scene')} onUpload={() => triggerUpload('scene')} badge={scenes.length}>
        {scenes.map((r) => (
          <AssetCard
            key={r.id}
            node={r}
            onGenerate={() => generateRef(r, { autoProps: true })}
            onSetMain={() => setMainRef(r.id)}
            onRemove={() => removeRef(r.id)}
            onUpdate={(patch) => updateRef(r.id, patch)}
          />
        ))}
      </Section>

      <Section title="物体道具" onAdd={() => addAsset('object')} onUpload={() => triggerUpload('object')} badge={objects.length}>
        {objects.map((r) => (
          <AssetCard
            key={r.id}
            node={r}
            onGenerate={() => generateRef(r)}
            onSetMain={() => setMainRef(r.id)}
            onRemove={() => removeRef(r.id)}
            onUpdate={(patch) => updateRef(r.id, patch)}
          />
        ))}
      </Section>

      <div className="asset-tip">
        拖拽卡片到画布可自由摆放；点击「设主参考」将这张图设为主参考，后续视频会优先对齐，角色更一致。
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleUpload} />
    </aside>
  )
}

function Section({
  title,
  badge,
  onAdd,
  onUpload,
  children
}: {
  title: string
  badge: number
  onAdd: () => void
  onUpload: () => void
  children: React.ReactNode
}) {
  return (
    <div className="asset-section">
      <div className="asset-section-head">
        <span>
          {title} <em>{badge}</em>
        </span>
        <span className="asset-section-actions">
          <button className="mini-add" onClick={onAdd} title="添加（AI 生成）">
            ＋
          </button>
          <button className="mini-up" onClick={onUpload} title="上传本地图片作为参考">
            ↑
          </button>
        </span>
      </div>
      <div className="asset-list">{children}</div>
    </div>
  )
}

function AssetCard({
  node,
  onGenerate,
  onSetMain,
  onRemove,
  onUpdate
}: {
  node: RefNode
  onGenerate: () => void
  onSetMain: () => void
  onRemove: () => void
  onUpdate: (patch: Partial<RefNode>) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file || !file.type.startsWith('image/')) return
    try {
      const imageUrl = await resolveImageUrl(file, () => {})
      onUpdate({ imageUrl, status: 'done', error: undefined })
    } catch {
      alert('图片读取失败')
    }
  }

  return (
    <div className={`asset-card ${node.isMainRef ? 'is-main' : ''}`} draggable>
      <div className="asset-card-top">
        <input
          className="asset-label"
          value={node.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
        <button
          className={`star ${node.isMainRef ? 'on' : ''}`}
          onClick={onSetMain}
          title={node.isMainRef ? '主参考（点击取消）' : '设为主参考'}
        >
          {node.isMainRef ? '★' : '☆'}
        </button>
      </div>
      <div className="asset-img-wrap" onClick={() => fileRef.current?.click()} title="点击上传 / 替换图片">
        {node.imageUrl ? (
          <img className="asset-img" src={node.imageUrl} alt={node.label} draggable={false} />
        ) : (
          <div className="asset-img placeholder">
            {node.status === 'processing' || node.status === 'pending' ? '生成中…' : '无图 · 点击上传'}
          </div>
        )}
      </div>
      <textarea
        className="asset-prompt"
        placeholder="提示词（可输入中文，生成时自动翻译）"
        value={node.prompt}
        onChange={(e) => onUpdate({ prompt: e.target.value })}
        rows={2}
      />
      <div className="asset-actions">
        <button className="btn-sm" onClick={onGenerate} disabled={node.status === 'processing'}>
          {node.status === 'done' ? '重生成' : '生成'}
        </button>
        <button className="btn-sm ghost" onClick={() => fileRef.current?.click()} title="上传 / 替换图片">
          ↑
        </button>
        <button className="btn-sm ghost" onClick={onRemove}>
          删
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
    </div>
  )
}
