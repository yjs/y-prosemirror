import { useEffect, useState } from 'react'

const STORAGE_KEY = 'yhub-demo-theme-override'

const readOverride = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const systemPrefersDark = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches

export const useTheme = () => {
  const [override, setOverrideState] = useState(readOverride)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const effective = override || (systemDark ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = effective
  }, [effective])

  const setOverride = (value) => {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value)
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
    setOverrideState(value)
  }

  return {
    theme: effective,
    override,
    toggle: () => setOverride(effective === 'dark' ? 'light' : 'dark'),
    clearOverride: () => setOverride(null),
    setOverride
  }
}

// Apply persisted theme synchronously at module load to avoid FOUC.
document.documentElement.dataset.theme =
  readOverride() || (systemPrefersDark() ? 'dark' : 'light')
