'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Star, Radio, X } from 'lucide-react'
import { createMeeting, toggleFavourite } from './actions'
import { AvatarStack } from './Avatar'
import { PersonSelect, PeopleChecklist } from './PersonPicker'
import { Segmented } from './[id]/shared'
import type { Person } from '@/lib/meetings'

type Meeting = { id: string; name: string; description: string | null; leader_id: string | null; meeting_type?: 'weekly' | 'quarterly_alignment' }
type Tab = 'mine' | 'qa' | 'others'
type Attendee = { meeting_id: string; user_id: string; is_favourite: boolean }

export default function MeetingsList({
  meetings, attendees, people, liveMeetingIds, myId,
}: { meetings: Meeting[]; attendees: Attendee[]; people: Person[]; liveMeetingIds: string[]; myId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('mine')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', leader_id: myId, attendee_ids: [] as string[] })
  const [saving, setSaving] = useState(false)

  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const attendeesByMeeting = useMemo(() => {
    const m = new Map<string, Attendee[]>()
    for (const a of attendees) m.set(a.meeting_id, [...(m.get(a.meeting_id) ?? []), a])
    return m
  }, [attendees])

  const rows = meetings
    .map(m => {
      const att = attendeesByMeeting.get(m.id) ?? []
      return { ...m, att, mine: att.some(a => a.user_id === myId), fav: att.some(a => a.user_id === myId && a.is_favourite) }
    })
    .filter(m => {
      const qa = m.meeting_type === 'quarterly_alignment'
      if (tab === 'mine') return m.mine && !qa
      if (tab === 'qa') return m.mine && qa
      return !m.mine
    })
    .filter(m => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      return m.name.toLowerCase().includes(q) || m.att.some(a => (peopleById.get(a.user_id)?.full_name ?? '').toLowerCase().includes(q))
    })
    .sort((a, b) => Number(b.fav) - Number(a.fav) || a.name.localeCompare(b.name))

  const attending = meetings.filter(m => (attendeesByMeeting.get(m.id) ?? []).some(a => a.user_id === myId))
  const qaCount = attending.filter(m => m.meeting_type === 'quarterly_alignment').length
  const mineCount = attending.length - qaCount
  const othersCount = meetings.length - attending.length

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const id = await createMeeting({
        name: form.name,
        description: form.description,
        leader_id: form.leader_id || null,
        attendee_ids: form.attendee_ids,
      })
      setShowNew(false)
      router.push(`/meetings/${id}`)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleAttendee(id: string) {
    setForm(f => ({
      ...f,
      attendee_ids: f.attendee_ids.includes(id) ? f.attendee_ids.filter(x => x !== id) : [...f.attendee_ids, id],
    }))
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by title or attendee"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-white"
          />
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> New meeting
        </button>
      </div>

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { key: 'mine', label: `My meetings (${mineCount})` },
            { key: 'qa', label: `Quarterly Alignment (${qaCount})` },
            { key: 'others', label: `Others (${othersCount})` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="border rounded-xl bg-white shadow-sm p-10 text-center text-sm text-gray-500">
          {meetings.length === 0 ? 'No meetings yet. Create the first one.' : 'No meetings match.'}
        </div>
      ) : (
        <ul className="border rounded-xl bg-white shadow-sm divide-y">
          {rows.map(m => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
              {m.mine ? (
                <button
                  onClick={() => toggleFavourite(m.id).catch(err => alert('Error: ' + err.message))}
                  aria-label={m.fav ? 'Remove favourite' : 'Mark as favourite'}
                  className="shrink-0"
                >
                  <Star className={`w-4 h-4 ${m.fav ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-gray-500'}`} />
                </button>
              ) : <span className="w-4 shrink-0" />}
              <Link href={`/meetings/${m.id}`} className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                  {m.name}
                  {liveMeetingIds.includes(m.id) && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                      <Radio className="w-3 h-3" /> LIVE
                    </span>
                  )}
                </div>
                {m.description && <div className="text-xs text-gray-500 truncate">{m.description}</div>}
              </Link>
              <AvatarStack people={m.att.map(a => peopleById.get(a.user_id))} />
            </li>
          ))}
        </ul>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submitNew} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">New meeting</h2>
              <button type="button" onClick={() => setShowNew(false)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm font-medium">
                Name
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Weekly leadership meeting" />
              </label>
              <label className="block text-sm font-medium">
                Description <span className="text-gray-400 font-normal">(optional)</span>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </label>
              <div>
                <div className="text-sm font-medium mb-1">Leader</div>
                <PersonSelect people={people} value={form.leader_id} onChange={id => setForm({ ...form, leader_id: id })} className="w-full" ariaLabel="Leader" />
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Attendees</div>
                <PeopleChecklist people={people} selected={form.attendee_ids} locked={[form.leader_id, myId].filter(Boolean)} onToggle={toggleAttendee} />
                <p className="text-xs text-gray-500 mt-1">You and the leader are always included.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={saving || !form.name.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
                {saving ? 'Creating…' : 'Create meeting'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
