import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'compressly.theme'

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function apply(theme: Theme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media*="dark"])')
  meta?.setAttribute('content', theme === 'dark' ? '#060b16' : '#ffffff')
}

export interface ThemeApi {
  theme: Theme
  /** True when the value comes from the OS rather than an explicit choice. */
  followingSystem: boolean
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export function useTheme(): ThemeApi {
  const [theme, setThemeState] = useState<Theme>(() => readStored() ?? systemTheme())
  const [followingSystem, setFollowingSystem] = useState(() => readStored() === null)

  useEffect(() => {
    apply(theme)
  }, [theme])

  // Follow the OS only while the user has not made an explicit choice.
  useEffect(() => {
    if (!followingSystem || typeof matchMedia !== 'function') return
    const query = matchMedia('(prefers-color-scheme: light)')
    const onChange = (event: MediaQueryListEvent) => setThemeState(event.matches ? 'light' : 'dark')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [followingSystem])

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next) // privacy:ok 'light' | 'dark', no media
    } catch {
      /* storage blocked — the choice lasts for this page only */
    }
    setFollowingSystem(false)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  return { theme, followingSystem, toggle, setTheme }
}
