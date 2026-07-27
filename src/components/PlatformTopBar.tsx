import { useLocation } from 'react-router-dom'
import { useModel } from '../model/ModelContext'
import { PROVIDERS } from '../lib/modelRegistry'
import { useTheme } from '../theme/ThemeContext'
import { Icon } from './Icon'

const TITLES: Record<string, string> = {
  '/': '对话',
  '/canvas': 'AI 导演画布',
  '/agents': '智能体广场',
  '/create': '创作工坊',
  '/profile': '我的'
}

export default function PlatformTopBar() {
  const { pathname } = useLocation()
  const { modelId, setModelId, provider, hasKey } = useModel()
  const { theme, toggleTheme } = useTheme()
  const title = TITLES[pathname] ?? '灵境 AI'

  const cn = PROVIDERS.filter((p) => p.region === 'cn')
  const global = PROVIDERS.filter((p) => p.region === 'global')

  return (
    <header className="topbar">
      <div className="topbar-title">{title}</div>
      <div className="topbar-actions">
        <button
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          aria-label="切换主题"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
        <div className="model-select-wrap" title={provider.note ?? ''}>
          <select
            className="model-select"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            aria-label="选择模型"
          >
            <optgroup label="国内模型">
              {cn.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand}
                  {p.needsKey ? (p.route === 'proxy' ? '（需代理）' : '') : ' · 免配置'}
                </option>
              ))}
            </optgroup>
            <optgroup label="国外模型">
              {global.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.brand}
                  {p.route === 'proxy' ? '（需代理）' : ''}
                </option>
              ))}
            </optgroup>
          </select>
          {provider.needsKey && !hasKey && (
            <span className="key-needed" title="当前模型需要先在「设置」填写 API Key">
              需填 Key
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
