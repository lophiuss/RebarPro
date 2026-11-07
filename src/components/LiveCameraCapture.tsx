'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, X, AlertCircle, CheckCircle2 } from 'lucide-react'
import { compressImageToTarget } from '@/lib/compressImage'

interface LiveCameraCaptureProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (file: File, exceptionReason?: string) => void
  allowException?: boolean
  title?: string
  facingMode?: 'user' | 'environment'
}

export default function LiveCameraCapture({
  isOpen,
  onClose,
  onCapture,
  allowException = true,
  title = 'Live Camera Verification',
  facingMode = 'user',
}: LiveCameraCaptureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showExceptionDialog, setShowExceptionDialog] = useState(false)
  const [exceptionReason, setExceptionReason] = useState('')
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>(facingMode)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      if (!dialog.open) dialog.showModal()
      startCamera(currentFacingMode)
    } else {
      stopCamera()
      if (dialog.open) dialog.close()
      setCapturedBlob(null)
      setCapturedPreview(null)
      setCameraError(null)
      setShowExceptionDialog(false)
    }

    return () => {
      stopCamera()
    }
  }, [isOpen, currentFacingMode])

  async function startCamera(mode: 'user' | 'environment') {
    stopCamera()
    setCameraError(null)
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported on this browser or connection.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch (err: any) {
      setCameraError(err?.message || 'Unable to access camera. Please allow camera permissions.')
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function handleSnap() {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // If front camera, mirror image for natural selfie preview
    if (currentFacingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(blob => {
      if (blob) {
        setCapturedBlob(blob)
        setCapturedPreview(URL.createObjectURL(blob))
        stopCamera()
      }
    }, 'image/jpeg', 0.85)
  }

  function handleRetake() {
    setCapturedBlob(null)
    if (capturedPreview) URL.revokeObjectURL(capturedPreview)
    setCapturedPreview(null)
    startCamera(currentFacingMode)
  }

  async function handleConfirm() {
    if (!capturedBlob) return
    try {
      const compressed = await compressImageToTarget(capturedBlob, 195 * 1024)
      const file = new File([compressed], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture(file)
      onClose()
    } catch {
      const file = new File([capturedBlob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })
      onCapture(file)
      onClose()
    }
  }

  function handleExceptionSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!exceptionReason.trim()) return
    // Empty dummy file with exception note
    const emptyFile = new File([''], 'exception.txt', { type: 'text/plain' })
    onCapture(emptyFile, exceptionReason.trim())
    onClose()
  }

  if (!isOpen) return null

  return (
    <dialog
      ref={dialogRef}
      onCancel={onClose}
      className="backdrop:bg-slate-900/80 backdrop:backdrop-blur-sm fixed inset-0 m-auto p-0 rounded-2xl bg-white shadow-2xl border border-slate-200 max-w-lg w-[calc(100vw-2rem)] overflow-hidden z-50 text-slate-800"
      style={{ overscrollBehavior: 'contain' }}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          <h2 className="font-semibold text-slate-800 text-sm sm:text-base">{title}</h2>
        </div>
        <button
          onClick={onClose}
          type="button"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 sm:p-6 flex flex-col items-center">
        {cameraError ? (
          <div className="w-full text-center py-8">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-800 mb-1">Camera Access Issue</p>
            <p className="text-xs text-slate-500 mb-4 max-w-xs mx-auto">{cameraError}</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => startCamera(currentFacingMode)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
              >
                Retry Camera
              </button>
              {allowException && (
                <button
                  type="button"
                  onClick={() => setShowExceptionDialog(true)}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  Can&apos;t use camera? Record reason and submit anyway
                </button>
              )}
            </div>
          </div>
        ) : showExceptionDialog ? (
          <form onSubmit={handleExceptionSubmit} className="w-full">
            <p className="text-xs text-slate-600 mb-3">
              Record why you cannot use the camera (e.g. camera lens broken, low light, browser restriction). This will be flagged for supervisor review.
            </p>
            <textarea
              required
              rows={3}
              value={exceptionReason}
              onChange={e => setExceptionReason(e.target.value)}
              placeholder="Explain why camera cannot be used..."
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExceptionDialog(false)}
                className="px-3 py-1.5 text-xs text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Back to Camera
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700"
              >
                Submit with Exception
              </button>
            </div>
          </form>
        ) : capturedPreview ? (
          <div className="w-full flex flex-col items-center">
            <div className="w-full aspect-4/3 rounded-xl overflow-hidden bg-black mb-4 flex items-center justify-center border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedPreview} alt="Captured preview" className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" /> Confirm Photo
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <div className="w-full aspect-4/3 rounded-xl overflow-hidden bg-slate-900 relative mb-4 border border-slate-800">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${currentFacingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />
              <button
                type="button"
                onClick={() => setCurrentFacingMode(prev => (prev === 'user' ? 'environment' : 'user'))}
                title="Switch Camera"
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur-xs transition"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleSnap}
              className="w-16 h-16 rounded-full border-4 border-blue-600 bg-white hover:bg-slate-100 flex items-center justify-center shadow-lg transition active:scale-95"
              aria-label="Take Photo"
            >
              <div className="w-12 h-12 rounded-full bg-blue-600" />
            </button>

            {allowException && (
              <button
                type="button"
                onClick={() => setShowExceptionDialog(true)}
                className="mt-4 text-[11px] text-slate-400 hover:text-slate-600 underline"
              >
                Can&apos;t use camera? Record reason
              </button>
            )}
          </div>
        )}
      </div>
    </dialog>
  )
}
