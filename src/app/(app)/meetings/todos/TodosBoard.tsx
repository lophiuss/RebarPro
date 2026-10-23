'use client'

import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { TODO_COLUMNS } from '@/lib/meetings'
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

  // A printable list of exactly what the filters show, grouped by person, in a new window.
  function printList() {
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const colLabel = Object.fromEntries(TODO_COLUMNS.map(c => [c.key, c.label]))
    const today = new Date().toISOString().slice(0, 10)
    const nameOf = (id: string | null) => (id ? peopleById.get(id)?.full_name ?? 'Unknown' : 'No owner')
    const groups = new Map<string, BoardTodo[]>()
    for (const t of shown) { const k = nameOf(t.owner_id); groups.set(k, [...(groups.get(k) ?? []), t]) }
    const order = ['todo', 'in_progress', 'blocked', 'done']
    const sections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([who, items]) => {
      const rows = items
        .sort((a, b) => order.indexOf(a.done_at ? 'done' : a.status) - order.indexOf(b.done_at ? 'done' : b.status) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
        .map(t => {
          const st = t.done_at ? 'done' : t.status
          const overdue = st !== 'done' && t.due_date && t.due_date < today
          return `<tr${st === 'done' ? ' class="done"' : ''}><td class="box">${st === 'done' ? '&#10003;' : ''}</td><td>${esc(t.title)}</td><td>${esc(t.personal ? 'Personal' : meetingsById.get(t.meeting_id) ?? '')}</td><td>${esc(colLabel[st] ?? st)}</td><td${overdue ? ' class="late"' : ''}>${esc(t.due_date ?? '')}</td></tr>`
        }).join('')
      return `<h2>${esc(who)} <span>(${items.filter(t => !t.done_at).length} open of ${items.length})</span></h2><table><thead><tr><th></th><th>To-do</th><th>Meeting</th><th>Status</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table>`
    }).join('')
    const filter = `${owner === 'all' ? 'Everyone' : nameOf(owner)} · ${meetingId === 'all' ? 'All meetings + personal' : meetingId === PERSONAL_ID ? 'Personal only' : meetingsById.get(meetingId) ?? ''}`
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>To-dos ${today}</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
      h1{font-size:18px;margin:0 0 2px} .sub{color:#555;margin-bottom:14px}
      h2{font-size:14px;margin:18px 0 6px;border-bottom:2px solid #1e3a8a;padding-bottom:3px} h2 span{font-weight:normal;color:#555;font-size:12px}
      table{width:100%;border-collapse:collapse} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}
      th{background:#f1f5f9;font-size:11px;text-transform:uppercase} td.box{width:16px;text-align:center}
      tr.done td{color:#888;text-decoration:line-through} td.late{color:#b91c1c;font-weight:bold}
      @media print{body{margin:10mm} h2{break-after:avoid} tr{break-inside:avoid}}
    </style></head><body><h1>To-dos</h1><div class="sub">${esc(filter)} · printed ${today} · ${shown.filter(t => !t.done_at).length} open, ${shown.length} total</div>${sections || '<p>No to-dos match these filters.</p>'}</body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Allow pop-ups for this site to print.'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

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
        <button onClick={printList} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50"><Printer className="w-4 h-4" /> Print list</button>
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
