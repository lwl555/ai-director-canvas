import { useStore } from '../store'
import { useGenerator } from '../hooks/useGenerator'
import { CAMERA_LABEL, REF_TYPE_LABEL, type RefNode, type ShotNode, type VideoNode } from '../types'

export default function Inspector() {
  const { selectedNode, project, updateRef, updateShot, updateVideo, setMainRef, removeRef, removeShot, removeVideo } = useStore()
  const { generateRef, generateShotImage, generateVideoForShot, retryVariant } = useGenerator()

  if (!selectedNode) {
    return (
      <aside className="inspector">
        <div className="inspector-empty">
          <div>属性面板</div>
          <p>选中画布上的节点查看与编辑详情。</p>
        </div>
      </aside>
    )
  }

  if (selectedNode.type === 'reference') {
    const r = selectedNode as RefNode
    return (
      <aside className="inspector">
        <div className="insp-head">
          <span className="tag tag-ref">{REF_TYPE_LABEL[r.refType]}</span>
          <button className="btn-ghost" onClick={() => removeRef(r.id)}>删除</button>
        </div>
        <label>标签</label>
        <input value={r.label} onChange={(e) => updateRef(r.id, { label: e.target.value })} />
        {r.refType === 'character' && (
          <>
            <label>绑定角色名</label>
            <input value={r.characterName || ''} onChange={(e) => updateRef(r.id, { characterName: e.target.value })} placeholder="如：小明" />
            <button className={`btn ${r?.isMainRef ? 'btn-active' : 'btn-primary'}`} onClick={() => setMainRef(r.id)}>
              {r?.isMainRef ? '已是主参考' : '设为主参考'}
            </button>
          </>
        )}
        <label>英文提示词</label>
        <textarea rows={6} value={r.prompt} onChange={(e) => updateRef(r.id, { prompt: e.target.value })} />
        <button className="btn btn-primary" onClick={() => generateRef(r)} disabled={r.status === 'processing'}>
          {r.status === 'done' ? '重新生成图片' : '生成图片'}
        </button>
        {r.error && <div className="err">{r.error}</div>}
      </aside>
    )
  }

  if (selectedNode.type === 'shot') {
    const s = selectedNode as ShotNode
    const refs = project.refs
    return (
      <aside className="inspector">
        <div className="insp-head">
          <span className="tag tag-shot">分镜 {s.index}</span>
          <button className="btn-ghost" onClick={() => removeShot(s.id)}>删除</button>
        </div>
        <label>标题</label>
        <input value={s.title} onChange={(e) => updateShot(s.id, { title: e.target.value })} />
        <label>镜头运动</label>
        <select value={s.cameraMotion} onChange={(e) => updateShot(s.id, { cameraMotion: e.target.value as any })}>
          {Object.entries(CAMERA_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <label>时长(秒)</label>
        <input type="number" value={s.durationSec} onChange={(e) => updateShot(s.id, { durationSec: Number(e.target.value) })} />
        <label>首帧关键帧</label>
        <select value={s.firstFrameRefId || ''} onChange={(e) => updateShot(s.id, { firstFrameRefId: e.target.value || undefined })}>
          <option value="">无</option>
          {refs.filter(Boolean).map((r) => (
            <option key={r.id} value={r.id}>{r.label}{r?.isMainRef ? ' ★' : ''}</option>
          ))}
        </select>
        <label>尾帧关键帧</label>
        <select value={s.lastFrameRefId || ''} onChange={(e) => updateShot(s.id, { lastFrameRefId: e.target.value || undefined })}>
          <option value="">无</option>
          {refs.filter(Boolean).map((r) => (
            <option key={r.id} value={r.id}>{r.label}{r?.isMainRef ? ' ★' : ''}</option>
          ))}
        </select>
        <label>英文提示词</label>
        <textarea rows={6} value={s.promptEn} onChange={(e) => updateShot(s.id, { promptEn: e.target.value })} />
        <label>中文描述</label>
        <textarea rows={3} value={s.promptZh || ''} onChange={(e) => updateShot(s.id, { promptZh: e.target.value })} />
        <button className="btn btn-primary" onClick={() => generateShotImage(s)} disabled={s.status === 'processing'}>
          {s.status === 'done' ? '重新生成定格' : '生成定格图'}
        </button>
          <button className="btn" onClick={() => generateVideoForShot(s)} style={{ marginTop: 8 }}>
          生成视频
        </button>
        {s.error && <div className="err">{s.error}</div>}
      </aside>
    )
  }

  // video
  const v = selectedNode as VideoNode
  const active = (v.variants ?? []).find((vt) => vt.id === v.activeVariantId) || (v.variants ?? [])[0]
  return (
    <aside className="inspector">
      <div className="insp-head">
        <span className="tag tag-video">视频</span>
        <button className="btn-ghost" onClick={() => removeVideo(v.id)}>删除</button>
      </div>
      <label>标题</label>
      <input value={v.title} onChange={(e) => updateVideo(v.id, { title: e.target.value })} />
      <label>时长(秒)</label>
      <input type="number" value={v.durationSec} onChange={(e) => updateVideo(v.id, { durationSec: Number(e.target.value) })} />
      <label>版本 ({v.variants?.length ?? 0})</label>
      <div className="variant-list">
        {v.variants.map((vt, i) => (
          <div key={vt.id} className={`variant-row ${vt.id === active?.id ? 'on' : ''}`}>
            <button className="btn-xs" onClick={() => updateVideo(v.id, { activeVariantId: vt.id })}>选为成片</button>
            <span>v{i + 1} · {vt.status === 'done' ? '完成' : vt.status === 'failed' ? '失败' : '渲染中'}</span>
            {vt.status === 'failed' && (
              <button className="btn-xs ghost" onClick={() => retryVariant(v, vt.id)}>重试</button>
            )}
          </div>
        ))}
      </div>
      <button className="btn btn-primary" onClick={() => { const shot = project.shots.find((s) => s.id === v.shotId); if (shot) generateVideoForShot(shot) }} style={{ marginTop: 8 }}>
        ＋ 生成新版本
      </button>
    </aside>
  )
}
