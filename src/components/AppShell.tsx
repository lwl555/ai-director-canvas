import { Outlet } from 'react-router-dom'
import PlatformSidebar from './PlatformSidebar'
import PlatformTopBar from './PlatformTopBar'
import InstallPrompt from './InstallPrompt'

export default function AppShell() {
  return (
    <div className="platform">
      <PlatformSidebar />
      <div className="platform-main">
        <PlatformTopBar />
        <InstallPrompt />
        <main className="platform-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
