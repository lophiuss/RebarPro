'use client'

import { confirmDialog } from '../ui/feedback'
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { addGoal, setGoalStatus, toggleGoalMilestone, deleteGoal } from '../actions'
import { useMeeting, useRun } from './context'
import ItemDrawer from './ItemDrawer'
import Avatar from '../Avatar'
import {
  card, input, primaryBtn, Empty, OwnerSelect, ItemTitle, SortSelect, sortByOwner, SectionTitle,
  type Goal, type OtherMeetings, type SortKey,
} from './shared'

const GOAL_STATUS_STYLE: Record<string, string> = {
  on: 'bg-green-100 text-green-700',
  off: 'bg-red-100 text-red-700',
  done: 'bg-blue-100 text-blue-700',
}

export function Goals({ goals, otherMeetings }: { goals: Goal[]; otherMeetings: OtherMeetings }) {
  const { meetingId, myId, peopleById } = useMeeting()
  const run = useRun()
  const [expand, setExpand] = useState(false)
  const [mine, setMine] = useState(false)
  const [form, setForm] = useState({ title: '', owner_id: myId, due_date: '', milestones: '' })
  const [sort, setSort] = useState<SortKey>('default')
  const [openId, setOpenId] = useState<string | null>(null)
  const open = goals.find(g => g.id === openId)
  const filtered = goals.filter(g => !mine || g.owner_id === myId)
  const shown = sort === 'owner' ? sortByOwner(filtered, peopleById) : filtered

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    await run(() => addGoal(meetingId, {
      title: form.title, owner_id: form.owner_id, due_date: form.due_date || null,
      milestones: form.milestones.split('\n'),
    }))
    setForm({ ...form, title: '', due_date: '', milestones: '' })
  }

  return (
    <div>
      <SectionTitle right={
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <SortSelect value={sort} onChange={setSort} />
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Mine only</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={expand} onChange={e => setExpand(e.target.checked)} /> Expand milestones</label>
        </div>
      }>Quarterly Priorities <span className="text-gray-500 font-normal text-base">({shown.length})</span></SectionTitle>

      {shown.length === 0 ? (
        <Empty title="Your quarterly priorities live here" hint="Set the few projects that matter most this quarter." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(g => {
            const total = g.milestones.length
            const done = g.milestones.filter(m => m.done).length
            return (
              <li key={g.id} className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar person={peopleById.get(g.owner_id ?? '')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex"><ItemTitle title={g.title} hasDetails={!!g.details} onOpen={() => setOpenId(g.id)} /></div>
                    <div className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                      {g.due_date && <span>Due {g.due_date}</span>}
                      {total > 0 && <span>{done}/{total} milestones</span>}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="hidden sm:block w-28 h-1.5 rounded-full bg-gray-200 overflow-hidden" aria-hidden>
                      <div className="h-full bg-blue-600" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                    </div>
                  )}
                  <select
                    value={g.status}
                    onChange={e => run(() => setGoalStatus(meetingId, g.id, e.target.value as 'on' | 'off' | 'done'))}
                    className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 ${GOAL_STATUS_STYLE[g.status]}`}
                    aria-label="Status"
                  >
                    <option value="on">On track</option>
                    <option value="off">Off track</option>
                    <option value="done">Done</option>
                  </select>
                  <button onClick={async () => { if (await confirmDialog('Delete this priority?')) { await (run(() => deleteGoal(meetingId, g.id))) } }} aria-label="Delete" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                {(expand && g.milestones.length > 0) && (
                  <ul className="mt-2 ml-11 space-y-1">
                    {g.milestones.map((m, i) => (
                      <li key={i}>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={m.done} onChange={() => run(() => toggleGoalMilestone(meetingId, g.id, i))} />
                          <span className={m.done ? 'line-through text-gray-500' : ''}>{m.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className={`${card} p-2 mt-3 grid gap-1.5 md:grid-cols-[1fr_auto_auto_auto]`}>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a quarterly priority" className={input} />
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" />
        <button className={primaryBtn}><Plus className="w-4 h-4" /> Add</button>
        <textarea value={form.milestones} onChange={e => setForm({ ...form, milestones: e.target.value })} placeholder="Milestones, one per line (optional)" rows={2} className={`${input} md:col-span-4`} />
      </form>

      {open && (
        <ItemDrawer
          key={open.id}
          kind="goal"
          item={{ ...open, goal_status: open.status }}
          otherMeetings={otherMeetings}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
