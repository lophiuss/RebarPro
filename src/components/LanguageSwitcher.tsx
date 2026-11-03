'use client'

import { LANGUAGES, type Lang } from '@/lib/i18n/languages'

export default function LanguageSwitcher({
  lang,
  onChange,
  dark = false,
  compact = false,
}: {
  lang: Lang
  onChange: (l: Lang) => void
  dark?: boolean
  compact?: boolean
}) {
  const shortLabels: Record<Lang, string> = {
    en: 'EN',
    zh: '中',
    ms: 'BM',
  }

  return (
    <div className={`inline-flex gap-1 rounded-lg p-1 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          className={`rounded-md text-xs font-semibold transition ${
            compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1'
          } ${
            lang === l.code
              ? (dark ? 'bg-white text-slate-900' : 'bg-white shadow-sm text-slate-900')
              : (dark ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-700')
          }`}
          title={l.label}
        >
          {compact ? shortLabels[l.code] : l.label}
        </button>
      ))}
    </div>
  )
}
