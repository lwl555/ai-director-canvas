import { useState } from 'react'
import TopBar from '../components/TopBar'
import AssetPanel from '../components/AssetPanel'
import InfiniteCanvas from '../components/InfiniteCanvas'
import DirectorChat from '../components/DirectorChat'
import Timeline from '../components/Timeline'
import Inspector from '../components/Inspector'
import { useStore } from '../store'

// 原 App.tsx 的画布主体，整体降级为 /canvas 子路由。
// 逻辑零改动，仅把 StoreProvider 上移到 CanvasPage。
export default function CanvasApp() {
  const [directorOpen, setDirectorOpen] = useState(false)
  const { project } = useStore()

  return (
    <div className="app">
      <TopBar onToggleDirector={() => setDirectorOpen((v) => !v)} directorOpen={directorOpen} />
      <div className="body">
        <AssetPanel />
        <div className="center">
          <InfiniteCanvas />
          <Timeline />
        </div>
        <Inspector />
      </div>
      {directorOpen && <DirectorChat onClose={() => setDirectorOpen(false)} />}
      <div className="status-bar">
        资产 {project.refs.length} · 分镜 {project.shots.length} · 视频 {project.videos.length} · 自动保存本地
      </div>
    </div>
  )
}
