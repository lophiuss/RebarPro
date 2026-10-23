'use client'

import { useMemo, useState } from 'react'
import { PersonSelect } from '../PersonPicker'
import TodoBoard, { PERSONAL_ID, type BoardTodo } from '../TodoBoard'
import StandaloneDrawer from '../StandaloneDrawer'
import type { Person, TodoStatus } from '@/lib/meetings'

type Meeting = { id: string; name: string }
export type PersonalTodo = { id: string; title: string; due_date: string | null; done_at: string | null; status: TodoStatus; created_at: string }

const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

// The To-dos page is the same kanban board as My Workspace: meeting to-dos and your personal ones side by side,
// drag between columns, "+" on a column to add (to a meeting or as a personal to-do).
export default function TodosBoard({ todos, personal, meetings, people, myId }: { todos: BoardTodo[]; personal: PersonalTodo[]; meetings: Meeting[]; people: Person[]; myId: string }) {
  const [owner, setOwner] = useState<string>(myId)           // user id | 'all'
  const [meetingId, setMeetingId] = useState<string>('all')  // meeting id | 'all' | PERSONAL_ID
  const [openId, setOpenId] = useState<string | null>(null)

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const meetingsById = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])

  const all: BoardTodo[] = [
    ...todos,
    ...personal.map(p => ({ id: p.id, title: p.title, details: null, owner_id: myId, due_date: p.due_date, done_at: p.done_at, status: p.status, meeting_id: PERSONAL_ID, created_at: p.created_at, personal: true })),
  ]
  const shown = all
    .filter(t => (owner === 'all' ? true : t.owner_id === owner))
    .filter(t => (meetingId === 'all' ? true : t.meeting_id === meetingId))
  const open = todos.find(t => t.id === openId)

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-3">
        <PersonSelect
          people={people.filter(p => p.id !== myId)}
          value={owner}
          onChange={setOwner}
          extra={[{ value: myId, label: 'My to-dos' }, { value: 'all', label: 'Everyone' }]}
          className="w-48"
          ariaLabel="Owner"
        />
        <select value={meetingId} onChange={e => setMeetingId(e.target.value)} className={input} aria-label="Meeting">
          <option value="all">All meetings + personal</option>
          <option value={PERSONAL_ID}>Personal only</option>
          {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500">{shown.filter(t => !t.done_at).length} open · {shown.length} total</span>
      </div>

      <div className="h-[calc(100vh-13rem)] min-h-[28rem]">
        <TodoBoard
          todos={shown}
          meetingNames={meetingsById}
          peopleById={peopleById}
          addIn={[{ id: PERSONAL_ID, name: 'Personal (only me, no meeting)' }, ...meetings]}
          onOpen={t => { if (!t.personal) setOpenId(t.id) }}
        />
      </div>

      {open && (
        <StandaloneDrawer
          kind="todo"
          item={{ ...open, todo_status: open.done_at ? 'done' : open.status }}
          meetingId={open.meeting_id}
          meetings={meetings}
          people={people}
          myId={myId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
