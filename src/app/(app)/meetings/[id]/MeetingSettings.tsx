'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, ArrowUp, ArrowDown, Archive } from 'lucide-react'
import { updateMeeting, setMeetingAttendees, archiveMeeting } from '../actions'
import { act } from '../act'
import type { Person } from '@/lib/meetings'

type AgendaRow = { id: string; title: string; minutes: number }
const input = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'

export default function MeetingSettings({
  meeting, agenda, people, attendeeIds, onClose, onSaved,
}: {
  meeting: { id: string; name: string; description: string | null; leader_id: string | null }
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

  const patch = (i: number, p: Partial<AgendaRow>) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ok = await act(async () => {
      const withLeader = leader && !attendees.includes(leader) ? [...attendees, leader] : attendees
      await updateMeeting(meeting.id, { name, description, leader_id: leader || null, agenda: rows })
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
            <label className="block text-sm font-medium">Leader
              <select value={leader} onChange={e => setLeader(e.target.value)} className={`${input} mt-1 font-normal`}>
                <option value="">(none)</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </label>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Agenda</div>
            <ul className="border rounded-lg divide-y">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <input value={r.title} onChange={e => patch(i, { title: e.target.value })} className={`${input} flex-1`} aria-label="Title" />
                  <input type="number" min={0} value={r.minutes} onChange={e => patch(i, { minutes: Number(e.target.value) })} className="w-16 border rounded-lg px-2 py-2 text-sm text-right" aria-label="Minutes" />
                  <span className="text-sm text-gray-500">min</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-1">Total {rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)} min. Sections cannot be removed, only renamed, reordered and re-timed.</p>
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Attendees ({attendees.length})</div>
            <div className="border rounded-lg max-h-48 overflow-y-auto divide-y">
              {people.map(p => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={attendees.includes(p.id) || p.id === leader}
                    disabled={p.id === leader}
                    onChange={() => setAttendees(attendees.includes(p.id) ? attendees.filter(x => x !== p.id) : [...attendees, p.id])}
                  />
                  {p.full_name || p.id.slice(0, 8)}
                </label>
              ))}
            </div>
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
