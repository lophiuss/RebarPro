'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { History, X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react'
import Portal from './Portal'
import { notifyError } from './feedback'
import { diffLines } from './lineDiff'
import { getItemHistory } from '../actions'
import { richToText } from '@/lib/richtext'
import type { Person } from '@/lib/meetings'

type Version = { id: string; title: string | null; details: string | null; editor_id: string | null; created_at: string }
export type RestoreTo = { title: string | null; details: string | null }

const lines = (details: string | null) => {
  const t = richToText(details)
  return t ? t.split('\n') : []
}
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Replays how an item's text changed: drag the slider along the saved edits and see each version line by
// line (green = added since the edit before, red = removed), with who made it and when.
export default function HistoryDialog({ kind, itemId, label, people, onRestore, onClose }: {
  kind: 'headline' | 'todo' | 'issue' | 'goal' | 'kpi'
  itemId: string
  label: string
  people: Person[]
  onRestore: (to: RestoreTo) => Promise<void>
  onClose: () => void
}) {
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let alive = true
    getItemHistory(kind, itemId)
      .then(v => { if (alive) { setVersions(v); setIdx(Math.max(0, v.length - 1)) } })
      .catch(err => { if (alive) { notifyError(err); setVersions([]) } })
    return () => { alive = false }
  }, [kind, itemId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const count = versions?.length ?? 0
  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setIdx(i => {
        if (i >= count - 1) { setPlaying(false); return i }
        return i + 1
      })
    }, 900)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [playing, count])

  const current = versions?.[idx] ?? null
  const previous = idx > 0 ? versions?.[idx - 1] ?? null : null
  const body = useMemo(() => {
    if (!current) return []
    const now = lines(current.details)
    return previous ? diffLines(lines(previous.details), now) : now.map(text => ({ kind: 'same' as const, text }))
  }, [current, previous])

  const editor = (v: Version) => v.editor_id ? (people.find(p => p.id === v.editor_id)?.full_name ?? 'Someone') : null
  const isLatest = idx === count - 1

  async function restore() {
    if (!current) return
    setBusy(true)
    try { await onRestore({ title: current.title, details: current.details }); onClose() } finally { setBusy(false) }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[65] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col" role="dialog" aria-label={`History of this ${label}`} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="font-bold text-lg inline-flex items-center gap-2"><History className="w-5 h-5 text-blue-600" /> History</h2>
            <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>

          {versions === null ? (
            <p className="px-5 py-10 text-sm text-gray-500 text-center">Loading history…</p>
          ) : count === 0 ? (
            <p className="px-5 py-10 text-sm text-gray-500 text-center">No edits have been recorded for this {label} yet. From the next change on, every edit is saved here.</p>
          ) : (
            <>
              <div className="px-5 pt-4 pb-3 border-b bg-gray-50 space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{current ? (editor(current) ? `Edited by ${editor(current)}` : 'Original version') : ''}</div>
                    <div className="text-xs text-gray-500">{current ? when(current.created_at) : ''}</div>
                  </div>
                  <div className="text-xs text-gray-500 shrink-0">Version {idx + 1} of {count}{isLatest ? ' (current)' : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setPlaying(false); setIdx(i => Math.max(0, i - 1)) }} disabled={idx === 0} aria-label="Earlier version" className="p-1.5 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                  <input
                    type="range" min={0} max={Math.max(0, count - 1)} step={1} value={idx}
                    onChange={e => { setPlaying(false); setIdx(Number(e.target.value)) }}
                    aria-label="Move through the edits"
                    className="flex-1 accent-blue-600"
                  />
                  <button onClick={() => { setPlaying(false); setIdx(i => Math.min(count - 1, i + 1)) }} disabled={isLatest} aria-label="Later version" className="p-1.5 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                  <button
                    onClick={() => { if (playing) setPlaying(false); else { if (isLatest) setIdx(0); setPlaying(true) } }}
                    disabled={count < 2}
                    aria-label={playing ? 'Pause' : 'Play the edits'}
                    className="p-1.5 rounded border bg-white hover:bg-gray-100 disabled:opacity-40"
                  >{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
                </div>
              </div>

              <div className="px-5 py-4 overflow-y-auto space-y-3 text-sm">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Title</div>
                  {previous && previous.title !== current?.title ? (
                    <div>
                      <div className="rounded bg-red-50 text-red-800 line-through px-2 py-1">{previous.title}</div>
                      <div className="rounded bg-green-50 text-green-900 px-2 py-1 mt-1">{current?.title}</div>
                    </div>
                  ) : (
                    <div className="px-2 py-1 font-medium">{current?.title}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Details</div>
                  {body.length === 0 ? (
                    <p className="text-gray-400 italic px-2">No details</p>
                  ) : (
                    <div className="font-mono text-[13px] leading-6 border rounded-lg overflow-hidden">
                      {body.map((l, i) => (
                        <div
                          key={i}
                          className={`px-3 whitespace-pre-wrap break-words ${l.kind === 'add' ? 'bg-green-50 text-green-900' : l.kind === 'del' ? 'bg-red-50 text-red-800 line-through' : 'text-gray-800'}`}
                        >
                          <span className="inline-block w-4 select-none text-gray-400">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}</span>{l.text || ' '}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-5 py-3 border-t flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500">{previous ? 'Green lines were added, red lines removed since the edit before.' : 'This is where the history starts.'}</span>
                <button
                  onClick={restore}
                  disabled={isLatest || busy}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
                ><RotateCcw className="w-4 h-4" /> Restore this version</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  )
}
