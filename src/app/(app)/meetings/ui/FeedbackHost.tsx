'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, HelpCircle } from 'lucide-react'
import { FEEDBACK_EVENT, hostState, type ConfirmOptions, type FeedbackEvent, type TextOptions, type ToastKind } from './feedback'

type Toast = { id: number; message: string; kind: ToastKind }
type ConfirmDlg = { type: 'confirm'; message: string; options: ConfirmOptions; resolve: (ok: boolean) => void }
type TextDlg = { type: 'text'; title: string; initial: string; options: TextOptions; resolve: (v: string | null) => void }
type Dialog = ConfirmDlg | TextDlg

const TONE: Record<ToastKind, { box: string; icon: React.ReactNode }> = {
  error: { box: 'border-red-200 bg-red-50 text-red-900', icon: <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" aria-hidden="true" /> },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" /> },
  info: { box: 'border-slate-200 bg-white text-slate-900', icon: <Info className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" /> },
}

// Anything that deletes, clears or archives gets a red button and starts on "Cancel".
const DANGER = /\b(delete|remove|clear|archive|discard|cannot be undone)\b/i

export default function FeedbackHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [queue, setQueue] = useState<Dialog[]>([])
  const [mounted, setMounted] = useState(false)
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), [])

  useEffect(() => {
    hostState.mounted = true
    setMounted(true)
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<FeedbackEvent>).detail
      if (d.type === 'toast') {
        const id = next.current++
        setToasts(t => [...t.slice(-3), { id, message: d.message, kind: d.kind }])
        setTimeout(() => dismiss(id), d.kind === 'error' ? 9000 : 5000)
      } else {
        setQueue(q => [...q, d])
      }
    }
    window.addEventListener(FEEDBACK_EVENT, onEvent)
    return () => { hostState.mounted = false; window.removeEventListener(FEEDBACK_EVENT, onEvent) }
  }, [dismiss])

  if (!mounted) return null
  const dialog = queue[0]
  const close = () => setQueue(q => q.slice(1))

  return createPortal(
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] w-[min(30rem,calc(100vw-2rem))] space-y-2 pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg text-sm leading-snug ${TONE[t.kind].box}`}>
            {TONE[t.kind].icon}
            <span className="flex-1 whitespace-pre-line break-words">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="p-1.5 -m-1.5 text-gray-500 hover:text-gray-800"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      {dialog?.type === 'confirm' && <ConfirmBox key={queue.length + dialog.message} d={dialog} done={ok => { dialog.resolve(ok); close() }} />}
      {dialog?.type === 'text' && <TextBox key={queue.length + dialog.title} d={dialog} done={v => { dialog.resolve(v); close() }} />}
    </>,
    document.body,
  )
}

function Frame({ children, label, onCancel }: { children: React.ReactNode; label: string; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-[110] bg-black/45 flex items-center justify-center p-4" onClick={onCancel}>
      <div role="alertdialog" aria-modal="true" aria-label={label} onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function ConfirmBox({ d, done }: { d: ConfirmDlg; done: (ok: boolean) => void }) {
  const danger = d.options.danger ?? DANGER.test(d.message)
  const ok = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { (danger ? cancel : ok).current?.focus() }, [danger])
  return (
    <Frame label={d.options.title ?? 'Please confirm'} onCancel={() => done(false)}>
      <div className="p-6">
        <div className="flex gap-3">
          <span className={`w-10 h-10 rounded-full inline-flex items-center justify-center shrink-0 ${danger ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            {danger ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="font-bold text-base">{d.options.title ?? (danger ? 'Are you sure?' : 'Please confirm')}</h2>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line break-words">{d.message}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t">
        <button ref={cancel} type="button" onClick={() => done(false)} className="min-h-10 px-4 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50">{d.options.cancelLabel ?? 'Cancel'}</button>
        <button ref={ok} type="button" onClick={() => done(true)} className={`min-h-10 px-5 rounded-lg text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>{d.options.confirmLabel ?? (danger ? (d.message.match(/^(Delete|Clear|Remove|Archive|Discard)/i)?.[1] ?? 'Yes, continue') : 'OK')}</button>
      </div>
    </Frame>
  )
}

function TextBox({ d, done }: { d: TextDlg; done: (v: string | null) => void }) {
  const [value, setValue] = useState(d.initial)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  return (
    <Frame label={d.title} onCancel={() => done(null)}>
      <form onSubmit={e => { e.preventDefault(); done(value.trim() ? value.trim() : null) }}>
        <div className="p-6">
          <label className="block text-sm font-semibold">{d.title}
            <input ref={input} value={value} onChange={e => setValue(e.target.value)} placeholder={d.options.placeholder} maxLength={120} className="mt-2 w-full border rounded-lg px-3 py-2.5 text-sm font-normal" />
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t">
          <button type="button" onClick={() => done(null)} className="min-h-10 px-4 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button disabled={!value.trim()} className="min-h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">{d.options.confirmLabel ?? 'Save'}</button>
        </div>
      </form>
    </Frame>
  )
}
