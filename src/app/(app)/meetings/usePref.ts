'use client'

import { useCallback, useSyncExternalStore } from 'react'

// A small string preference kept in localStorage and shared between components
// (and tabs). Read through useSyncExternalStore so the server render and the
// first client render agree (they both use `fallback`), with no hydration
// mismatch, and the saved choice applies straight after.
const EVENT = 'av-pref'

export function useLocalPref(key: string, fallback: string): [string, (value: string) => void] {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('storage', cb)
    window.addEventListener(EVENT, cb)
    return () => { window.removeEventListener('storage', cb); window.removeEventListener(EVENT, cb) }
  }, [])
  const read = useCallback(() => {
    try { return window.localStorage.getItem(key) ?? fallback } catch { return fallback }
  }, [key, fallback])
  const value = useSyncExternalStore(subscribe, read, () => fallback)
  const set = useCallback((next: string) => {
    try { window.localStorage.setItem(key, next) } catch { /* private mode: the choice just isn't remembered */ }
    window.dispatchEvent(new Event(EVENT))
  }, [key])
  return [value, set]
}

// The app sidebar keeps its own key (see AppNavigation); presentation mode
// collapses it too.
export function setAppSidebarCollapsed(collapsed: boolean) {
  try { window.localStorage.setItem('av-sidebar-collapsed', collapsed ? '1' : '0') } catch { /* ignore */ }
  window.dispatchEvent(new Event('av-sidebar'))
}

export function readAppSidebarCollapsed() {
  try { return window.localStorage.getItem('av-sidebar-collapsed') === '1' } catch { return false }
}
