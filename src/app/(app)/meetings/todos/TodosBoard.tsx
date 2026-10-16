'use client'

import { confirmDialog } from '../ui/feedback'
import { useMemo, useState } from 'react'
import { Check, Plus, Trash2, FileText, List, Columns3 } from 'lucide-react'
import { addTodo, setTodoDone, deleteTodo } from '../actions'
import { act } from '../act'
import Avatar from '../Avatar'
import { PersonSelect } from '../PersonPicker'
import TodoBoard, { type BoardTodo } from '../TodoBoard'
import StandaloneDrawer from '../StandaloneDrawer'
import { useLocalPref } from '../usePref'
import { ymd, type Person } from '@/lib/meetings'

type Meeting = { id: string; name: string }

const card = 'border rounded-xl bg-white shadow-sm'
const input = 'border rounded-lg px-3 py-2 text-sm bg-white'

export default function TodosBoard({ todos, meetings, people, myId }: { todos: BoardTodo[]; meetings: Meeting[]; people: Person[]; myId: string }) {
  const [owner, setOwner] = useState<string>(myId)           // user id | 'all'
  const [meetingId, setMeetingId] = useState<string>('all')
  const [status, setStatus] = useState<'active' | 'completed' | 'all'>('active')
  const [view, setView] = useLocalPref('av-todos-view', 'list')
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', meeting_id: meetings[0]?.id ?? '', owner_id: myId, due_date: '' })

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const meetingsById = useMemo(() => new Map(meetings.map(m => [m.id, m.name])), [meetings])
  const today = ymd(new Date())
  const isBoard = view === 'board'

  const scoped = todos
    .filter(t => (owner === 'all' ? true : t.owner_id === owner))
    .filter(t => (meetingId === 'all' ? true : t.meeting_id === meetingId))
  // The board always shows every column; the list can be narrowed by status.
  const shown = isBoard ? scoped : scoped.filter(t => (status === 'all' ? true : status === 'completed' ? !!t.done_at : !t.done_at))
  const doneCount = shown.filter(t => t.done_at).length
  const pct = shown.length ? Math.round((doneCount / shown.length) * 100) : 0
  const open = todos.find(t => t.id === openId)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.meeting_id) return
    const ok = await act(async () => {
      await addTodo(form.meeting_id, { title: form.title, owner_id: form.owner_id, due_date: form.due_date || null })
      return true
    })
    if (ok) setForm({ ...form, title: '', due_date: '' })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm" role="tablist" aria-label="View">
          {([['list', 'List', List], ['board', 'Board', Columns3]] as const).map(([key, label, Icon]) => (
            <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition ${view === key ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <PersonSelect
          people={people.filter(p => p.id !== myId)}
          value={owner}
          onChange={setOwner}
          extra={[{ value: myId, label: 'My to-dos' }, { value: 'all', label: 'Everyone' }]}
          className="w-48"
          ariaLabel="Owner"
        />
        <select value={meetingId} onChange={e => setMeetingId(e.target.value)} className={input} aria-label="Meeting">
          <option value="all">All meetings</option>
          {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {!isBoard && (
          <div className="inline-flex rounded-lg bg-gray-100 p-1 text-sm">
            {(['active', 'completed', 'all'] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 rounded-md font-medium capitalize transition ${status === s ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>{s}</button>
            ))}
          </div>
        )}
        <span className="ml-auto text-sm text-gray-500">{shown.length} to-do{shown.length === 1 ? '' : 's'}{!isBoard && status === 'all' ? ` · ${pct}% completed` : ''}</span>
      </div>

      {isBoard ? (
        <div className="h-[34rem]">
          <TodoBoard todos={shown} meetingNames={meetingsById} peopleById={peopleById} addIn={meetings} onOpen={t => setOpenId(t.id)} />
        </div>
      ) : shown.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">No to-dos match these filters.</div>
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(t => {
            const overdue = !t.done_at && t.due_date && t.due_date < today
            return (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => act(() => setTodoDone(t.meeting_id, t.id, !t.done_at))}
                  aria-label={t.done_at ? 'Mark not done' : 'Mark done'}
                  className={`w-7 h-7 rounded-full border-2 shrink-0 inline-flex items-center justify-center ${t.done_at ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                >
                  {t.done_at && <Check className="w-4 h-4" />}
                </button>
                <Avatar person={peopleById.get(t.owner_id ?? '')} size="sm" />
                <button onClick={() => setOpenId(t.id)} className="flex-1 min-w-0 text-left" title="Open details">
                  <div className={`truncate ${t.done_at ? 'line-through text-gray-500' : ''}`}>{t.title}{t.details && <FileText className="inline-block w-3.5 h-3.5 ml-1.5 text-gray-500 align-[-2px]" />}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide truncate">{meetingsById.get(t.meeting_id)}</div>
                </button>
                <span className={`text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{t.due_date ?? ''}</span>
                <button onClick={async () => { if (await confirmDialog('Delete this to-do?')) { await (act(() => deleteTodo(t.meeting_id, t.id))) } }} aria-label="Delete" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </li>
            )
          })}
        </ul>
      )}

      {meetings.length > 0 && (
        <form onSubmit={add} className={`${card} p-2 mt-3 grid gap-1.5 md:grid-cols-[1fr_12rem_10rem_auto_auto]`}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a to-do" className={input} />
          <select value={form.meeting_id} onChange={e => setForm({ ...form, meeting_id: e.target.value })} className={input} aria-label="Meeting">
            {meetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <PersonSelect people={people} value={form.owner_id} onChange={id => setForm({ ...form, owner_id: id })} ariaLabel="Owner" />
          <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" title="Defaults to 7 days from today" />
          <button className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
        </form>
      )}

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
