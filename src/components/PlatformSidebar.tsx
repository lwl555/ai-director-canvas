import { NavLink } from 'react-router-dom'
import { Icon } from './Icon'

const NAV = [
  { to: '/', label: '对话', icon: 'chat', end: true },
  { to: '/canvas', label: '画布', icon: 'canvas', end: false },
  { to: '/agents', label: '智能体', icon: 'agents', end: false },
  { to: '/create', label: '创作', icon: 'create', end: false },
  { to: '/apps', label: '快应用', icon: 'apps', end: false },
  { to: '/profile', label: '我的', icon: 'profile', end: false }
]

export default function PlatformSidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-mark">✶</span>
        <span className="logo-text">灵境 AI</span>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
          >
            <Icon name={n.icon} size={20} />
            <span className="nav-label">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">v1.0 · 多模型创作平台</div>
    </aside>
  )
}
