'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, XCircle, X } from 'lucide-react'

// Shared "did my click actually do something?" feedback for the whole HR
// module. Every save/bulk action goes through guard(): a thin progress bar
// runs across the top and a toast shows Saving… → ✓ Saved (or the error,
// which stays until dismissed) — replacing the silent success / blocking
// alert() the individual pages used before.

type Toast = { id: number; kind: 'pending' | 'ok' | 'error'; text: string }
let toasts: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())
function setToast(id: number, patch: Partial<Toast> | null) {
  toasts = patch ? toasts.map(t => (t.id === id ? { ...t, ...patch } : t)) : toasts.filter(t => t.id !== id)
  emit()
}

export async function guard(fn: () => Promise<any>, label = 'Saving…'): Promise<any> {
  const id = ++seq
  toasts = [...toasts, { id, kind: 'pending', text: label }]
  emit()
  try {
    const result = await fn()
    setToast(id, { kind: 'ok', text: 'Saved' })
    setTimeout(() => setToast(id, null), 1600)
    return result
  } catch (err: any) {
    setToast(id, { kind: 'error', text: err?.message || 'Something went wrong' })
    return undefined
  }
}

export function ActionToaster() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(n => n + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  const pending = toasts.some(t => t.kind === 'pending')
  return (
    <>
      <style>{`
        @keyframes pp-bar { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }
        @keyframes pp-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
      {pending && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] overflow-hidden bg-indigo-100">
          <div className="h-full w-1/3 bg-indigo-600" style={{ animation: 'pp-bar 1s ease-in-out infinite' }} />
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} style={{ animation: 'pp-in .18s ease-out' }} className={`pointer-events-auto flex items-center gap-2 text-sm font-medium rounded-lg shadow-lg px-3 py-2 max-w-xs ${t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'ok' ? 'bg-green-600 text-white' : 'bg-slate-800 text-white'}`}>
            {t.kind === 'pending' ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" /> : t.kind === 'ok' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
            <span className="min-w-0 break-words">{t.text}</span>
            {t.kind === 'error' && <button onClick={() => setToast(t.id, null)} className="ml-1 opacity-80 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>}
          </div>
        ))}
      </div>
    </>
  )
}

// Drag-to-resize column widths (px). Give each <th> {grip('key')} and drive
// <col style={{ width: colW.key }} /> from the returned map.
export function useColResize(initial: Record<string, number>, min = 30) {
  const [colW, setColW] = useState(initial)
  function start(key: string, e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colW[key] ?? 100
    const move = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(min, startW + ev.clientX - startX) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const grip = (key: string) => <span onMouseDown={e => start(key, e)} onClick={e => e.stopPropagation()} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300" />
  return { colW, grip }
}
