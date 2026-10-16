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

export type MeetingTab = 'MEETING' | 'WORKSPACE' | 'WHITEBOARD' | 'DOCUMENTS' | 'MEETING_SUMMARIES' | 'GROWTH_PLAN' | 'ARCHIVE'
export const MEETING_TABS: { key: MeetingTab; label: string }[] = [
  { key: 'MEETING', label: 'Meeting' },
  { key: 'WORKSPACE', label: 'Workspace' },
  { key: 'WHITEBOARD', label: 'Whiteboard' },
  { key: 'DOCUMENTS', label: 'Documents' },
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

// ---------------------------------------------------------------- KPI goals
// Same rules and units as Bloom's KPI form.
export type GoalRule = 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
export const GOAL_RULES: { key: GoalRule; symbol: string; label: string }[] = [
  { key: 'eq', symbol: '=', label: 'Equal to' },
  { key: 'gt', symbol: '>', label: 'Greater than' },
  { key: 'gte', symbol: '≥', label: 'Greater than or equal to' },
  { key: 'lt', symbol: '<', label: 'Less than' },
  { key: 'lte', symbol: '≤', label: 'Less than or equal to' },
  { key: 'between', symbol: '⇔', label: 'Between' },
]

export type UnitType = 'number' | 'percent' | 'dollars' | 'euros' | 'pesos' | 'yen' | 'pounds' | 'inr' | 'rand' | 'aed' | 'xcg' | 'myr' | 'sgd' | 'yesno'
export const UNIT_TYPES: { key: UnitType; label: string; prefix?: string; suffix?: string }[] = [
  { key: 'number', label: 'Number' },
  { key: 'percent', label: 'Percent', suffix: '%' },
  { key: 'dollars', label: 'Dollars', prefix: '$' },
  { key: 'euros', label: 'Euros', prefix: '€' },
  { key: 'pesos', label: 'Pesos', prefix: '₱' },
  { key: 'yen', label: 'Yen', prefix: '¥' },
  { key: 'pounds', label: 'Pounds', prefix: '£' },
  { key: 'inr', label: 'INR', prefix: '₹' },
  { key: 'rand', label: 'South African Rand', prefix: 'R' },
  { key: 'aed', label: 'AED', prefix: 'AED ' },
  { key: 'xcg', label: 'XCG', prefix: 'XCG ' },
  { key: 'myr', label: 'MYR (Malaysian Ringgit)', prefix: 'RM ' },
  { key: 'sgd', label: 'SGD (Singapore Dollar)', prefix: 'S$' },
  { key: 'yesno', label: 'Yes / No' },
]

export type Goal = { rule: GoalRule; value: number | null; max: number | null }

export function formatKpiValue(v: number | null | undefined, unit: UnitType): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  if (unit === 'yesno') return v >= 1 ? 'Yes' : 'No'
  const u = UNIT_TYPES.find(x => x.key === unit)
  const n = Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
  return `${u?.prefix ?? ''}${n}${u?.suffix ?? ''}`
}

export function formatGoal(goal: Goal, unit: UnitType): string {
  const sym = GOAL_RULES.find(r => r.key === goal.rule)?.symbol ?? '≥'
  if (goal.value === null || goal.value === undefined) return '—'
  if (goal.rule === 'between') return `${formatKpiValue(goal.value, unit)} – ${formatKpiValue(goal.max, unit)}`
  return `${sym} ${formatKpiValue(goal.value, unit)}`
}

// true = goal met, false = missed, null = nothing to compare.
export function evaluateGoal(goal: Goal, value: number | null | undefined): boolean | null {
  if (value === null || value === undefined || goal.value === null || goal.value === undefined) return null
  switch (goal.rule) {
    case 'eq': return value === goal.value
    case 'gt': return value > goal.value
    case 'gte': return value >= goal.value
    case 'lt': return value < goal.value
    case 'lte': return value <= goal.value
    case 'between': {
      if (goal.max === null || goal.max === undefined) return null
      return value >= Math.min(goal.value, goal.max) && value <= Math.max(goal.value, goal.max)
    }
  }
}

// ---------------------------------------------------------------- To-do board
export type TodoStatus = 'todo' | 'in_progress' | 'blocked' | 'done'
export const TODO_COLUMNS: { key: TodoStatus; label: string; tone: string }[] = [
  { key: 'todo', label: 'To do', tone: 'bg-slate-100 text-slate-700' },
  { key: 'in_progress', label: 'In progress', tone: 'bg-blue-100 text-blue-700' },
  { key: 'blocked', label: 'Blocked', tone: 'bg-red-100 text-red-700' },
  { key: 'done', label: 'Done', tone: 'bg-green-100 text-green-700' },
]

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

// Departments a document can be filed under (the Documents page groups by these automatically).
export const DOC_DEPARTMENTS = ['BPlant', 'Maintenance', 'Mould', 'HR', 'Rebar', 'Security', 'Meetings', 'Other']
