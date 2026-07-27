import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const ThemeCtx = createContext<{
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
} | null>(null)

const KEY = 'platform.theme'

function initial(): Theme {
  if (typeof localStorage !== 'undefined') {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark') return s
  }
  // 默认白色（浅色），符合产品要求
  return 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(KEY, theme)
    } catch {}
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  return <ThemeCtx.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  const c = useContext(ThemeCtx)
  if (!c) throw new Error('useTheme must be used within ThemeProvider')
  return c
}
