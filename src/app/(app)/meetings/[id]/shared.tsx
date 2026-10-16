'use client'

import { FileText } from 'lucide-react'
import { useMeeting } from './context'
import { PersonSelect } from '../PersonPicker'
import { ymd, type Cadence, type IssueStatus, type TodoStatus, type GoalRule, type UnitType, type Goal as GoalValue } from '@/lib/meetings'

// ----------------------------------------------------------------- data types

export type Headline = { id: string; title: string; details: string | null; owner_id: string | null; created_at: string }
export type Todo = {
  id: string; title: string; details: string | null; owner_id: string | null; due_date: string | null
  done_at: string | null; run_id: string | null; created_at: string; status: TodoStatus
  source_headline_id?: string | null
}
export type Issue = {
  id: string; title: string; details: string | null; owner_id: string | null; status: IssueStatus
  solved_run_id: string | null; created_at: string; due_date?: string | null; source_headline_id?: string | null
}

// Items created in the last 3 days carry a green "New" badge.
export function isNew(createdAt: string | undefined | null) {
  if (!createdAt) return false
  return new Date().getTime() - new Date(createdAt).getTime() < 3 * 86400000
}
export function NewBadge({ createdAt }: { createdAt: string | undefined | null }) {
  if (!isNew(createdAt)) return null
  return <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide rounded-full bg-green-100 text-green-700 px-1.5 py-0.5">New</span>
}
export type Milestone = { title: string; done: boolean; done_at?: string | null }
export type Goal = {
  id: string; title: string; details: string | null; owner_id: string | null; status: 'on' | 'off' | 'done'
  due_date: string | null; milestones: Milestone[]; created_at: string
}
export type OtherMeetings = { id: string; name: string }[]
export type Kpi = {
  id: string; name: string; details: string | null; owner_id: string | null; cadence: Cadence
  unit_type: UnitType; goal_rule: GoalRule; goal_value: number | null; goal_value_max: number | null
  meeting_ids: string[]
}
export type KpiCustomGoal = { kpi_id: string; period_start: string; goal_rule: GoalRule; goal_value: number | null; goal_value_max: number | null }
export type KpiValue = { kpi_id: string; period_start: string; value: number | null }
export type Rating = { user_id: string; rating: number | null; feedback: string | null }

// The KPI's normal goal, or the custom goal set for one specific period.
export function kpiBaseGoal(k: Kpi): GoalValue {
  return { rule: k.goal_rule, value: k.goal_value, max: k.goal_value_max }
}
export function effectiveGoal(k: Kpi, period: string, custom: KpiCustomGoal[]): GoalValue {
  const c = custom.find(x => x.kpi_id === k.id && x.period_start === period)
  return c ? { rule: c.goal_rule, value: c.goal_value, max: c.goal_value_max } : kpiBaseGoal(k)
}

// ---------------------------------------------------------------------- look
// Same visual language as the other AlphaVision modules: soft white cards with a
// light shadow, rounded-lg controls, small uppercase labels, pill segmented tabs.

export const card = 'border rounded-xl bg-white shadow-sm'
export const input = 'border rounded-md px-2.5 py-1.5 text-sm bg-white'
export const primaryBtn = 'inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50'
export const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-gray-500'

export const todayStr = () => ymd(new Date())

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border border-dashed rounded-xl p-8 text-center bg-white">
      <div className="font-semibold text-slate-700">{title}</div>
      <div className="text-sm text-gray-500 mt-1">{hint}</div>
    </div>
  )
}

// Quick-add owner: attendees of this meeting, searchable. (The item panel can
// assign anyone.)
export function OwnerSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { people, attendeeIds } = useMeeting()
  // This meeting's people first; anyone else can still be picked from the list below them.
  return (
    <PersonSelect
      people={people.filter(p => attendeeIds.includes(p.id))}
      others={people.filter(p => !attendeeIds.includes(p.id))}
      othersLabel="Not in this meeting"
      value={value}
      onChange={onChange}
      ariaLabel="Owner"
      className="md:w-52"
    />
  )
}

// Row title that opens the item panel; an icon marks items that have details.
export function ItemTitle({ title, hasDetails, struck, onOpen }: { title: string; hasDetails: boolean; struck?: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title="Open details" className={`flex-1 min-w-0 text-left truncate hover:text-blue-700 ${struck ? 'line-through text-gray-400' : ''}`}>
      {title}
      {hasDetails && <FileText className="inline-block w-3.5 h-3.5 ml-1.5 text-gray-400 align-[-2px]" aria-label="Has details" />}
    </button>
  )
}

export type SortKey = 'default' | 'owner'

export function SortSelect({ value, onChange, defaultLabel = 'Oldest' }: { value: SortKey; onChange: (v: SortKey) => void; defaultLabel?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as SortKey)} className="border rounded-lg px-2 py-1 text-xs bg-white text-gray-600" aria-label="Sort">
      <option value="default">{defaultLabel}</option>
      <option value="owner">Owner: A-Z</option>
    </select>
  )
}

// Stable sort by owner name (items without an owner last).
export function sortByOwner<T extends { owner_id: string | null }>(items: T[], peopleById: Map<string, { full_name: string | null }>): T[] {
  const name = (id: string | null) => (id ? peopleById.get(id)?.full_name ?? '~' : '~~')
  return [...items].sort((a, b) => name(a.owner_id).localeCompare(name(b.owner_id)))
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 className="text-2xl font-bold text-slate-900">{children}</h2>
      {right}
    </div>
  )
}

// Pill-style segmented control, like the date-range toggles on the other dashboards.
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { key: T; label: string }[]
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-gray-100 p-1 text-sm" role="tablist">
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap ${value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Pill used for statuses (matches the small uppercase status pills elsewhere).
export function Pill({ children, tone = 'bg-gray-100 text-gray-700' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>{children}</span>
}
