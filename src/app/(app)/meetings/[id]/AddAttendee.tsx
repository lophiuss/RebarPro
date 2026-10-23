'use client'

import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { addMeetingAttendee, setAttendanceBulk } from '../actions'
import Portal from '../ui/Portal'
import Avatar from '../Avatar'
import { isNameOwner } from '@/lib/owners'
import { useMeeting, useRun } from './context'

// "Someone joined who is not on the list": adds them to the meeting and, while the meeting is running, checks
// them in as present. Used on the Check-in and Wrap-up pages.
export function AddAttendeeDialog({ onClose }: { onClose: () => void }) {
  const { meetingId, run: liveRun, people, attendeeIds } = useMeeting()
  const run = useRun()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const q = query.trim().toLowerCase()
  const addable = people.filter(p => !attendeeIds.includes(p.id) && !isNameOwner(p.id) && (!q || (p.full_name ?? '').toLowerCase().includes(q)))

  async function add(id: string) {
    setBusy(true)
    const ok = await run(async () => {
      await addMeetingAttendee(meetingId, id)
      if (liveRun) await setAttendanceBulk(liveRun.id, { [id]: true })
      return true
    })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-bold">Add a person to this meeting</h2>
            <button type="button" onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
          </div>
          <div className="relative p-3 border-b">
            <Search className="w-4 h-4 text-gray-500 absolute left-5 top-1/2 -translate-y-1/2" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name" aria-label="Search name" className="w-full pl-8 pr-2 py-2 text-sm border rounded-md"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (addable[0] && !busy) add(addable[0].id) } }} />
          </div>
          <ul className="overflow-y-auto divide-y">
            {addable.map(p => (
              <li key={p.id}>
                <button type="button" disabled={busy} onClick={() => add(p.id)} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 flex items-center gap-3 disabled:opacity-50">
                  <Avatar person={p} size="sm" /> <span className="flex-1 truncate">{p.full_name || p.id.slice(0, 8)}</span> <Plus className="w-4 h-4 text-blue-600" />
                </button>
              </li>
            ))}
            {addable.length === 0 && <li className="px-4 py-6 text-sm text-gray-500 text-center">{q ? <>No one matches &ldquo;{query}&rdquo;</> : 'Everyone is already in this meeting.'}</li>}
          </ul>
          <p className="text-xs text-gray-500 px-4 py-2 border-t">{liveRun ? 'They are added to the meeting and checked in as present.' : 'They are added to the meeting.'}</p>
        </div>
      </div>
    </Portal>
  )
}
