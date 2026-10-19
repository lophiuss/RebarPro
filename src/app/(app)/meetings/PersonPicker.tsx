'use client'

import Portal from './ui/Portal'
import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import Avatar from './Avatar'
import type { Person } from '@/lib/meetings'
import { isNameOwner } from '@/lib/owners'

type Extra = { value: string; label: string }

function matches(p: Person, q: string) {
  return (p.full_name ?? '').toLowerCase().includes(q)
}

// Searchable single-person dropdown. The list is positioned with `fixed` from
// the button's rectangle, so it is never clipped by a scrolling dialog or drawer.
export function PersonSelect({
  people, others = [], othersLabel = 'Everyone else', value, onChange, placeholder = 'Select person', emptyLabel, extra = [], className = '', disabled = false, ariaLabel,
}: {
  people: Person[]
  /** More people, listed after a heading below the main list (for example people not in this meeting). */
  others?: Person[]
  othersLabel?: string
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** When set, adds a "no one" option with this label (value ''). */
  emptyLabel?: string
  /** Pinned options shown above the people (e.g. "Everyone"). */
  extra?: Extra[]
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)

  const selected = people.find(p => p.id === value) ?? others.find(p => p.id === value)
  const extraSelected = extra.find(e => e.value === value)
  const q = query.trim().toLowerCase()
  const offered = useMemo(() => people.filter(p => !isNameOwner(p.id)), [people])
  const filtered = useMemo(() => (q ? offered.filter(p => matches(p, q)) : offered), [offered, q])
  const filteredOthers = useMemo(() => others.filter(p => !isNameOwner(p.id) && (!q || matches(p, q))), [others, q])
  const filteredExtra = q ? extra.filter(e => e.label.toLowerCase().includes(q)) : extra

  function openMenu() {
    if (disabled) return
    const r = btn.current?.getBoundingClientRect()
    if (r) {
      const width = Math.max(r.width, 256)
      const left = Math.min(r.left, window.innerWidth - width - 8)
      const below = window.innerHeight - r.bottom
      setPos(below < 300 && r.top > below
        ? { bottom: window.innerHeight - r.top + 4, left, width }
        : { top: r.bottom + 4, left, width })
    }
    setQuery('')
    setOpen(true)
  }

  function pick(id: string) {
    onChange(id)
    setOpen(false)
  }

  const label = selected?.full_name ?? extraSelected?.label ?? (value === '' && emptyLabel ? emptyLabel : placeholder)

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={openMenu}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white text-left hover:bg-gray-50 disabled:opacity-50 min-w-0 ${className}`}
      >
        {selected && <Avatar person={selected} size="sm" />}
        <span className={`flex-1 truncate ${selected || extraSelected || (value === '' && emptyLabel) ? '' : 'text-gray-500'}`}>{label}</span>
        <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
      </button>

      {open && pos && (
        <Portal>
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
            className="z-[71] bg-white border rounded-lg shadow-xl flex flex-col max-h-72"
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
          >
            <div className="relative p-2 border-b">
              <Search className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const first = filteredExtra[0]?.value ?? filtered[0]?.id ?? filteredOthers[0]?.id
                    if (first !== undefined) pick(first)
                  }
                }}
                placeholder="Search name"
                className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-md"
                aria-label="Search name"
              />
            </div>
            <ul className="overflow-y-auto py-1">
              {emptyLabel !== undefined && !q && (
                <li><button type="button" onClick={() => pick('')} className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2">{value === '' && <Check className="w-4 h-4 text-blue-600" />}<span className="flex-1">{emptyLabel}</span></button></li>
              )}
              {filteredExtra.map(e => (
                <li key={e.value}><button type="button" onClick={() => pick(e.value)} className="w-full text-left px-3 py-1.5 text-sm font-medium hover:bg-gray-50 flex items-center gap-2">{value === e.value && <Check className="w-4 h-4 text-blue-600" />}<span className="flex-1">{e.label}</span></button></li>
              ))}
              {filtered.map(p => (
                <li key={p.id}>
                  <button type="button" onClick={() => pick(p.id)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
                    <Avatar person={p} size="sm" />
                    <span className="flex-1 truncate">{p.full_name || p.id.slice(0, 8)}</span>
                    {value === p.id && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                </li>
              ))}
              {filteredOthers.length > 0 && (
                <>
                  <li className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 border-t mt-1">{othersLabel}</li>
                  {filteredOthers.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => pick(p.id)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2">
                        <Avatar person={p} size="sm" />
                        <span className="flex-1 truncate">{p.full_name || p.id.slice(0, 8)}</span>
                        {value === p.id && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    </li>
                  ))}
                </>
              )}
              {filtered.length === 0 && filteredOthers.length === 0 && filteredExtra.length === 0 && <li className="px-3 py-3 text-sm text-gray-500 text-center">No one matches &ldquo;{query}&rdquo;</li>}
            </ul>
          </div>
        </>
        </Portal>
      )}
    </>
  )
}

// Searchable multi-select list (attendees, seat holders…).
export function PeopleChecklist({
  people, selected, onToggle, locked = [], maxHeight = 'max-h-48',
}: {
  people: Person[]
  selected: string[]
  onToggle: (id: string) => void
  /** Always-checked, non-editable ids (e.g. the leader). */
  locked?: string[]
  maxHeight?: string
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = (q ? people.filter(p => matches(p, q)) : people).filter(p => !isNameOwner(p.id))
  return (
    <div className="border rounded-lg">
      <div className="relative p-2 border-b">
        <Search className="w-4 h-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          placeholder="Search name"
          aria-label="Search name"
          className="w-full pl-8 pr-2 py-1.5 text-sm border rounded-md"
        />
      </div>
      <div className={`${maxHeight} overflow-y-auto divide-y`}>
        {shown.map(p => {
          const isLocked = locked.includes(p.id)
          return (
            <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={isLocked || selected.includes(p.id)} disabled={isLocked} onChange={() => onToggle(p.id)} />
              <Avatar person={p} size="sm" />
              <span className="truncate">{p.full_name || p.id.slice(0, 8)}</span>
            </label>
          )
        })}
        {shown.length === 0 && <div className="px-3 py-4 text-sm text-gray-500 text-center">No one matches &ldquo;{query}&rdquo;</div>}
      </div>
    </div>
  )
}
