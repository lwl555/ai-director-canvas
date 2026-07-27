import { HashRouter, Routes, Route } from 'react-router-dom'
import AppShell from './components/AppShell'
import ChatPage from './pages/ChatPage'
import CanvasPage from './pages/CanvasPage'
import AgentsPage from './pages/AgentsPage'
import CreatePage from './pages/CreatePage'
import ProfilePage from './pages/ProfilePage'
import AppsPage from './pages/AppsPage'
import { ModelProvider } from './model/ModelContext'

// 平台外壳：HashRouter（GitHub Pages 项目站点无需服务端 SPA fallback）。
// 画布降级为 /canvas 子路由，其余为豆包/元宝式功能页。
export default function App() {
  return (
    <HashRouter>
      <ModelProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<ChatPage />} />
            <Route path="canvas" element={<CanvasPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="create" element={<CreatePage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="*" element={<ChatPage />} />
          </Route>
        </Routes>
      </ModelProvider>
    </HashRouter>
  )
}
