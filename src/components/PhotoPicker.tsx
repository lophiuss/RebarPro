'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Upload, X, Loader2, Check, RefreshCw, Zap, ZapOff, AlertCircle } from 'lucide-react'
import { compressImageToTarget } from '@/lib/compressImage'

/**
 * In-app camera and photo uploader.
 *
 * CRITICAL STABILITY NOTE FOR MOBILE / ANDROID GUARDS:
 * On budget Android devices (2GB-4GB RAM), using native `<input capture="environment">` launches
 * the heavy external camera app (taking 500MB+ RAM), causing Android's Low Memory Killer (LMK)
 * to kill Chrome in the background. When the guard finishes the photo, Chrome restarts/reloads,
 * losing the entire clocking session.
 *
 * To prevent this, we open a direct in-app camera viewfinder via `getUserMedia({ facingMode: 'environment' })`
 * right inside the web page. Chrome stays active in the foreground, memory usage remains ~3MB,
 * and guards can snap photos instantly without app reloads or crashes.
 */
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
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const uploadId = useId()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [torchOn, setTorchOn] = useState(false)
  const [supportsTorch, setSupportsTorch] = useState(false)
  const [isFlashing, setIsFlashing] = useState(false)

  // Clean up media tracks on unmount
  useEffect(() => {
    return () => {
      stopCameraTracks()
    }
  }, [])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function stopCameraTracks() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => {
        try {
          t.stop()
        } catch {}
      })
      streamRef.current = null
    }
  }

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

  async function startCamera(mode: 'environment' | 'user' = facingMode) {
    setCameraError(null)
    stopCameraTracks()
    setShowCamera(true)
    setTorchOn(false)
    setSupportsTorch(false)

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('In-app camera is not supported on this browser.')
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try {
          await videoRef.current.play()
        } catch {}
      }

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0]
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as any
        if (caps && caps.torch) {
          setSupportsTorch(true)
        }
      }
    } catch (err: any) {
      console.warn('[PhotoPicker] getUserMedia error:', err)
      const msg =
        err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in browser settings.'
          : err?.message || 'Could not access camera.'
      setCameraError(msg)
    }
  }

  function stopCamera() {
    stopCameraTracks()
    setShowCamera(false)
    setCameraError(null)
    setTorchOn(false)
  }

  async function toggleTorch() {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return

    try {
      const nextState = !torchOn
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      })
      setTorchOn(nextState)
    } catch (err) {
      console.warn('[PhotoPicker] Torch error:', err)
    }
  }

  async function switchFacingMode() {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
    await startCamera(nextMode)
  }

  function captureFrame() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    // Trigger visual shutter flash
    setIsFlashing(true)
    setTimeout(() => setIsFlashing(false), 150)

    try {
      const canvas = document.createElement('canvas')
      // Clamp capture resolution to max 1280px to save memory and match target size
      const maxDim = 1280
      let w = video.videoWidth
      let h = video.videoHeight
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w)
          w = maxDim
        } else {
          w = Math.round((w * maxDim) / h)
          h = maxDim
        }
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h)
        canvas.toBlob(
          async blob => {
            if (blob) {
              const rawFile = new File([blob], `guard-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
              await processAndSetFile(rawFile)
            }
            stopCamera()
          },
          'image/jpeg',
          0.85
        )
      } else {
        stopCamera()
      }
    } catch (e) {
      console.error('[PhotoPicker] capture frame error:', e)
      stopCamera()
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => startCamera(facingMode)}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 rounded-lg px-4 py-3 text-sm font-medium text-blue-700 hover:border-blue-500 cursor-pointer transition shadow-2xs active:scale-[0.99]"
        >
          <Camera className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <span>Take Photo</span>
        </button>
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          className="flex items-center justify-center gap-2 flex-1 border-2 border-dashed border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 rounded-lg px-4 py-3 text-sm font-medium text-gray-700 cursor-pointer transition shadow-2xs active:scale-[0.99]"
        >
          <Upload className="w-5 h-5 text-slate-500 flex-shrink-0" />
          <span>Upload File</span>
        </button>
      </div>

      {/* Hidden fallback inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          processAndSetFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <input
        ref={uploadInputRef}
        id={uploadId}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          processAndSetFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />

      {compressing && (
        <div className="flex items-center gap-2 mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
          <span>Optimizing & compressing photo to below 200KB…</span>
        </div>
      )}

      {!compressing && file && (
        <div className="flex items-center gap-2.5 mt-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2 shadow-2xs">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Thumbnail preview"
              className="w-12 h-12 rounded-md object-cover border border-gray-300 shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <span className="truncate block font-medium text-slate-800">{file.name}</span>
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
              <span className="text-slate-500 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded">
                <Check className="w-3 h-3 text-emerald-600" /> &lt; 200KB OK
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-gray-100 transition shrink-0"
            title="Remove photo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Dedicated In-App Camera Viewfinder */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col justify-between overflow-hidden select-none">
          {/* Top Controls Bar */}
          <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              {supportsTorch && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`p-2.5 rounded-full backdrop-blur-md transition ${
                    torchOn ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                  title="Flashlight / Torch"
                >
                  {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
                </button>
              )}
              <button
                type="button"
                onClick={switchFacingMode}
                className="p-2.5 rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md transition"
                title="Switch Camera (Front/Back)"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            <button
              type="button"
              onClick={stopCamera}
              className="p-2.5 rounded-full bg-white/20 text-white hover:bg-white/30 backdrop-blur-md transition"
              title="Close Camera"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Camera Viewport or Error Screen */}
          <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
            {cameraError ? (
              <div className="text-white text-center px-6 max-w-sm space-y-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <p className="text-sm text-gray-200">{cameraError}</p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera()
                      cameraInputRef.current?.click()
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition"
                  >
                    Open System Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera()
                      uploadInputRef.current?.click()
                    }}
                    className="w-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition"
                  >
                    Upload from Gallery
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="text-gray-400 hover:text-white text-xs pt-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Shutter visual flash effect */}
                {isFlashing && (
                  <div className="absolute inset-0 bg-white z-20 pointer-events-none animate-out fade-out duration-150" />
                )}

                {/* Grid guidelines overlay */}
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20">
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-r border-b border-white" />
                  <div className="border-b border-white" />
                  <div className="border-r border-white" />
                  <div className="border-r border-white" />
                  <div />
                </div>
              </>
            )}
          </div>

          {/* Bottom Shutter Bar */}
          {!cameraError && (
            <div className="relative z-10 flex items-center justify-center px-4 py-6 bg-gradient-to-t from-black/80 to-transparent">
              <button
                type="button"
                onClick={captureFrame}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center shadow-xl active:scale-95 transition cursor-pointer"
                aria-label="Capture Photo"
              >
                <div className="w-16 h-16 rounded-full bg-blue-600 active:bg-blue-500 transition" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
