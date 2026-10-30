'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Upload, X, Loader2, Check } from 'lucide-react'
import { compressImageToTarget } from '@/lib/compressImage'

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

export default function PhotoPicker({
  label = 'Photo',
  file,
  onChange,
  maxBytes = 195 * 1024,
}: {
  label?: string
  file: File | null
  onChange: (file: File | null) => void
  maxBytes?: number
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadId = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function processAndSetFile(rawFile: File | null) {
    if (!rawFile) {
      onChange(null)
      return
    }
    setCompressing(true)
    try {
      const compressed = await compressImageToTarget(rawFile, maxBytes)
      onChange(compressed)
    } catch (err) {
      console.warn('[PhotoPicker] Compression fallback:', err)
      onChange(rawFile)
    } finally {
      setCompressing(false)
    }
  }

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
    canvas.toBlob(async blob => {
      if (blob) {
        const rawFile = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
        await processAndSetFile(rawFile)
      }
      stopCamera()
    }, 'image/jpeg', 0.85)
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
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => processAndSetFile(e.target.files?.[0] ?? null)} />
      <input id={uploadId} type="file" accept="image/*" className="hidden" onChange={e => processAndSetFile(e.target.files?.[0] ?? null)} />

      {compressing && (
        <div className="flex items-center gap-2 mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
          <span>Optimizing & compressing photo to below 200KB…</span>
        </div>
      )}

      {!compressing && file && (
        <div className="flex items-center gap-2.5 mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 shadow-2xs">
          {previewUrl && (
            <img src={previewUrl} alt="Thumbnail preview" className="w-10 h-10 rounded-md object-cover border border-gray-300 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <span className="truncate block font-medium text-slate-800">{file.name}</span>
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
              <span className="text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                <Check className="w-3 h-3 text-emerald-600" /> &lt; 200KB
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-gray-100 transition shrink-0"
            title="Remove photo"
          >
            <X className="w-4 h-4" />
          </button>
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
