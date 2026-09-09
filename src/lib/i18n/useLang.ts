'use client'

import { useEffect, useState } from 'react'
import type { Lang } from './languages'

const STORAGE_KEY = 'app_lang'

// Per-device language preference — stored in localStorage, not tied to the
// account, so a shared guard-post tablet or public kiosk device keeps
// whatever language it was last set to regardless of who's signed in (or,
// on the public visitor form, not signed in at all).
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (saved === 'en' || saved === 'zh' || saved === 'ms') setLangState(saved)
    } catch {
      // localStorage can throw in a locked-down browser context — falls
      // back to English silently rather than breaking the page.
    }
  }, [])

  function setLang(l: Lang) {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
  }

  return [lang, setLang]
}
