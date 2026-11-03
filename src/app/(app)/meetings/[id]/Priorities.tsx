'use client'

import { confirmDialog } from '../ui/feedback'
import { useState } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import { addGoal, setGoalStatus, toggleGoalMilestone, deleteGoal } from '../actions'
import { useMeeting, useRun } from './context'
import ItemDrawer from './ItemDrawer'
import Avatar from '../Avatar'
import {
  card, input, primaryBtn, Empty, OwnerSelect, SortSelect, sortByOwner, sortNewest, SectionTitle,
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
  const [sort, setSort] = useState<SortKey>('owner')
  const [openId, setOpenId] = useState<string | null>(null)
  const open = goals.find(g => g.id === openId)
  const filtered = goals.filter(g => !mine || g.owner_id === myId)
  const shown = sort === 'owner' ? sortByOwner(filtered, peopleById) : sort === 'newest' ? sortNewest(filtered) : filtered

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
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm">
          <SortSelect value={sort} onChange={setSort} />
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Mine only</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={expand} onChange={e => setExpand(e.target.checked)} /> Expand milestones</label>
        </div>
      }>Quarterly Priorities <span className="text-gray-500 font-normal text-base">({shown.length})</span></SectionTitle>

      <form onSubmit={add} className={`${card} p-2.5 mb-3 grid gap-1.5 md:grid-cols-[auto_1fr_auto_auto]`}>
        <OwnerSelect value={form.owner_id} onChange={v => setForm({ ...form, owner_id: v })} />
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Add a quarterly priority" className={input} />
        <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className={input} aria-label="Due date" />
        <button className={primaryBtn}><Plus className="w-4 h-4" /> Add</button>
        <textarea value={form.milestones} onChange={e => setForm({ ...form, milestones: e.target.value })} placeholder="Milestones, one per line (optional)" rows={2} className={`${input} md:col-span-4`} />
      </form>

      {shown.length === 0 ? (
        <Empty title="Your quarterly priorities live here" hint="Set the few projects that matter most this quarter." />
      ) : (
        <ul className={`${card} divide-y`}>
          {shown.map(g => {
            const total = g.milestones.length
            const done = g.milestones.filter(m => m.done).length
            return (
              <li key={g.id} className="p-2.5 sm:p-3">
                <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
                  <div className="shrink-0 pt-0.5 sm:pt-0">
                    <Avatar person={peopleById.get(g.owner_id ?? '')} size="sm" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(g.id)}
                        title="Open details"
                        className="text-left font-medium text-slate-900 hover:text-blue-700 text-xs sm:text-sm break-words line-clamp-3 sm:line-clamp-none flex-1 min-w-0"
                      >
                        {g.title}
                        {g.details && <FileText className="inline-block w-3.5 h-3.5 ml-1 text-gray-400 align-[-2px]" aria-label="Has details" />}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center">
                        <select
                          value={g.status}
                          onChange={e => run(() => setGoalStatus(meetingId, g.id, e.target.value as 'on' | 'off' | 'done'))}
                          className={`text-[11px] sm:text-xs font-semibold rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1 border-0 cursor-pointer ${GOAL_STATUS_STYLE[g.status]}`}
                          aria-label="Status"
                        >
                          <option value="on">On track</option>
                          <option value="off">Off track</option>
                          <option value="done">Done</option>
                        </select>
                        <button
                          onClick={async () => { if (await confirmDialog('Delete this priority?')) { await (run(() => deleteGoal(meetingId, g.id))) } }}
                          aria-label="Delete"
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {g.due_date && <span>Due {g.due_date}</span>}
                      {total > 0 && <span>{done}/{total} milestones</span>}
                      {total > 0 && (
                        <div className="w-16 sm:w-28 h-1.5 rounded-full bg-gray-200 overflow-hidden inline-block align-middle" aria-hidden>
                          <div className="h-full bg-blue-600" style={{ width: `${Math.round((done / total) * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {(expand && g.milestones.length > 0) && (
                  <ul className="mt-2 ml-7 sm:ml-11 space-y-1">
                    {g.milestones.map((m, i) => (
                      <li key={i}>
                        <label className="flex items-start gap-2 text-xs sm:text-sm cursor-pointer">
                          <input type="checkbox" checked={m.done} onChange={() => run(() => toggleGoalMilestone(meetingId, g.id, i))} className="mt-0.5" />
                          <span className={`${m.done ? 'line-through text-gray-400' : 'text-slate-700'} break-words`}>{m.title}</span>
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
