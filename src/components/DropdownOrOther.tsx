'use client'

import { useState } from 'react'

const OTHER = '__other__'

// A <select> of known values (native selects support type-ahead search by
// typing a letter) with a trailing "Other (type new)" option that swaps in
// a text input — keeps free-text fields like category/location/manager
// consistent (no "Crane" vs "crane" duplicates) while still letting a
// genuinely new value be entered. Shared by the Equipment list's edit
// modal and the Settings equipment table/add form.
export default function DropdownOrOther({ value, options, onChange, placeholder, className }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const [typingNew, setTypingNew] = useState(value !== '' && !options.includes(value))
  if (typingNew) {
    return (
      <div className="flex gap-1">
        <input autoFocus value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={className || 'w-full border rounded-md px-3 py-2 text-sm'} />
        <button type="button" onClick={() => { setTypingNew(false); onChange('') }} className="text-xs text-gray-400 hover:text-gray-600 px-1" title="Back to dropdown">✕</button>
      </div>
    )
  }
  return (
    <select
      value={options.includes(value) ? value : ''}
      onChange={e => { if (e.target.value === OTHER) { setTypingNew(true); onChange('') } else onChange(e.target.value) }}
      className={className || 'w-full border rounded-md px-3 py-2 text-sm bg-white'}
    >
      <option value="">-</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={OTHER}>+ Other (type new)</option>
    </select>
  )
}
