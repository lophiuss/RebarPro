'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Crop, Eraser, Undo2, Wand2 } from 'lucide-react'

// Edits a photo on the whiteboard: crop it, or remove its background.
//
// Background removal is colour-based (a "magic eraser"): click the background
// and every connected area of a similar colour becomes transparent. That works
// well for plain walls, sky, white or studio backdrops; it is not an AI cut-out
// for busy backgrounds. All of it runs in the browser; the photo is not sent
// to any outside service.

const CHECKER = 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 50% / 16px 16px'

type Mode = 'crop' | 'bg'

export default function ImageEditor({ url, initialMode = 'crop', onApply, onClose }: { url: string; initialMode?: Mode; onApply: (blob: Blob) => Promise<void>; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const work = useRef<HTMLCanvasElement | null>(null)
  const history = useRef<ImageData[]>([])
  const [mode, setMode] = useState<Mode>(initialMode)
  const [tolerance, setTolerance] = useState(28)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [sel, setSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const drag = useRef<{ x: number; y: number } | null>(null)

  function paint() {
    const c = canvas.current, w = work.current
    if (!c || !w) return
    c.width = w.width; c.height = w.height
    c.getContext('2d')!.drawImage(w, 0, 0)
  }

  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      const w = document.createElement('canvas')
      w.width = img.naturalWidth; w.height = img.naturalHeight
      w.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0)
      work.current = w
      setSize({ w: w.width, h: w.height })
    }
    img.onerror = () => alive && setError('Could not load this picture.')
    img.src = url
    return () => { alive = false }
  }, [url])

  useEffect(() => { if (size) paint() }, [size])

  function snapshot() {
    const w = work.current!
    history.current.push(w.getContext('2d')!.getImageData(0, 0, w.width, w.height))
    if (history.current.length > 12) history.current.shift()
    setCanUndo(true)
  }

  function undo() {
    const w = work.current, last = history.current.pop()
    if (!w || !last) return
    w.width = last.width; w.height = last.height
    w.getContext('2d')!.putImageData(last, 0, 0)
    setSize({ w: w.width, h: w.height })
    paint()
    setSel(null)
    setCanUndo(history.current.length > 0)
  }

  // Makes the area connected to (sx, sy) transparent where colours are close.
  function floodClear(data: ImageData, sx: number, sy: number) {
    const { width: W, height: H, data: px } = data
    const i0 = (sy * W + sx) * 4
    if (px[i0 + 3] === 0) return
    const r0 = px[i0], g0 = px[i0 + 1], b0 = px[i0 + 2]
    const limit = tolerance * 4.41
    const seen = new Uint8Array(W * H)
    const stack = [sy * W + sx]
    seen[sy * W + sx] = 1
    while (stack.length) {
      const p = stack.pop()!
      const i = p * 4
      const d = Math.hypot(px[i] - r0, px[i + 1] - g0, px[i + 2] - b0)
      if (d > limit) continue
      px[i + 3] = 0
      const x = p % W, y = (p - x) / W
      if (x > 0 && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1) }
      if (x < W - 1 && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1) }
      if (y > 0 && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W) }
      if (y < H - 1 && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W) }
    }
  }

  function toImagePoint(e: React.PointerEvent) {
    const c = canvas.current!
    const r = c.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(c.width - 1, Math.floor(((e.clientX - r.left) / r.width) * c.width))),
      y: Math.max(0, Math.min(c.height - 1, Math.floor(((e.clientY - r.top) / r.height) * c.height))),
    }
  }

  function onDown(e: React.PointerEvent) {
    if (!work.current) return
    const p = toImagePoint(e)
    if (mode === 'bg') {
      snapshot()
      const ctx = work.current.getContext('2d', { willReadFrequently: true })!
      const data = ctx.getImageData(0, 0, work.current.width, work.current.height)
      floodClear(data, p.x, p.y)
      ctx.putImageData(data, 0, 0)
      paint()
      return
    }
    drag.current = p
    setSel({ x: p.x, y: p.y, w: 0, h: 0 })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (mode !== 'crop' || !drag.current) return
    const p = toImagePoint(e), s = drag.current
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  function onUp() { drag.current = null }

  // Clear the four corners' backgrounds in one go.
  function autoEdges() {
    const w = work.current
    if (!w) return
    snapshot()
    const ctx = w.getContext('2d', { willReadFrequently: true })!
    const data = ctx.getImageData(0, 0, w.width, w.height)
    for (const [x, y] of [[0, 0], [w.width - 1, 0], [0, w.height - 1], [w.width - 1, w.height - 1]]) floodClear(data, x, y)
    ctx.putImageData(data, 0, 0)
    paint()
  }

  function applyCrop() {
    const w = work.current
    if (!w || !sel || sel.w < 8 || sel.h < 8) return
    snapshot()
    const out = document.createElement('canvas')
    out.width = sel.w; out.height = sel.h
    out.getContext('2d')!.drawImage(w, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h)
    work.current = out
    setSize({ w: out.width, h: out.height })
    setSel(null)
  }

  async function apply() {
    let w = work.current
    if (!w) return
    setBusy(true)
    // A selection that has not been confirmed yet is applied now: pressing "Use this picture" crops to it.
    if (mode === 'crop' && sel && sel.w >= 8 && sel.h >= 8) {
      const out = document.createElement('canvas')
      out.width = sel.w; out.height = sel.h
      out.getContext('2d')!.drawImage(w, sel.x, sel.y, sel.w, sel.h, 0, 0, sel.w, sel.h)
      w = out
    }
    let blob: Blob | null = null
    try { blob = await new Promise<Blob | null>((res, rej) => { try { w!.toBlob(res, 'image/png') } catch (e) { rej(e) } }) } catch { blob = null }
    if (!blob) { setBusy(false); setError('Could not save the picture.'); return }
    try { await onApply(blob) } catch (err: any) { setError(err?.message ?? 'Could not save.'); setBusy(false) }
  }

  const tab = (m: Mode, label: string, Icon: typeof Crop) => (
    <button type="button" onClick={() => { setMode(m); setSel(null) }} className={`px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 ${mode === m ? 'bg-white shadow-sm' : 'text-gray-500'}`}><Icon className="w-4 h-4" /> {label}</button>
  )

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-bold text-lg">Edit picture</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b bg-gray-50">
          <div className="inline-flex rounded-lg bg-gray-200 p-1">{tab('bg', 'Remove background', Eraser)}{tab('crop', 'Crop', Crop)}</div>
          {mode === 'bg' && (
            <>
              <label className="flex items-center gap-2 text-sm">Tolerance
                <input type="range" min={3} max={80} value={tolerance} onChange={e => setTolerance(Number(e.target.value))} className="w-32" />
                <span className="w-6 tabular-nums text-gray-500">{tolerance}</span>
              </label>
              <button type="button" onClick={autoEdges} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"><Wand2 className="w-4 h-4" /> Clear edges</button>
            </>
          )}
          {mode === 'crop' && <button type="button" onClick={applyCrop} disabled={!sel || sel.w < 8 || sel.h < 8} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40">Crop to selection</button>}
          <button type="button" onClick={undo} disabled={!canUndo} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40"><Undo2 className="w-4 h-4" /> Undo</button>
        </div>
        <p className="px-5 pt-2 text-xs text-gray-500">
          {mode === 'bg' ? 'Click the background to remove it. Click again for other areas; raise the tolerance if some of it is left. Works best on plain backgrounds.' : 'Drag over the part of the picture to keep, then press “Use this picture” (or “Crop to selection” first to keep editing).'}
        </p>
        <div className="flex-1 overflow-auto p-5 flex justify-center">
          {error ? <p className="text-sm text-red-600">{error}</p> : (
            <div className="relative inline-block max-w-full select-none" style={{ background: CHECKER }}>
              <canvas ref={canvas} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} className="block max-w-full max-h-[55vh] w-auto h-auto" style={{ cursor: mode === 'bg' ? 'crosshair' : 'crosshair', touchAction: 'none' }} />
              {mode === 'crop' && sel && size && sel.w > 0 && (
                <div className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none" style={{ left: `${(sel.x / size.w) * 100}%`, top: `${(sel.y / size.h) * 100}%`, width: `${(sel.w / size.w) * 100}%`, height: `${(sel.h / size.h) * 100}%` }} />
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
          <button type="button" onClick={apply} disabled={busy || !size} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Use this picture'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
