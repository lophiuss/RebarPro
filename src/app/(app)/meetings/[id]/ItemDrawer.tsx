'use client'

import { notify, confirmDialog } from '../ui/feedback'
import { useEffect, useState } from 'react'
import { X, Trash2, Archive, ArrowUpRight, Check, Copy, ListChecks, AlertCircle, Plus } from 'lucide-react'
import {
  updateTodo, updateHeadline, updateIssue, updateGoal,
  setTodoDone, setTodoStatus, setIssueStatus, setGoalStatus, setGoalMilestones,
  deleteTodo, deleteHeadline, deleteIssue, deleteGoal,
  moveItem, copyItem, escalateItem, archiveItem,
} from '../actions'
import { useMeeting, useRun } from './context'
import { PersonSelect } from '../PersonPicker'
import { RichEditor } from '../RichText'
import { ISSUE_STATUS_LABEL, TODO_COLUMNS, type IssueStatus, type TodoStatus } from '@/lib/meetings'

export type DrawerKind = 'todo' | 'headline' | 'issue' | 'goal'
export type DrawerItem = {
  id: string
  title: string
  details: string | null
  owner_id: string | null
  created_at?: string
  due_date?: string | null
  done_at?: string | null
  todo_status?: TodoStatus
  issue_status?: IssueStatus
  goal_status?: 'on' | 'off' | 'done'
  milestones?: { title: string; done: boolean }[]
}

const LABEL: Record<DrawerKind, string> = { todo: 'To-do', headline: 'Headline', issue: 'Issue', goal: 'Quarterly priority' }
const field = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'
const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5'

// Side panel opened by clicking a to-do, headline, issue or quarterly priority.
// Edits save as you go (text on blur, pickers on change), like Bloom's panel.
export default function ItemDrawer({
  kind, item, otherMeetings, onClose, onCreateFrom,
}: {
  kind: DrawerKind; item: DrawerItem; otherMeetings: { id: string; name: string }[]; onClose: () => void
  // Headlines only: open the "new to-do / issue" draft pre-filled from this headline.
  onCreateFrom?: (to: 'todo' | 'issue') => void
}) {
  const { meetingId, people, run: liveRun } = useMeeting()
  const run = useRun()
  const [title, setTitle] = useState(item.title)
  const [saved, setSaved] = useState(false)
  const [target, setTarget] = useState({ copy: '', escalate: '' })
  const [milestones, setMilestones] = useState(item.milestones ?? [])
  const [newMilestone, setNewMilestone] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (patch: { title?: string; details?: string | null; owner_id?: string | null; due_date?: string | null }) =>
    kind === 'todo' ? updateTodo(meetingId, item.id, patch)
    : kind === 'headline' ? updateHeadline(meetingId, item.id, patch)
    : kind === 'issue' ? updateIssue(meetingId, item.id, patch)
    : updateGoal(meetingId, item.id, patch)

  async function save(patch: Parameters<typeof update>[0]) {
    setSaved(false)
    const ok = await run(async () => { await update(patch); return true })
    if (ok) setSaved(true)
  }

  async function saveMilestones(next: { title: string; done: boolean }[]) {
    setMilestones(next)
    setSaved(false)
    const ok = await run(async () => { await setGoalMilestones(meetingId, item.id, next); return true })
    if (ok) setSaved(true)
  }

  const nameOf = (id: string) => otherMeetings.find(m => m.id === id)?.name ?? 'that meeting'
  const lower = LABEL[kind].toLowerCase()

  async function doMove(toId: string) {
    if (!(await confirmDialog(`Move this ${lower} to ${nameOf(toId)}? It will leave this meeting.`))) return
    const ok = await run(async () => { await moveItem(kind, item.id, meetingId, toId); return true })
    if (ok) onClose()
  }

  async function doCopy() {
    if (!target.copy || !(await confirmDialog(`Copy this ${lower} to ${nameOf(target.copy)}? The original stays here.`))) return
    const ok = await run(async () => { await copyItem(kind, item.id, meetingId, target.copy); return true })
    if (ok) { setTarget(t => ({ ...t, copy: '' })); notify(`Copied to ${nameOf(target.copy)}.`, 'success') }
  }

  async function doEscalate() {
    if (!target.escalate) return
    const msg = kind === 'issue'
      ? `Send this issue to ${nameOf(target.escalate)}? It will show as Sent here.`
      : `Raise this ${lower} as a new issue in ${nameOf(target.escalate)}?`
    if (!(await confirmDialog(msg))) return
    const ok = await run(async () => { await escalateItem(kind, item.id, meetingId, target.escalate); return true })
    if (ok) { setTarget(t => ({ ...t, escalate: '' })); if (kind === 'issue') onClose() }
  }

  async function doDelete() {
    if (!(await confirmDialog(`Delete this ${lower}? This cannot be undone.`))) return
    const ok = await run(async () => {
      if (kind === 'todo') await deleteTodo(meetingId, item.id)
      else if (kind === 'headline') await deleteHeadline(meetingId, item.id)
      else if (kind === 'issue') await deleteIssue(meetingId, item.id)
      else await deleteGoal(meetingId, item.id)
      return true
    })
    if (ok) onClose()
  }

  async function doArchive() {
    if (kind !== 'todo' && kind !== 'headline') return
    const ok = await run(async () => { await archiveItem(kind, item.id, meetingId); return true })
    if (ok) onClose()
  }

  const hasDue = kind === 'todo' || kind === 'goal' || kind === 'issue'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 no-print" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[34rem] bg-white shadow-2xl flex flex-col no-print" role="dialog" aria-label={`Edit ${LABEL[kind]}`}>
        <header className="flex items-center gap-3 px-5 py-4 border-b">
          <h2 className="font-bold text-lg flex-1">Edit {LABEL[kind]}</h2>
          {saved && <span className="text-xs text-green-700 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Changes saved</span>}
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {kind === 'todo' && (
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" checked={!!item.done_at} onChange={e => run(() => setTodoDone(meetingId, item.id, e.target.checked))} /> Complete
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">Board status
                <select value={item.todo_status ?? 'todo'} onChange={e => run(() => setTodoStatus(meetingId, item.id, e.target.value as TodoStatus))} className="border rounded-lg px-2 py-1.5 text-sm bg-white font-normal">
                  {TODO_COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </label>
            </div>
          )}

          <div>
            <div className={sectionTitle}>{LABEL[kind]}</div>
            <input
              value={title}
              onChange={e => { setTitle(e.target.value); setSaved(false) }}
              onBlur={() => { if (title.trim() && title.trim() !== item.title) save({ title }); else if (!title.trim()) setTitle(item.title) }}
              className={field}
              aria-label="Title"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {hasDue && (
              <div>
                <div className={sectionTitle}>Due date</div>
                <input
                  key={item.due_date ?? 'none'}
                  type="date"
                  defaultValue={item.due_date ?? ''}
                  onChange={e => save({ due_date: e.target.value || null })}
                  className={field}
                  aria-label="Due date"
                />
              </div>
            )}
            {kind === 'issue' && (
              <div>
                <div className={sectionTitle}>Status</div>
                <select value={item.issue_status} onChange={e => run(() => setIssueStatus(meetingId, item.id, e.target.value as IssueStatus, liveRun?.id))} className={field} aria-label="Status">
                  {(['short_term', 'parking_lot', 'solved', 'sent'] as IssueStatus[]).map(s => <option key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            )}
            {kind === 'goal' && (
              <div>
                <div className={sectionTitle}>Status</div>
                <select value={item.goal_status} onChange={e => run(() => setGoalStatus(meetingId, item.id, e.target.value as 'on' | 'off' | 'done'))} className={field} aria-label="Status">
                  <option value="on">On track</option><option value="off">Off track</option><option value="done">Done</option>
                </select>
              </div>
            )}
            <div className={hasDue ? '' : 'sm:col-span-2'}>
              <div className={sectionTitle}>Assign to</div>
              <PersonSelect people={people} value={item.owner_id ?? ''} onChange={id => save({ owner_id: id || null })} emptyLabel="No owner" className="w-full" ariaLabel="Owner" />
            </div>
          </div>

          <div>
            <div className={sectionTitle}>Details</div>
            <RichEditor key={item.id} value={item.details} onCommit={html => save({ details: html })} />
          </div>

          {kind === 'goal' && (
            <div>
              <div className={sectionTitle}>Milestones ({milestones.filter(m => m.done).length}/{milestones.length})</div>
              <ul className="space-y-1.5">
                {milestones.map((m, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input type="checkbox" checked={m.done} onChange={e => saveMilestones(milestones.map((x, idx) => (idx === i ? { ...x, done: e.target.checked } : x)))} aria-label={`Milestone ${i + 1} done`} />
                    <input
                      defaultValue={m.title}
                      onBlur={e => { const v = e.target.value.trim(); if (v && v !== m.title) saveMilestones(milestones.map((x, idx) => (idx === i ? { ...x, title: v } : x))) }}
                      className={`${field} ${m.done ? 'line-through text-gray-500' : ''}`}
                      aria-label={`Milestone ${i + 1}`}
                    />
                    <button onClick={() => saveMilestones(milestones.filter((_, idx) => idx !== i))} aria-label="Remove milestone" className="p-2 -m-2 text-gray-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={e => { e.preventDefault(); const v = newMilestone.trim(); if (!v) return; setNewMilestone(''); saveMilestones([...milestones, { title: v, done: false }]) }}
                className="flex gap-2 mt-2"
              >
                <input value={newMilestone} onChange={e => setNewMilestone(e.target.value)} placeholder="Add a milestone" className={field} aria-label="New milestone" />
                <button className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"><Plus className="w-3.5 h-3.5" /> Add</button>
              </form>
            </div>
          )}

          {kind === 'headline' && onCreateFrom && (
            <div className="rounded-lg border bg-blue-50/50 p-3">
              <div className="text-sm font-semibold mb-1">Create from this headline</div>
              <p className="text-xs text-gray-600 mb-2">Opens a copy you can edit before saving. The headline stays here as a record.</p>
              <div className="flex gap-2">
                <button onClick={() => onCreateFrom('todo')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-semibold hover:bg-gray-50"><ListChecks className="w-4 h-4 text-blue-600" /> New to-do</button>
                <button onClick={() => onCreateFrom('issue')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white text-sm font-semibold hover:bg-gray-50"><AlertCircle className="w-4 h-4 text-amber-600" /> New issue</button>
              </div>
            </div>
          )}

          {otherMeetings.length > 0 && (
            <div className="space-y-3">
              <div>
                <div className={sectionTitle}>Attach to meeting</div>
                <select value="" onChange={e => e.target.value && doMove(e.target.value)} className={field} aria-label="Move to meeting">
                  <option value="">Currently in this meeting. Move to…</option>
                  {otherMeetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-sm font-semibold flex items-center gap-1.5 mb-1"><Copy className="w-4 h-4" /> Copy to another meeting</div>
                <p className="text-xs text-gray-600 mb-2">Makes a duplicate there. The original stays here.</p>
                <div className="flex gap-2">
                  <select value={target.copy} onChange={e => setTarget(t => ({ ...t, copy: e.target.value }))} className={`${field} flex-1`} aria-label="Copy to meeting">
                    <option value="">Choose a meeting</option>
                    {otherMeetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button onClick={doCopy} disabled={!target.copy} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold disabled:opacity-40">Copy</button>
                </div>
              </div>

              <div className="rounded-lg border bg-amber-50/50 p-3">
                <div className="text-sm font-semibold flex items-center gap-1.5 mb-1"><ArrowUpRight className="w-4 h-4" /> Escalate to another meeting</div>
                <p className="text-xs text-gray-600 mb-2">
                  {kind === 'issue'
                    ? 'Sends this issue to the other meeting’s short-term list. It stays here marked as Sent.'
                    : `Raises this ${lower} as a new issue in the other meeting. The original stays here.`}
                </p>
                <div className="flex gap-2">
                  <select value={target.escalate} onChange={e => setTarget(t => ({ ...t, escalate: e.target.value }))} className={`${field} flex-1`} aria-label="Escalate to meeting">
                    <option value="">Choose a meeting</option>
                    {otherMeetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <button onClick={doEscalate} disabled={!target.escalate} className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold disabled:opacity-40">Escalate</button>
                </div>
              </div>
            </div>
          )}

          {item.created_at && <p className="text-xs text-gray-500">Created {new Date(item.created_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</p>}
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t bg-gray-50">
          <button onClick={doDelete} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /> Delete</button>
          {(kind === 'todo' || kind === 'headline') && (
            <button onClick={doArchive} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-gray-900"><Archive className="w-4 h-4" /> Archive</button>
          )}
        </footer>
      </aside>
    </>
  )
}
