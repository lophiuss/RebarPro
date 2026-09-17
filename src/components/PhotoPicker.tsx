'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Upload, X } from 'lucide-react'

// Two very different "Take Photo" behaviors depending on device:
// - Touch devices (phones/tablets): the hidden file input's
//   `capture="environment"` hands off straight to the OS's own camera
//   app — better quality/UX than anything we could build, so left as-is.
// - Everything else (desktop/laptop): `capture` is simply ignored by
//   every desktop browser, silently falling back to the plain file
//   picker — which reads as "Take Photo does nothing" since it's
//   identical to Upload Photo. There is no way to make `capture` behave
//   differently there; instead we open a live getUserMedia() camera view
//   and snapshot a frame from it.
function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export default function PhotoPicker({ label = 'Photo', file, onChange }: { label?: string; file: File | null; onChange: (file: File | null) => void }) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadId = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  async function handleTakePhoto() {
    if (isTouchDevice()) {
      cameraInputRef.current?.click()
      return
    }
    setCameraError(null)
    setShowCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    } catch {
      setCameraError('Could not access a camera on this device. Use Upload Photo instead.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setShowCamera(false)
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) onChange(new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      stopCamera()
    }, 'image/jpeg', 0.9)
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleTakePhoto}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition"
        >
          <Camera className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span>Take Photo</span>
        </button>
        <label
          htmlFor={uploadId}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 cursor-pointer transition"
        >
          <Upload className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span>Upload Photo</span>
        </label>
      </div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      <input id={uploadId} type="file" accept="image/*" className="hidden" onChange={e => onChange(e.target.files?.[0] ?? null)} />
      {file && (
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-gray-400 hover:text-red-600 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black/90 z-[70] flex flex-col items-center justify-center p-4">
          <button type="button" onClick={stopCamera} className="absolute top-4 right-4 text-white/80 hover:text-white"><X className="w-7 h-7" /></button>
          {cameraError ? (
            <div className="text-white text-sm text-center max-w-xs">
              <p>{cameraError}</p>
              <button type="button" onClick={stopCamera} className="mt-4 bg-white/10 text-white px-4 py-2 rounded-lg hover:bg-white/20">Close</button>
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="max-w-full max-h-[70vh] rounded-lg bg-black" />
              <button type="button" onClick={captureFrame} className="mt-5 flex items-center gap-2 bg-blue-600 text-white font-semibold px-6 py-3 rounded-full hover:bg-blue-700">
                <Camera className="w-5 h-5" /> Capture
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
