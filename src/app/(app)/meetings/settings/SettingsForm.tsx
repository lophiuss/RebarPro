'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react'
import { saveDefaultAgenda, saveCoreValues } from '../actions'
import { PAGE_LABEL, type PageType } from '@/lib/meetings'

type Row = { page_type: PageType; title: string; minutes: number }

export function CoreValuesForm({ initial }: { initial: string[] }) {
  const [values, setValues] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function patch(i: number, v: string) {
    setValues(values.map((x, idx) => (idx === i ? v : x)))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      await saveCoreValues(values)
      setValues(values.map(v => v.trim()).filter(Boolean))
      setSaved(true)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded-xl bg-white">
      <ol className="divide-y">
        {values.map((v, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <span className="w-5 text-sm text-gray-400 tabular-nums">{i + 1}.</span>
            <input value={v} onChange={e => patch(i, e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm" aria-label={`Core value ${i + 1}`} />
            <button onClick={() => { setValues(values.filter((_, idx) => idx !== i)); setSaved(false) }} aria-label="Remove" className="text-gray-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
          </li>
        ))}
        {values.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">No core values yet.</li>}
      </ol>
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 rounded-b-xl">
        <button onClick={() => { setValues([...values, '']); setSaved(false) }} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4" /> Add value</button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-700">Saved</span>}
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsForm({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function patch(i: number, p: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
    setSaved(false)
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      await saveDefaultAgenda(rows)
      setSaved(true)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const total = rows.reduce((s, r) => s + (Number(r.minutes) || 0), 0)

  return (
    <div className="border rounded-xl bg-white">
      <ul className="divide-y">
        {rows.map((r, i) => (
          <li key={r.page_type} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
              <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down" className="text-gray-400 hover:text-gray-800 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
            </div>
            <div className="w-40 text-xs text-gray-500 hidden sm:block">{PAGE_LABEL[r.page_type]}</div>
            <input value={r.title} onChange={e => patch(i, { title: e.target.value })} className="flex-1 border rounded-lg px-3 py-2 text-sm" aria-label="Title" />
            <label className="flex items-center gap-1 text-sm text-gray-600">
              <input type="number" min={0} value={r.minutes} onChange={e => patch(i, { minutes: Number(e.target.value) })} className="w-16 border rounded-lg px-2 py-2 text-sm text-right" aria-label="Minutes" /> min
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 rounded-b-xl">
        <span className="text-sm text-gray-600">Total {total} min</span>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-700">Saved</span>}
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
