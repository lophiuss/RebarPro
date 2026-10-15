'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Archive } from 'lucide-react'
import { updateMeeting, setMeetingAttendees, archiveMeeting } from '../actions'
import { act } from '../act'
import { SortableList } from '../Sortable'
import { PersonSelect, PeopleChecklist } from '../PersonPicker'
import type { Person } from '@/lib/meetings'
import type { Schedule } from '../WorkspaceBodies'

type AgendaRow = { id: string; title: string; minutes: number }
const input = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'

export default function MeetingSettings({
  meeting, agenda, people, attendeeIds, schedule, onClose, onSaved,
}: {
  meeting: { id: string; name: string; description: string | null; leader_id: string | null }
  schedule: Schedule | null
  agenda: AgendaRow[]
  people: Person[]
  attendeeIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(meeting.name)
  const [description, setDescription] = useState(meeting.description ?? '')
  const [leader, setLeader] = useState(meeting.leader_id ?? '')
  const [attendees, setAttendees] = useState<string[]>(attendeeIds)
  const [rows, setRows] = useState<AgendaRow[]>(agenda)
  const [saving, setSaving] = useState(false)
  const [sched, setSched] = useState<Schedule>(schedule ?? { days: [], time: '09:00', every: 1 })

  const patch = (i: number, p: Partial<AgendaRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await act(async () => {
      const withLeader = leader && !attendees.includes(leader) ? [...attendees, leader] : attendees
      await updateMeeting(meeting.id, { name, description, leader_id: leader || null, agenda: rows, schedule: sched.days.length ? sched : null })
      await setMeetingAttendees(meeting.id, withLeader)
      return true
    })
    setSaving(false)
    if (ok) { onSaved(); onClose() }
  }

  async function archive() {
    if (!confirm('Archive this meeting? It disappears from the meetings list. Its history is kept.')) return
    const ok = await act(async () => { await archiveMeeting(meeting.id); return true })
    if (ok) router.push('/meetings')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white rounded-t-xl">
          <h2 className="font-bold text-lg">Meeting settings</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-medium md:col-span-2">Name
              <input required value={name} onChange={e => setName(e.target.value)} className={`${input} mt-1 font-normal`} />
            </label>
            <label className="block text-sm font-medium md:col-span-2">Description
              <input value={description} onChange={e => setDescription(e.target.value)} className={`${input} mt-1 font-normal`} />
            </label>
            <div>
              <div className="text-sm font-medium mb-1">Leader</div>
              <PersonSelect people={people} value={leader} onChange={setLeader} emptyLabel="(none)" className="w-full" ariaLabel="Leader" />
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Agenda</div>
            <SortableList
              items={rows}
              getKey={r => r.id}
              onChange={setRows}
              className="border rounded-lg divide-y"
              itemClassName="px-3 py-2"
              render={(r, i) => (
                <>
                  <input value={r.title} onChange={e => patch(i, { title: e.target.value })} className={`${input} flex-1`} aria-label="Title" />
                  <input type="number" min={0} value={r.minutes} onChange={e => patch(i, { minutes: Number(e.target.value) })} className="w-16 border rounded-lg px-2 py-2 text-sm text-right" aria-label="Minutes" />
                  <span className="text-sm text-gray-500">min</span>
                </>
              )}
            />
            <p className="text-xs text-gray-500 mt-1">Drag the handle to reorder. Total {rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)} min. Sections cannot be removed, only renamed, reordered and re-timed.</p>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Schedule</div>
            <p className="text-xs text-gray-500 mb-2">Shows this meeting on everyone&apos;s calendar. Leave every day off for no schedule.</p>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSched(prev => ({ ...prev, days: prev.days.includes(d) ? prev.days.filter(x => x !== d) : [...prev.days, d] }))}
                  className={`w-11 py-1.5 rounded-lg border text-sm font-medium ${sched.days.includes(d) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
                  aria-pressed={sched.days.includes(d)}
                >{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">At <input type="time" value={sched.time} onChange={e => setSched({ ...sched, time: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
              <label className="flex items-center gap-2">Every
                <select value={sched.every} onChange={e => setSched({ ...sched, every: Number(e.target.value) })} className="border rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value={1}>week</option><option value={2}>2 weeks</option><option value={3}>3 weeks</option><option value={4}>4 weeks</option>
                </select>
              </label>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Attendees ({attendees.length})</div>
            <PeopleChecklist
              people={people}
              selected={attendees}
              locked={leader ? [leader] : []}
              onToggle={id => setAttendees(attendees.includes(id) ? attendees.filter(x => x !== id) : [...attendees, id])}
            />
          </div>

          <div className="border-t pt-4">
            <button type="button" onClick={archive} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700"><Archive className="w-4 h-4" /> Archive meeting</button>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl sticky bottom-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
          <button disabled={saving || !name.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  )
}
