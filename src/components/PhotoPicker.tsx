'use client'

import { useId } from 'react'
import { Camera } from 'lucide-react'

// The bare browser file input ("Choose File / No file chosen") is easy to
// miss, especially on mobile where it's the only way to open the camera.
// This wraps it in an actual button people can see.
export default function PhotoPicker({ label = 'Photo', file, onChange }: { label?: string; file: File | null; onChange: (file: File | null) => void }) {
  const id = useId()
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <label
        htmlFor={id}
        className="flex items-center gap-2 w-full border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition"
      >
        <Camera className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <span className="truncate">{file ? file.name : 'Take or choose a photo'}</span>
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  )
}
