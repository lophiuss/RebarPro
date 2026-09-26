'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

type Worker = { id: number; worker_no: string | null; name: string; line: string | null; supervisor_id: number | null }
export type Movement = {
  id: number; worker_id: number; effective_date: string
  from_supervisor_id: number | null; to_supervisor_id: number | null
  from_line: string | null; to_line: string | null
  changed_by: string | null; created_at: string
}

function shiftMonth(month: string, delta: number) { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(month: string) { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
function todayMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
// A stable pastel per supervisor so the same person is the same colour everywhere.
const colorOf = (id: number) => `hsl(${(id * 47) % 360} 70% 88%)`
const shortName = (n: string) => { const w = n.trim().split(/\s+/)[0] || n; return w.length > 7 ? w.slice(0, 7) : w }

export default function MovementView({ workers, movements, supervisorNames }: {
  workers: Worker[]; movements: Movement[]; supervisorNames: Record<number, string>
}) {
  const [month, setMonth] = useState(todayMonth())
  const [search, setSearch] = useState('')
  const [movedOnly, setMovedOnly] = useState(false)
  // Widths (px) of the first three columns — drag a header's right edge to resize.
  const [colW, setColW] = useState({ id: 70, name: 150, dept: 100 })
  function startResize(key: 'id' | 'name' | 'dept', e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colW[key]
    const move = (ev: MouseEvent) => setColW(prev => ({ ...prev, [key]: Math.max(40, startW + ev.clientX - startX) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }
  const grip = (key: 'id' | 'name' | 'dept') => <span onMouseDown={e => startResize(key, e)} className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300" />

  const supName = (id: number | null) => (id == null ? '—' : supervisorNames[id] || `#${id}`)
  const [y, m] = month.split('-').map(Number)
  const dayCount = new Date(y, m, 0).getDate()
  const days = Array.from({ length: dayCount }, (_, i) => i + 1)
  const isoOf = (d: number) => `${month}-${String(d).padStart(2, '0')}`

  const byWorker = new Map<number, Movement[]>()
  for (const mv of movements) { if (!byWorker.has(mv.worker_id)) byWorker.set(mv.worker_id, []); byWorker.get(mv.worker_id)!.push(mv) }
  for (const list of byWorker.values()) list.sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at))

  // Supervisor on a given date = the "to" of the latest movement on/before it.
  // Before a worker's first recorded movement, that movement's "from"; with no
  // movements at all, they have never changed, so today's supervisor applies.
  function supervisorOn(w: Worker, iso: string): number | null {
    const list = byWorker.get(w.id)
    if (!list || list.length === 0) return w.supervisor_id
    let cur: number | null = list[0].from_supervisor_id
    for (const mv of list) { if (mv.effective_date <= iso) cur = mv.to_supervisor_id; else break }
    return cur
  }

  const s = search.trim().toLowerCase()
  const rows = workers
    .filter(w => !s || w.name.toLowerCase().includes(s) || (w.worker_no || '').toLowerCase().includes(s))
    .map(w => ({ w, cells: days.map(d => supervisorOn(w, isoOf(d))) }))
    .filter(r => !movedOnly || new Set(r.cells).size > 1)

  const legendIds = [...new Set(rows.flatMap(r => r.cells).filter((x): x is number => x != null))]
  const workerById = new Map(workers.map(w => [w.id, w]))
  const history = movements
    .filter(mv => { const w = workerById.get(mv.worker_id); return !s || (w && (w.name.toLowerCase().includes(s) || (w.worker_no || '').toLowerCase().includes(s))) })
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at))

  const th = 'sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_#e5e7eb]'
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronLeft className="w-5 h-5" /></button>
          <span className="font-semibold px-2 w-36 text-center">{monthLabel(month)}</span>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 hover:bg-gray-100 rounded"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ID..." className="border rounded-md pl-8 pr-3 py-1.5 text-sm w-52" />
        </div>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" checked={movedOnly} onChange={e => setMovedOnly(e.target.checked)} /> Only workers who changed supervisor this month</label>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {legendIds.map(id => (
          <span key={id} className="text-[11px] px-2 py-0.5 rounded border border-gray-200" style={{ background: colorOf(id) }}>{supName(id)}</span>
        ))}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-auto max-h-[60vh] mb-6">
        <table className="text-[11px] border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: colW.id }} /><col style={{ width: colW.name }} /><col style={{ width: colW.dept }} />{days.map(d => <col key={d} style={{ width: 56 }} />)}</colgroup>
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-30 px-2 py-1 text-left`}>ID{grip('id')}</th>
              <th style={{ left: colW.id }} className={`${th} sticky z-30 px-2 py-1 text-left`}>Worker{grip('name')}</th>
              <th className={`${th} px-2 py-1 text-left`}>Dept{grip('dept')}</th>
              {days.map(d => <th key={d} className={`${th} px-0.5 py-1 text-center font-normal`}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, cells }) => (
              <tr key={w.id} className="border-b border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-2 py-0.5 text-gray-500 truncate">{w.worker_no || '-'}</td>
                <td style={{ left: colW.id }} className="sticky z-10 bg-white px-2 py-0.5 font-medium truncate" title={w.name}>{w.name}</td>
                <td className="px-2 py-0.5 text-gray-500 truncate">{w.line || '-'}</td>
                {cells.map((sid, i) => (
                  <td key={i} className="px-0.5 py-0.5 text-center whitespace-nowrap" style={sid != null ? { background: colorOf(sid) } : undefined} title={`${w.name} · ${isoOf(days[i])} · ${supName(sid)}`}>
                    {sid != null ? shortName(supName(sid)) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={99} className="text-center text-gray-400 py-8">No workers found.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3 className="font-bold mb-2 text-sm">Change History</h3>
      <div className="bg-white border rounded-xl shadow-sm overflow-auto max-h-[40vh]">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              {['Effective', 'Worker', 'Supervisor', 'Department', 'Changed by'].map(h => <th key={h} className={`${th} px-2 py-1.5 text-left`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {history.map(mv => {
              const w = workerById.get(mv.worker_id)
              const supChanged = mv.from_supervisor_id !== mv.to_supervisor_id
              const lineChanged = (mv.from_line || '') !== (mv.to_line || '')
              return (
                <tr key={mv.id} className="border-b border-gray-100">
                  <td className="px-2 py-1 whitespace-nowrap">{mv.effective_date}</td>
                  <td className="px-2 py-1 font-medium whitespace-nowrap">{w?.name || `#${mv.worker_id}`}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{supChanged ? <>{supName(mv.from_supervisor_id)} → <strong>{supName(mv.to_supervisor_id)}</strong></> : <span className="text-gray-400">unchanged</span>}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{lineChanged ? <>{mv.from_line || '—'} → <strong>{mv.to_line || '—'}</strong></> : <span className="text-gray-400">{mv.to_line || '—'}</span>}</td>
                  <td className="px-2 py-1 text-gray-500 whitespace-nowrap">{mv.changed_by || '-'}</td>
                </tr>
              )
            })}
            {history.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No supervisor or department changes recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">History starts from when this log was introduced — changes made before then aren&apos;t recorded, and the earliest rows may not know the previous supervisor.</p>
    </>
  )
}
