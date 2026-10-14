'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, Star } from 'lucide-react'
import { useMeeting } from './context'
import Avatar from '../Avatar'
import { weekStart, ymd, type PageType } from '@/lib/meetings'
import type { Headline, Todo, Issue, Goal, Kpi, KpiValue } from './Sections'
import type { SummaryRow } from './SummaryArchive'

const card = 'border rounded-xl bg-white'

function Tile({ title, count, page, children }: { title: string; count?: number; page?: PageType; children: React.ReactNode }) {
  const { meetingId } = useMeeting()
  return (
    <section className={`${card} flex flex-col`}>
      <header className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-bold text-slate-900">{title}{count != null && <span className="ml-1.5 text-gray-400 font-normal text-sm">({count})</span>}</h2>
        {page && (
          <Link href={`/meetings/${meetingId}?tab=MEETING&pageType=${page}`} className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1">
            Open <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </header>
      <div className="p-4 flex-1">{children}</div>
    </section>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-gray-400 text-center py-3">{children}</p>

const GOAL_STYLE: Record<string, string> = { on: 'bg-green-100 text-green-700', off: 'bg-red-100 text-red-700', done: 'bg-blue-100 text-blue-700' }
const GOAL_LABEL: Record<string, string> = { on: 'On track', off: 'Off track', done: 'Done' }

function progress(g: Goal) {
  const total = g.milestones.length
  const done = g.milestones.filter(m => m.done).length
  return { total, done, pct: total ? Math.round((done / total) * 100) : g.status === 'done' ? 100 : 0 }
}

export function MeetingWorkspace({
  headlines, todos, issues, goals, kpis, kpiValues, summaries,
}: { headlines: Headline[]; todos: Todo[]; issues: Issue[]; goals: Goal[]; kpis: Kpi[]; kpiValues: KpiValue[]; summaries: SummaryRow[] }) {
  const { myId, peopleById, attendeeIds } = useMeeting()
  const thisWeek = useMemo(() => weekStart(new Date()), [])
  const today = ymd(new Date())
  const byKey = useMemo(() => new Map(kpiValues.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [kpiValues])

  const myTodos = todos.filter(t => t.owner_id === myId && !t.done_at)
  const shortTerm = issues.filter(i => i.status === 'short_term')
  const weekly = kpis.filter(k => k.cadence === 'weekly')
  const last = summaries[0]

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Tile title="My to-dos" count={myTodos.length} page="TODOS">
        {myTodos.length === 0 ? <Empty>Nothing open for you.</Empty> : (
          <ul className="divide-y -mx-1">
            {myTodos.slice(0, 6).map(t => (
              <li key={t.id} className="flex items-center gap-2 px-1 py-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                <span className={`text-xs whitespace-nowrap ${t.due_date && t.due_date < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile title="Headlines" count={headlines.length} page="HEADLINES">
        {headlines.length === 0 ? <Empty>No headlines yet.</Empty> : (
          <ul className="space-y-2">
            {headlines.slice(-5).reverse().map(h => (
              <li key={h.id} className="flex items-center gap-2 text-sm">
                <Avatar person={peopleById.get(h.owner_id ?? '')} size="sm" /><span className="truncate">{h.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile title="Short-term issues" count={shortTerm.length} page="ISSUES">
        {shortTerm.length === 0 ? <Empty>No open issues.</Empty> : (
          <ul className="space-y-2">
            {shortTerm.slice(0, 6).map(i => (
              <li key={i.id} className="flex items-center gap-2 text-sm">
                <Avatar person={peopleById.get(i.owner_id ?? '')} size="sm" /><span className="truncate">{i.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <Tile title="Weekly KPIs" count={weekly.length} page="METRICS">
        {weekly.length === 0 ? <Empty>No weekly KPIs yet.</Empty> : (
          <ul className="divide-y -mx-1">
            {weekly.map(k => {
              const v = byKey.get(`${k.id}|${thisWeek}`)
              const hit = v != null && k.target != null ? v >= k.target : null
              return (
                <li key={k.id} className="flex items-center gap-2 px-1 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate">{k.name}</span>
                  <span className={`tabular-nums text-xs font-semibold px-2 py-0.5 rounded ${hit === null ? 'bg-gray-100 text-gray-500' : hit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{v ?? '—'}{k.target != null ? ` / ${k.target}` : ''}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Tile>

      <Tile title="Quarterly Priorities" count={goals.filter(g => g.status !== 'done').length} page="GOALS">
        {goals.length === 0 ? <Empty>No priorities yet.</Empty> : (
          <ul className="space-y-2">
            {goals.slice(0, 6).map(g => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{g.title}</span>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${GOAL_STYLE[g.status]}`}>{GOAL_LABEL[g.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      <section className={`${card} p-4`}>
        <h2 className="font-bold text-slate-900 mb-3">Meeting</h2>
        <div className="flex flex-wrap gap-1 mb-3">{attendeeIds.map(id => <Avatar key={id} person={peopleById.get(id)} size="sm" />)}</div>
        {last ? (
          <div className="text-sm text-gray-600">
            Last meeting: {new Date(last.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
            {last.average_rating != null && <span className="inline-flex items-center gap-1 ml-2 font-semibold text-slate-800"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{Number(last.average_rating).toFixed(1)}</span>}
          </div>
        ) : <p className="text-sm text-gray-400">No meetings concluded yet.</p>}
      </section>
    </div>
  )
}

export function GrowthPlan({ goals, kpis, kpiValues, coreValues }: { goals: Goal[]; kpis: Kpi[]; kpiValues: KpiValue[]; coreValues: string[] }) {
  const byKey = useMemo(() => new Map(kpiValues.map(v => [`${v.kpi_id}|${v.period_start}`, v.value])), [kpiValues])
  // Last 4 weeks, oldest first.
  const weeks = useMemo(() => {
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(monday)
      d.setDate(d.getDate() - (3 - i) * 7)
      return { start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}` }
    })
  }, [])
  const weekly = kpis.filter(k => k.cadence === 'weekly')
  const open = goals.filter(g => g.status !== 'done')
  const overall = goals.length ? Math.round(goals.reduce((s, g) => s + progress(g).pct, 0) / goals.length) : 0

  return (
    <div className="space-y-4">
      <section className={`${card} p-5`}>
        <h2 className="font-bold text-lg text-slate-900 mb-3">Core Values</h2>
        {coreValues.length === 0 ? <p className="text-sm text-gray-400">No core values yet. A Meetings admin can add them in Settings.</p> : (
          <ol className="grid sm:grid-cols-2 gap-x-8 gap-y-2 list-decimal list-inside">
            {coreValues.map((v, i) => <li key={i} className="text-slate-800">{v}</li>)}
          </ol>
        )}
      </section>

      <section className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg text-slate-900">Quarterly Priorities <span className="text-gray-400 font-normal text-base">({open.length} open)</span></h2>
          {goals.length > 0 && <span className="text-sm font-semibold text-blue-700">{overall}% overall</span>}
        </div>
        {goals.length === 0 ? <p className="text-sm text-gray-400">No priorities yet.</p> : (
          <ul className="space-y-4">
            {goals.map(g => {
              const p = progress(g)
              return (
                <li key={g.id}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 font-medium truncate">{g.title}</span>
                    {g.due_date && <span className="text-xs text-gray-500">due {g.due_date}</span>}
                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${GOAL_STYLE[g.status]}`}>{GOAL_LABEL[g.status]}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden"><div className={`h-full ${g.status === 'off' ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${p.pct}%` }} /></div>
                    <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{p.total ? `${p.done}/${p.total}` : `${p.pct}%`}</span>
                  </div>
                  {p.total > 0 && (
                    <ul className="mt-1.5 ml-1 flex flex-wrap gap-x-4 gap-y-0.5">
                      {g.milestones.map((m, i) => <li key={i} className={`text-xs ${m.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{m.title}</li>)}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={`${card} p-5 overflow-x-auto`}>
        <h2 className="font-bold text-lg text-slate-900 mb-3">Weekly scorecard</h2>
        {weekly.length === 0 ? <p className="text-sm text-gray-400">No weekly KPIs yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-gray-500">
              <tr><th className="text-left font-semibold py-1">KPI</th><th className="font-semibold">Target</th>{weeks.map(w => <th key={w.start} className="font-semibold px-2">{w.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {weekly.map(k => (
                <tr key={k.id}>
                  <td className="py-2 pr-3">{k.name}</td>
                  <td className="text-center text-gray-600 whitespace-nowrap">{k.target ?? '—'}{k.unit ? ` ${k.unit}` : ''}</td>
                  {weeks.map(w => {
                    const v = byKey.get(`${k.id}|${w.start}`)
                    const hit = v != null && k.target != null ? v >= k.target : null
                    return (
                      <td key={w.start} className="px-2 py-1.5 text-center">
                        <span className={`inline-block min-w-12 tabular-nums text-xs font-semibold px-2 py-1 rounded ${hit === null ? 'bg-gray-100 text-gray-500' : hit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{v ?? '—'}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
