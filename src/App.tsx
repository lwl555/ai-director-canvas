import { useState } from 'react'
import TopBar from './components/TopBar'
import LeftSidebar from './components/LeftSidebar'
import Canvas from './components/Canvas'
import Inspector from './components/Inspector'
import Timeline from './components/Timeline'
import DirectorChat from './components/DirectorChat'
import { useStore } from './store'

export default function App() {
  const [directorOpen, setDirectorOpen] = useState(false)
  const { project } = useStore()
  const shotCount = project.nodes.filter((n) => n.type === 'video').length
  const refCount = project.nodes.filter((n) => n.type === 'reference').length

  return (
    <div className="app">
      <TopBar onToggleDirector={() => setDirectorOpen((v) => !v)} directorOpen={directorOpen} />
      <div className="body">
        <LeftSidebar />
        <div className="center">
          <Canvas />
          <Timeline />
        </div>
        <Inspector />
      </div>
      {directorOpen && <DirectorChat onClose={() => setDirectorOpen(false)} />}
      <div className="status-bar">
        节点 {project.nodes.length} · 分镜 {shotCount} · 参考图 {refCount} · 自动保存到本地
      </div>
    </div>
  )
}
