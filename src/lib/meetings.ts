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

export type MeetingTab = 'MEETING' | 'WORKSPACE' | 'MEETING_SUMMARIES' | 'GROWTH_PLAN' | 'ARCHIVE'
export const MEETING_TABS: { key: MeetingTab; label: string }[] = [
  { key: 'MEETING', label: 'Meeting' },
  { key: 'WORKSPACE', label: 'Workspace' },
  { key: 'MEETING_SUMMARIES', label: 'Summary' },
  { key: 'GROWTH_PLAN', label: 'Growth Plan' },
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

// Quarterly 1:1 conversation template. Both people answer the same questions
// (answers = { manager: {...}, report: {...} }), then compare side by side.
export type OneOnOneQuestion = { id: string; section: string; label: string; type: 'text' | 'rating' }
export const ONE_ON_ONE_QUESTIONS: OneOnOneQuestion[] = [
  { id: 'role', section: 'Role & expectations', label: 'In your own words, what is the role and what is expected of it?', type: 'text' },
  { id: 'clarity', section: 'Role & expectations', label: 'How clear are the expectations? (1-10)', type: 'rating' },
  { id: 'wins', section: 'Last quarter', label: 'What were the biggest wins?', type: 'text' },
  { id: 'misses', section: 'Last quarter', label: 'What did not go as planned, and why?', type: 'text' },
  { id: 'feedback', section: 'Feedback', label: 'What should the other person start, stop or continue doing?', type: 'text' },
  { id: 'growth', section: 'Growth', label: 'What should be learned or achieved in the next 12 months?', type: 'text' },
  { id: 'next', section: 'Next quarter', label: 'What are the top priorities for the next 90 days?', type: 'text' },
  { id: 'support', section: 'Next quarter', label: 'What support is needed to deliver them?', type: 'text' },
]

export type OneOnOneSide = {
  [questionId: string]: unknown
  core_values?: Record<string, string>
  gwc?: { gets_it?: boolean | null; wants_it?: boolean | null; capacity?: boolean | null }
}
export type OneOnOneAnswers = { manager?: OneOnOneSide; report?: OneOnOneSide }

export function currentQuarter(d = new Date()) {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}

// Organisation-wide Growth Plan document (mtg_growth_plan.content).
export type GrowthPlanContent = {
  what?: string
  how?: string
  why?: string
  five_year_vision?: string
  marketing?: { ideal_client?: string; differentiators?: string[]; proven_process?: string; guarantee?: string }
  three_year?: { date?: string; goals?: string[]; possibilities?: string[] }
  one_year?: { date?: string; goals?: string[]; annual_goals?: string[] }
  ninety_day?: { date?: string; goals?: string[] }
}

// Local YYYY-MM-DD.
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatSeconds(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
