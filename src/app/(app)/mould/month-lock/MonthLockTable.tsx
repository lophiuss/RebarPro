'use client'

import { useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import { lockMonth, unlockMonth } from '../actions'

type Row = { period: string; status: string; locked_by: string | null; locked_at: string | null }

export default function MonthLockTable({ rows: initial, isAdmin }: { rows: Row[]; isAdmin: boolean }) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(period: string, currentlyLocked: boolean) {
    setBusy(period)
    try {
      if (currentlyLocked) {
        if (!confirm(`Unlock ${period}? This period's hours become editable again.`)) return
        await unlockMonth(period)
        setRows(rows.map(r => r.period === period ? { ...r, status: 'open', locked_by: null, locked_at: null } : r))
      } else {
        if (!confirm(`Lock ${period}? No one will be able to add, edit, or delete hours dated in this month afterward.`)) return
        await lockMonth(period)
        setRows(rows.map(r => r.period === period ? { ...r, status: 'locked' } : r))
      }
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Locked By</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => {
            const locked = r.status === 'locked'
            return (
              <tr key={r.period} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{r.period}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`text-[11px] font-bold uppercase rounded-full px-1.5 py-0.5 ${locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    {locked ? 'Locked' : 'Open'}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-500">{r.locked_by || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {isAdmin ? (
                    <button onClick={() => toggle(r.period, locked)} disabled={busy === r.period}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 ${locked ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-teal-600 text-white hover:bg-teal-700'}`}>
                      {locked ? <><Unlock className="w-3.5 h-3.5" /> Unlock</> : <><Lock className="w-3.5 h-3.5" /> Lock</>}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">Admin only</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
