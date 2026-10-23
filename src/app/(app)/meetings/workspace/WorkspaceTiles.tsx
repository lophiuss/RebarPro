'use client'

import { useMemo, useState } from 'react'
import StandaloneDrawer from '../StandaloneDrawer'
import TodoBoard, { PERSONAL_ID, type BoardTodo } from '../TodoBoard'
import TileGrid, { type TileDef, type TileDefaults } from '../TileGrid'
import {
  TodosBody, PersonalTodosBody, KpisBody, GoalsBody, CoreValuesBody, NotesBody, IssuesBody, CalendarBody,
  type WTodo, type WPersonalTodo, type WGoal, type WKpi, type WNote, type WMeeting, type WIssue, type CalMeeting, type CalHeld, type CalItem,
} from '../WorkspaceBodies'
import type { DrawerItem, DrawerKind } from '../[id]/ItemDrawer'
import type { KpiCustomGoal, KpiValue } from '../[id]/shared'
import type { Person } from '@/lib/meetings'

const DEFAULTS: TileDefaults = {
  order: ['calendar', 'todos', 'personal', 'goals', 'kpis', 'board', 'issues', 'values', 'notes'],
  size: {
    calendar: { w: 6, h: 660 }, todos: { w: 6, h: 660 }, personal: { w: 6, h: 400 }, goals: { w: 6, h: 400 }, kpis: { w: 6, h: 400 },
    board: { w: 12, h: 540 }, issues: { w: 6, h: 360 }, values: { w: 3, h: 360 }, notes: { w: 3, h: 360 },
  },
}

export default function WorkspaceTiles({
  myId, meetings, allMeetings, people, todos, goals, issues, kpis, kpiValues, kpiGoals, coreValues, notes, savedLayout,
  calMeetings, calHeld, calItems, personalTodos,
}: {
  myId: string; meetings: WMeeting[]; allMeetings: WMeeting[]; people: Person[]
  todos: WTodo[]; goals: WGoal[]; issues: WIssue[]; kpis: WKpi[]; kpiValues: KpiValue[]; kpiGoals: KpiCustomGoal[]
  coreValues: string[]; notes: WNote[]; savedLayout: unknown
  calMeetings: CalMeeting[]; calHeld: CalHeld[]; calItems: CalItem[]; personalTodos: WPersonalTodo[]
}) {
  const [open, setOpen] = useState<{ kind: DrawerKind; id: string } | null>(null)
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const meetingNames = useMemo(() => new Map(allMeetings.map(m => [m.id, m.name])), [allMeetings])

  const openTodo = open?.kind === 'todo' ? todos.find(t => t.id === open.id) : undefined
  const openGoal = open?.kind === 'goal' ? goals.find(g => g.id === open.id) : undefined
  const openIssue = open?.kind === 'issue' ? issues.find(i => i.id === open.id) : undefined
  const drawer: { kind: DrawerKind; item: DrawerItem; meetingId: string } | null =
    openTodo ? { kind: 'todo', meetingId: openTodo.meeting_id, item: { ...openTodo, todo_status: openTodo.done_at ? 'done' : openTodo.status } }
    : openGoal ? { kind: 'goal', meetingId: openGoal.meeting_id, item: { ...openGoal, goal_status: openGoal.status } }
    : openIssue ? { kind: 'issue', meetingId: openIssue.meeting_id, item: { ...openIssue, issue_status: openIssue.status } }
    : null

  // Personal to-dos sit on the board beside the meeting ones
  const boardTodos: BoardTodo[] = [
    ...todos,
    ...personalTodos.map(p => ({ id: p.id, title: p.title, details: null, owner_id: myId, due_date: p.due_date, done_at: p.done_at, status: p.status, meeting_id: PERSONAL_ID, created_at: p.created_at ?? '', personal: true })),
  ]

  const tiles: TileDef[] = [
    { id: 'calendar', title: 'Calendar', node: <CalendarBody meetings={calMeetings} held={calHeld} items={calItems} onOpenItem={i => setOpen({ kind: i.kind, id: i.id })} /> },
    { id: 'todos', title: 'To-dos', count: todos.filter(t => !t.done_at).length + personalTodos.filter(t => !t.done_at).length, node: <TodosBody todos={todos} meetings={meetings} personal={personalTodos} onOpen={t => setOpen({ kind: 'todo', id: t.id })} /> },
    { id: 'personal', title: 'Personal to-dos', count: personalTodos.filter(t => !t.done_at).length, node: <PersonalTodosBody todos={personalTodos} /> },
    { id: 'goals', title: 'Quarterly Priorities', count: goals.filter(g => g.status !== 'done').length, node: <GoalsBody goals={goals} onOpen={g => setOpen({ kind: 'goal', id: g.id })} /> },
    { id: 'kpis', title: 'My KPIs', count: kpis.length, node: <KpisBody kpis={kpis} values={kpiValues} custom={kpiGoals} emptyText="No KPIs are assigned to you. A KPI shows here when you are its owner." /> },
    { id: 'board', title: 'To-do board', count: boardTodos.filter(t => !t.done_at).length, node: <TodoBoard todos={boardTodos} meetingNames={meetingNames} peopleById={peopleById} addIn={[{ id: PERSONAL_ID, name: 'Personal (only me, no meeting)' }, ...meetings]} onOpen={t => { if (!t.personal) setOpen({ kind: 'todo', id: t.id }) }} /> },
    { id: 'issues', title: 'My issues', count: issues.filter(i => i.status === 'short_term' || i.status === 'parking_lot').length, node: <IssuesBody issues={issues} peopleById={peopleById} onOpen={i => setOpen({ kind: 'issue', id: i.id })} /> },
    { id: 'values', title: 'Core Values', node: <CoreValuesBody values={coreValues} /> },
    { id: 'notes', title: 'Private Notes', count: notes.length, node: <NotesBody notes={notes} /> },
  ]

  return (
    <div>
      <TileGrid tiles={tiles} prefKey="workspace.layout.v2" savedLayout={savedLayout} defaults={DEFAULTS} />
      {drawer && (
        <StandaloneDrawer
          kind={drawer.kind}
          item={drawer.item}
          meetingId={drawer.meetingId}
          meetings={allMeetings}
          people={people}
          myId={myId}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
