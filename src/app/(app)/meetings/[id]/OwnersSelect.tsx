'use client'

import { useRef, useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import Portal from '../ui/Portal'
import Avatar from '../Avatar'
import { PeopleChecklist } from '../PersonPicker'
import { useMeeting } from './context'

// Pick one or more people for a new to-do. Each person picked gets their own copy, so everyone ticks off
// their own part and "my to-dos" keeps working. This meeting's people are listed first.
export function OwnersSelect({ value, onChange, className = 'md:w-56' }: { value: string[]; onChange: (ids: string[]) => void; className?: string }) {
  const { people, attendeeIds, peopleById } = useMeeting()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const ordered = [...people.filter(p => attendeeIds.includes(p.id)), ...people.filter(p => !attendeeIds.includes(p.id))]

  function openMenu() {
    const r = btn.current?.getBoundingClientRect()
    if (r) {
      const width = Math.max(r.width, 260)
      const left = Math.min(r.left, window.innerWidth - width - 8)
      const below = window.innerHeight - r.bottom
      setPos(below < 320 && r.top > below ? { bottom: window.innerHeight - r.top + 4, left, width } : { top: r.bottom + 4, left, width })
    }
    setOpen(true)
  }

  const first = peopleById.get(value[0])
  const label = value.length === 0 ? 'Assign to…' : value.length === 1 ? (first?.full_name ?? '1 person') : `${first?.full_name ?? ''} +${value.length - 1}`

  return (
    <>
      <button ref={btn} type="button" onClick={openMenu} aria-haspopup="listbox" aria-expanded={open} aria-label="Assign to"
        className={`inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white text-left hover:bg-gray-50 min-w-0 ${className}`}>
        {value.length > 1
          ? <span className="flex -space-x-2 shrink-0">{value.slice(0, 3).map(id => <span key={id} className="ring-2 ring-white rounded-full"><Avatar person={peopleById.get(id)} size="sm" /></span>)}</span>
          : first ? <Avatar person={first} size="sm" /> : <Users className="w-4 h-4 text-gray-500" />}
        <span className={`flex-1 truncate ${value.length ? '' : 'text-gray-500'}`}>{label}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
      </button>
      {open && pos && (
        <Portal>
          <>
            <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
            <div style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }} className="z-[71] bg-white rounded-lg shadow-xl" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
              <PeopleChecklist people={ordered} selected={value} maxHeight="max-h-64" onToggle={id => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])} />
              <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-gray-500">
                <span>{value.length > 1 ? `${value.length} people: one to-do each` : 'Tick more than one to give each a copy'}</span>
                <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-semibold">Done</button>
              </div>
            </div>
          </>
        </Portal>
      )}
    </>
  )
}
