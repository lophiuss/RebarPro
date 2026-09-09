'use client'

import { useId } from 'react'
import { Camera, Upload, X } from 'lucide-react'

// Two separate inputs, not one: `capture="environment"` forces a mobile
// browser straight into the camera, skipping its own "choose from
// gallery" option entirely — fine for "take a photo right now", but it
// means there was previously no way to attach an existing photo from mobile.
// Desktop ignores `capture` either way, so both buttons just open the same
// file picker there.
export default function PhotoPicker({ label = 'Photo', file, onChange }: { label?: string; file: File | null; onChange: (file: File | null) => void }) {
  const cameraId = useId()
  const uploadId = useId()
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <label
          htmlFor={cameraId}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition"
        >
          <Camera className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span>Take Photo</span>
        </label>
        <label
          htmlFor={uploadId}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition"
        >
          <Upload className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span>Upload Photo</span>
        </label>
      </div>
      <input id={cameraId} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      <input id={uploadId} type="file" accept="image/*" className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      {file && (
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  )
}
