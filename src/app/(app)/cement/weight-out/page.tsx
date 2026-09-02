'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Scale } from 'lucide-react'

type Row = {
  id: number
  weigh_date: string
  lorry_no: string
  do_number: string
  material: string | null
  discharge_to: string | null
  do_weight: number
  weight_in: number
}

export default function WeightOutPage() {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [inputs, setInputs] = useState<Record<number, string>>({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('cement_weight_in')
      .select('id, weigh_date, lorry_no, do_number, material, discharge_to, do_weight, weight_in')
      .not('unload_complete_time', 'is', null)
      .is('weight_out', null)
      .order('weigh_date', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  function diffFor(r: Row) {
    const weightOut = Number(inputs[r.id])
    if (!weightOut) return null
    const target = r.weight_in - r.do_weight
    const diff = weightOut - target
    const diffPct = r.do_weight ? (diff / r.do_weight) * 100 : 0
    return { diff, diffPct }
  }

  async function submit(r: Row) {
    const weightOut = Number(inputs[r.id])
    if (!weightOut || weightOut <= 0) { alert('Invalid weight'); return }
    if (weightOut > r.weight_in) { alert('Weight Out cannot exceed Weight In'); return }

    const target = r.weight_in - r.do_weight
    const diff = weightOut - target
    const diffPct = r.do_weight ? diff / r.do_weight : 0

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).single()
    const operatorName = profile?.full_name || user?.email || 'unknown'

    const { error } = await supabase.from('cement_weight_in').update({
      target_weight_out: target,
      weight_out: weightOut,
      difference: diff,
      difference_pct: diffPct,
      weight_out_operator: operatorName,
      weight_out_time: new Date().toISOString(),
    }).eq('id', r.id)

    if (error) { alert('Failed to save Weight Out: ' + error.message); return }
    alert('✅ Weight Out completed')
    load()
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Scale className="w-7 h-7 text-blue-600" /> Weight Out</h1>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lorry No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO No</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discharge To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">DO Weight</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight In</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target WO</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Weight Out</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diff</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Diff %</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map(r => {
              const target = r.weight_in - r.do_weight
              const d = diffFor(r)
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.weigh_date}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.lorry_no}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_number}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.material || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.discharge_to || '-'}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.do_weight}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{r.weight_in}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">{target}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <input
                      type="number" min={1} className="w-24 border rounded-md px-2 py-1.5 text-sm"
                      value={inputs[r.id] || ''}
                      onChange={e => setInputs({ ...inputs, [r.id]: e.target.value })}
                    />
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${d ? (d.diff > 0 ? 'text-green-600' : d.diff < 0 ? 'text-red-600' : '') : ''}`}>
                    {d ? d.diff.toFixed(2) : '–'}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${d ? (d.diffPct > 0 ? 'text-green-600' : d.diffPct < 0 ? 'text-red-600' : '') : ''}`}>
                    {d ? d.diffPct.toFixed(2) + '%' : '–'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => submit(r)} className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700">Weight Out</button>
                  </td>
                </tr>
              )
            })}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-6 text-center text-gray-500">No pending Weight Out</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
