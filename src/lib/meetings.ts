// Shared constants/types for the Meetings department. No server-only imports,
// so both server pages and client components can use it.

export type PageType = 'CHECK_IN' | 'GOALS' | 'METRICS' | 'HEADLINES' | 'TODOS' | 'ISSUES' | 'WRAP_UP'

export const PAGE_TYPES: PageType[] = ['CHECK_IN', 'GOALS', 'METRICS', 'HEADLINES', 'TODOS', 'ISSUES', 'WRAP_UP']

export const PAGE_LABEL: Record<PageType, string> = {
  CHECK_IN: 'Check-in',
  GOALS: 'Quarterly Priorities',
  METRICS: 'KPIs',
  HEADLINES: 'Headlines',
  TODOS: 'To-dos',
  ISSUES: 'Issues',
  WRAP_UP: 'Wrap-up',
}

export type MeetingTab = 'MEETING' | 'MEETING_SUMMARIES' | 'ARCHIVE'
export const MEETING_TABS: { key: MeetingTab; label: string }[] = [
  { key: 'MEETING', label: 'Meeting' },
  { key: 'MEETING_SUMMARIES', label: 'Summary' },
  { key: 'ARCHIVE', label: 'Archive' },
]

export type IssueStatus = 'short_term' | 'parking_lot' | 'solved' | 'sent'
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  short_term: 'Short term',
  parking_lot: 'Parking lot',
  solved: 'Recently solved',
  sent: 'Sent',
}

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'quarterly'
export const CADENCES: Cadence[] = ['daily', 'weekly', 'monthly', 'quarterly']

export const CHECK_IN_PROMPTS = [
  'Share good news from the last 7 days. One personal and one business.',
  'What is one thing you are proud of this week?',
  'What is one thing that is slowing you down right now?',
]

export const TIPS = [
  'Set a deadline for to-dos to be completed within 7 days.',
  'Park long discussions as issues instead of solving them during headlines.',
  'Rate the meeting honestly. A score below 8 deserves an issue.',
  'Keep headlines to one sentence. Anything longer is an issue.',
]

export type Person = { id: string; full_name: string | null; avatar_url?: string | null }

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Monday of the week containing `d`, as YYYY-MM-DD (local time).
export function weekStart(d: Date) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export function formatSeconds(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
