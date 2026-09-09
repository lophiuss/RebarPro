export type Lang = 'en' | 'zh' | 'ms'

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
  { code: 'ms', label: 'Bahasa Melayu' },
]

export type Dict = Record<string, string>

// Looks up `key` in the current language's dictionary, falling back to
// English, then the raw key itself — so a string missing from a
// translation (or not yet translated) still renders something readable
// instead of crashing or showing blank.
export function makeT(dict: Record<Lang, Dict>, lang: Lang) {
  return (key: string): string => dict[lang]?.[key] ?? dict.en[key] ?? key
}
