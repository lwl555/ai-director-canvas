// 轻量内联图标（描边风格，跟随 currentColor，避免依赖图标库）
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const c = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  switch (name) {
    case 'chat':
      return (
        <svg {...c}>
          <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
        </svg>
      )
    case 'canvas':
      return (
        <svg {...c}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      )
    case 'agents':
      return (
        <svg {...c}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 4v4M9 13h.01M15 13h.01M9 17h6" />
        </svg>
      )
    case 'create':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      )
    case 'profile':
      return (
        <svg {...c}>
          <circle cx="12" cy="7" r="4" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </svg>
      )
    case 'apps':
      return (
        <svg {...c}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      )
    case 'send':
      return (
        <svg {...c}>
          <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      )
    case 'sun':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )
    case 'moon':
      return (
        <svg {...c}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )
    case 'user':
      return (
        <svg {...c}>
          <circle cx="12" cy="8" r="3.4" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...c}>
          <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
          <path d="M19 14l.8 2.1L22 17l-2.2.9L19 20l-.8-2.1L16 17l2.2-.9L19 14z" />
        </svg>
      )
    default:
      return null
  }
}
