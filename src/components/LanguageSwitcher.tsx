'use client'

import { LANGUAGES, type Lang } from '@/lib/i18n/languages'

export default function LanguageSwitcher({ lang, onChange, dark = false }: { lang: Lang; onChange: (l: Lang) => void; dark?: boolean }) {
  return (
    <div className={`inline-flex gap-1 rounded-lg p-1 ${dark ? 'bg-white/10' : 'bg-gray-100'}`}>
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          onClick={() => onChange(l.code)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition ${
            lang === l.code
              ? (dark ? 'bg-white text-slate-900' : 'bg-white shadow-sm text-slate-900')
              : (dark ? 'text-white/70 hover:text-white' : 'text-gray-500 hover:text-gray-700')
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
