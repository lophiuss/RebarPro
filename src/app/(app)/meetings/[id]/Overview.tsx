'use client'

import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
import { useMeeting } from './context'
import Avatar from '../Avatar'
import TileGrid, { type TileDef, type TileDefaults } from '../TileGrid'
import TodoBoard from '../TodoBoard'
import ItemDrawer, { type DrawerItem, type DrawerKind } from './ItemDrawer'
import {
  TodosBody, KpisBody, GoalsBody, CoreValuesBody, HeadlinesBody, IssuesBody, CalendarBody,
  type WTodo, type WGoal, type WKpi, type WIssue, type WHeadline, type Schedule,
} from '../WorkspaceBodies'
import { ymd, evaluateGoal, formatGoal, formatKpiValue } from '@/lib/meetings'
import { card, effectiveGoal, kpiBaseGoal, type Headline, type Todo, type Issue, type Goal, type Kpi, type KpiValue, type KpiCustomGoal, type OtherMeetings } from './shared'
import type { SummaryRow } from './SummaryArchive'

const DEFAULTS: TileDefaults = {
  order: ['calendar', 'todos', 'issues', 'kpis', 'goals', 'headlines', 'board', 'info', 'values'],
  size: {
    calendar: { w: 6, h: 660 }, todos: { w: 6, h: 440 }, issues: { w: 4, h: 340 }, kpis: { w: 8, h: 340 },
    goals: { w: 6, h: 340 }, headlines: { w: 6, h: 340 }, board: { w: 12, h: 520 }, info: { w: 4, h: 260 }, values: { w: 4, h: 260 },
  },
  hidden: ['board', 'values'],
}

// A meeting's Workspace tab: the same panel grid as My Workspace (move, resize,
// remove, add, lock), showing this meeting's own to-dos, issues, KPIs and more.
export function MeetingWorkspace({
  meetingName, schedule, layout, headlines, todos, issues, goals, kpis, kpiValues, kpiGoals, summaries, coreValues, otherMeetings,
}: {
  meetingName: string; schedule: Schedule | null; layout: unknown
  headlines: Headline[]; todos: Todo[]; issues: Issue[]; goals: Goal[]; kpis: Kpi[]; kpiValues: KpiValue[]; kpiGoals: KpiCustomGoal[]
  summaries: SummaryRow[]; coreValues: string[]; otherMeetings: OtherMeetings
}) {
  const { meetingId, peopleById, attendeeIds } = useMeeting()
  const [open, setOpen] = useState<{ kind: DrawerKind; id: string } | null>(null)

  const wTodos: WTodo[] = useMemo(() => todos.map(t => ({ ...t, meeting_id: meetingId })), [todos, meetingId])
  const wGoals: WGoal[] = useMemo(() => goals.map(g => ({ ...g, meeting_id: meetingId, meeting: { name: meetingName } })), [goals, meetingId, meetingName])
  const wKpis: WKpi[] = useMemo(() => kpis.map(k => ({ ...k, meeting_id: meetingId, meeting: null })), [kpis, meetingId])
  const wIssues: WIssue[] = useMemo(() => issues.map(i => ({ ...i, meeting_id: meetingId })), [issues, meetingId])
  const wHeadlines: WHeadline[] = headlines
  const meetingNames = useMemo(() => new Map([[meetingId, meetingName]]), [meetingId, meetingName])
  const last = summaries[0]

  const calItems = useMemo(() => [
    ...todos.filter(t => t.due_date).map(t => ({ id: t.id, kind: 'todo' as const, title: t.title, date: t.due_date as string, done: !!t.done_at, meeting_id: meetingId })),
    ...issues.filter(i => i.due_date && i.status !== 'solved').map(i => ({ id: i.id, kind: 'issue' as const, title: i.title, date: i.due_date as string, done: false, meeting_id: meetingId })),
  ], [todos, issues, meetingId])
  const calHeld = useMemo(() => summaries.map(s => ({
    meeting_id: meetingId, name: meetingName,
    date: new Date(s.snapshot?.ended_at ?? s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }),
  })), [summaries, meetingId, meetingName])

  const tiles: TileDef[] = [
    { id: 'calendar', title: 'Calendar', node: <CalendarBody meetings={[{ id: meetingId, name: meetingName, schedule }]} held={calHeld} items={calItems} onOpenItem={i => setOpen({ kind: i.kind, id: i.id })} /> },
    { id: 'todos', title: 'To-dos', count: todos.filter(t => !t.done_at).length, node: <TodosBody todos={wTodos} meetings={[{ id: meetingId, name: meetingName }]} onOpen={t => setOpen({ kind: 'todo', id: t.id })} /> },
    { id: 'issues', title: 'Issues', count: issues.filter(i => i.status === 'short_term' || i.status === 'parking_lot').length, node: <IssuesBody issues={wIssues} peopleById={peopleById} onOpen={i => setOpen({ kind: 'issue', id: i.id })} /> },
    { id: 'kpis', title: 'KPIs', count: kpis.length, node: <KpisBody kpis={wKpis} values={kpiValues} custom={kpiGoals} emptyText="No KPIs in this meeting yet." /> },
    { id: 'goals', title: 'Quarterly Priorities', count: goals.filter(g => g.status !== 'done').length, node: <GoalsBody goals={wGoals} onOpen={g => setOpen({ kind: 'goal', id: g.id })} emptyText="No priorities yet." /> },
    { id: 'headlines', title: 'Headlines', count: headlines.length, node: <HeadlinesBody headlines={wHeadlines} peopleById={peopleById} onOpen={h => setOpen({ kind: 'headline', id: h.id })} /> },
    { id: 'board', title: 'To-do board', count: todos.filter(t => !t.done_at).length, node: <TodoBoard todos={wTodos} meetingNames={meetingNames} peopleById={peopleById} addIn={[{ id: meetingId, name: meetingName }]} onOpen={t => setOpen({ kind: 'todo', id: t.id })} /> },
    {
      id: 'info', title: 'Meeting', node: (
        <div>
          <div className="flex flex-wrap gap-1 mb-3">{attendeeIds.map(id => <Avatar key={id} person={peopleById.get(id)} size="sm" />)}</div>
          {last ? (
            <div className="text-sm text-gray-600">
              Last meeting: {new Date(last.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
              {last.average_rating != null && <span className="inline-flex items-center gap-1 ml-2 font-semibold text-slate-800"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />{Number(last.average_rating).toFixed(1)}</span>}
            </div>
          ) : <p className="text-sm text-gray-400">No meetings concluded yet.</p>}
          {schedule && schedule.days.length > 0 && <p className="text-xs text-gray-500 mt-2">Scheduled {schedule.every > 1 ? `every ${schedule.every} weeks` : 'weekly'} on {schedule.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}{schedule.time ? ` at ${schedule.time}` : ''}.</p>}
        </div>
      ),
    },
    { id: 'values', title: 'Core Values', node: <CoreValuesBody values={coreValues} /> },
  ]

  const find = <T extends { id: string }>(list: T[], id: string) => list.find(x => x.id === id)
  let drawer: { kind: DrawerKind; item: DrawerItem } | null = null
  if (open?.kind === 'todo') { const t = find(todos, open.id); if (t) drawer = { kind: 'todo', item: { ...t, todo_status: t.status } } }
  else if (open?.kind === 'issue') { const i = find(issues, open.id); if (i) drawer = { kind: 'issue', item: { ...i, issue_status: i.status } } }
  else if (open?.kind === 'goal') { const g = find(goals, open.id); if (g) drawer = { kind: 'goal', item: { ...g, goal_status: g.status } } }
  else if (open?.kind === 'headline') { const h = find(headlines, open.id); if (h) drawer = { kind: 'headline', item: h } }

  return (
    <div>
      <TileGrid tiles={tiles} prefKey={`meeting.ws.${meetingId}`} savedLayout={layout} defaults={DEFAULTS} />
      {drawer && <ItemDrawer key={drawer.item.id} kind={drawer.kind} item={drawer.item} otherMeetings={otherMeetings} onClose={() => setOpen(null)} />}
    </div>
  )
}

const GOAL_STYLE: Record<string, string> = { on: 'bg-green-100 text-green-700', off: 'bg-red-100 text-red-700', done: 'bg-blue-100 text-blue-700' }
const GOAL_LABEL: Record<string, string> = { on: 'On track', off: 'Off track', done: 'Done' }

function progress(g: Goal) {
  const total = g.milestones.length
  const done = g.milestones.filter(m => m.done).length
  return { total, done, pct: total ? Math.round((done / total) * 100) : g.status === 'done' ? 100 : 0 }
}

export function GrowthPlan({ goals, kpis, kpiValues, kpiGoals, coreValues }: { goals: Goal[]; kpis: Kpi[]; kpiValues: KpiValue[]; kpiGoals: KpiCustomGoal[]; coreValues: string[] }) {
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
              <tr className="text-[11px] uppercase tracking-wide"><th className="text-left font-semibold py-1">KPI</th><th className="font-semibold">Goal</th>{weeks.map(w => <th key={w.start} className="font-semibold px-2">{w.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {weekly.map(k => (
                <tr key={k.id}>
                  <td className="py-2 pr-3">{k.name}</td>
                  <td className="text-center text-gray-600 whitespace-nowrap">{formatGoal(kpiBaseGoal(k), k.unit_type)}</td>
                  {weeks.map(w => {
                    const v = byKey.get(`${k.id}|${w.start}`)
                    const hit = evaluateGoal(effectiveGoal(k, w.start, kpiGoals), v)
                    return (
                      <td key={w.start} className="px-2 py-1.5 text-center">
                        <span className={`inline-block min-w-12 tabular-nums text-xs font-semibold px-2 py-1 rounded ${hit === null ? 'bg-gray-100 text-gray-500' : hit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{formatKpiValue(v, k.unit_type)}</span>
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
