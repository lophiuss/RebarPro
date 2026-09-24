export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { FileBarChart } from 'lucide-react'

const CATEGORY_LABEL: Record<string, string> = {
  fabrication: 'Fabrication', change: 'Change', maintenance: 'Maintenance', operational: 'Operational (project)',
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7) // 'YYYY-MM'
}

function last6Months() {
  const months: string[] = []
  const d = new Date()
  for (let i = 0; i < 6; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return months.reverse()
}

export default async function MouldReportPage() {
  const supabase = await createClient()
  const months = last6Months()
  const earliestMonth = months[0]

  const [{ data: jobs }, { data: entries }, { data: projects }] = await Promise.all([
    supabase
      .from('mould_jobs')
      .select('job_type, cost_center, project_id, completed_on, material_cost_snapshot, scrap_value_snapshot')
      .eq('status', 'completed')
      .gte('completed_on', `${earliestMonth}-01`),
    supabase
      .from('mould_time_entries')
      .select('work_date, cost_target, labour_cost, project_id, job:mould_jobs(job_type, project_id, cost_center)')
      .gte('work_date', `${earliestMonth}-01`),
    supabase.from('plantpro_projects').select('id, name').order('name'),
  ])

  const projectName = new Map((projects || []).map(p => [p.id, p.name]))

  // matrix[rowKey][month] = total RM; rowKey is a project id (as string) or 'factory'
  const matrix = new Map<string, Map<string, number>>()
  // byCategory[category][month] = total RM, across all projects — the split view
  const byCategory = new Map<string, Map<string, number>>()

  function addTo(map: Map<string, Map<string, number>>, key: string, month: string, amount: number) {
    if (!map.has(key)) map.set(key, new Map())
    const row = map.get(key)!
    row.set(month, (row.get(month) || 0) + amount)
  }

  for (const j of jobs || []) {
    if (!j.completed_on) continue
    const m = monthKey(j.completed_on)
    if (!months.includes(m)) continue
    const cost = (j.material_cost_snapshot || 0) - (j.scrap_value_snapshot || 0)
    const rowKey = j.cost_center === 'factory' || !j.project_id ? 'factory' : String(j.project_id)
    addTo(matrix, rowKey, m, cost)
    const category = j.job_type === 'decommission' ? 'maintenance' : j.job_type // scrap nets against maintenance/decommission bucket
    addTo(byCategory, category, m, cost)
  }

  for (const e of entries || []) {
    const m = monthKey(e.work_date)
    if (!months.includes(m)) continue
    const cost = e.labour_cost || 0
    if (e.cost_target === 'factory') {
      addTo(matrix, 'factory', m, cost)
      addTo(byCategory, 'factory', m, cost)
    } else if (e.cost_target === 'project') {
      const rowKey = e.project_id ? String(e.project_id) : 'factory'
      addTo(matrix, rowKey, m, cost)
      addTo(byCategory, 'operational', m, cost)
    } else if (e.cost_target === 'mould') {
      const job = e.job as any
      const rowKey = job?.cost_center === 'factory' || !job?.project_id ? 'factory' : String(job.project_id)
      addTo(matrix, rowKey, m, cost)
      const category = job?.job_type === 'decommission' ? 'maintenance' : (job?.job_type || 'maintenance')
      addTo(byCategory, category, m, cost)
    }
  }

  const projectRowKeys = [...matrix.keys()].filter(k => k !== 'factory').sort((a, b) => (projectName.get(Number(a)) || '').localeCompare(projectName.get(Number(b)) || ''))
  const rowKeys = [...projectRowKeys, 'factory']
  const categoryKeys = ['fabrication', 'change', 'maintenance', 'operational', 'factory']

  function cell(map: Map<string, Map<string, number>>, key: string, month: string) {
    return map.get(key)?.get(month) || 0
  }
  function rowTotal(map: Map<string, Map<string, number>>, key: string) {
    return months.reduce((s, m) => s + cell(map, key, m), 0)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><FileBarChart className="w-7 h-7 text-teal-600" /> Mould Cost — Monthly Report</h1>
      <p className="text-sm text-amber-600 mb-6">
        ⚠ Labour cost uses the provisional labour rate in Settings until real per-worker wages are connected — treat
        totals as indicative, not final payroll figures.
      </p>

      <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">By Project</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-8">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Project</th>
              {months.map(m => <th key={m} className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{m}</th>)}
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rowKeys.map(key => (
              <tr key={key} className={key === 'factory' ? 'bg-gray-50 font-medium' : 'hover:bg-gray-50'}>
                <td className="px-3 py-2 font-medium whitespace-nowrap sticky left-0 bg-inherit">{key === 'factory' ? 'Factory (unallocated / idle)' : (projectName.get(Number(key)) || `#${key}`)}</td>
                {months.map(m => <td key={m} className="px-3 py-2 text-right whitespace-nowrap">{cell(matrix, key, m) ? `RM ${cell(matrix, key, m).toFixed(0)}` : '-'}</td>)}
                <td className="px-3 py-2 text-right whitespace-nowrap font-bold">RM {rowTotal(matrix, key).toFixed(0)}</td>
              </tr>
            ))}
            {rowKeys.length === 0 && <tr><td colSpan={months.length + 2} className="px-4 py-8 text-center text-gray-500">No mould cost recorded in the last 6 months yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold text-gray-500 uppercase mb-2">By Category (all projects)</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              {months.map(m => <th key={m} className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">{m}</th>)}
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categoryKeys.map(cat => (
              <tr key={cat} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium whitespace-nowrap">{cat === 'factory' ? 'Factory overhead' : CATEGORY_LABEL[cat]}</td>
                {months.map(m => <td key={m} className="px-3 py-2 text-right whitespace-nowrap">{cell(byCategory, cat, m) ? `RM ${cell(byCategory, cat, m).toFixed(0)}` : '-'}</td>)}
                <td className="px-3 py-2 text-right whitespace-nowrap font-bold">RM {rowTotal(byCategory, cat).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Fabrication and Change include the material cost (standard rate × weighed steel) plus labour hours logged
        against that mould&apos;s job. Operational is labour charged straight to a project (cast-in items, routine
        mould work) — see Jobs and Time Allocation to drill into what makes up any of these figures.
      </p>
    </div>
  )
}
