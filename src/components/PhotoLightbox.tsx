'use client'

import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

// Full-screen zoomed view for a security photo. `src` is null when closed —
// render this once per page and drive it with a single `zoomSrc` state.
// `onPrev`/`onNext` are optional — when a caller passes them (browsing a
// sequence of photos, e.g. the Audit session matrix), left/right arrow
// keys and on-screen chevrons step through it; omit them for a plain
// single-photo view (most callers). `caption` shows under the photo,
// typically who/where/when it was taken.
export default function PhotoLightbox({
  src, onClose, onPrev, onNext, caption,
}: {
  src: string | null
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  caption?: React.ReactNode
}) {
  useEffect(() => {
    if (!src) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onPrev, onNext, onClose])

  if (!src) return null
  return (
    <div className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white">
        <X className="w-7 h-7" />
      </button>
      {onPrev && (
        <button onClick={e => { e.stopPropagation(); onPrev() }} className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 rounded-full p-2">
          <ChevronLeft className="w-7 h-7" />
        </button>
      )}
      {onNext && (
        <button onClick={e => { e.stopPropagation(); onNext() }} className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/30 hover:bg-black/50 rounded-full p-2">
          <ChevronRight className="w-7 h-7" />
        </button>
      )}
      <div className="flex flex-col items-center gap-3 max-w-full max-h-full" onClick={e => e.stopPropagation()}>
        <img src={src} className="max-w-full max-h-[75vh] object-contain rounded-lg" />
        {caption && <div className="text-white/90 text-sm text-center bg-black/40 rounded-lg px-4 py-2 max-w-full">{caption}</div>}
      </div>
    </div>
  )
}
