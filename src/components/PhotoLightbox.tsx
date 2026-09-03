'use client'

import { X } from 'lucide-react'

// Full-screen zoomed view for a security photo. `src` is null when closed —
// render this once per page and drive it with a single `zoomSrc` state.
export default function PhotoLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  return (
    <div className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <X className="w-7 h-7" />
      </button>
      <img src={src} className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
    </div>
  )
}
