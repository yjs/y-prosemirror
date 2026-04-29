import { useEffect, useState } from 'react'

export const USERS = [
  { id: 'alice', name: 'Alice', color: '#30bced', colorLight: '#30bced33' },
  { id: 'bob', name: 'Bob', color: '#6eeb83', colorLight: '#6eeb8333' },
  { id: 'charlie', name: 'Charlie', color: '#ffbc42', colorLight: '#ffbc4233' },
  { id: 'dana', name: 'Dana', color: '#ee6352', colorLight: '#ee635233' }
]

const STORAGE_KEY = 'yhub-demo-user'

// Per-tab identity: sessionStorage so two tabs on the same origin can hold different users.
// The `?as=<id>` URL param takes precedence and is persisted into sessionStorage.
export const getCurrentUser = () => {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('as')
    if (fromUrl && USERS.some((u) => u.id === fromUrl)) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl)
      return USERS.find((u) => u.id === fromUrl)
    }
    const id = sessionStorage.getItem(STORAGE_KEY)
    return USERS.find((u) => u.id === id) || null
  } catch {
    return null
  }
}

export const setCurrentUser = (id) => {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  // Keep the `?as=` URL param in sync so it doesn't force a stale identity on the next read.
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has('as')) {
      if (id) url.searchParams.set('as', id)
      else url.searchParams.delete('as')
      window.history.replaceState(null, '', url.toString())
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('yhub-identity-change'))
}

export const useCurrentUser = () => {
  const [user, setUser] = useState(getCurrentUser)
  useEffect(() => {
    const handler = () => setUser(getCurrentUser())
    window.addEventListener('yhub-identity-change', handler)
    return () => window.removeEventListener('yhub-identity-change', handler)
  }, [])
  return user
}
