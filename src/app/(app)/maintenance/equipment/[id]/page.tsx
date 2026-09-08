export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import ManualUpload from './ManualUpload'

const CONDITION_STYLE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-orange-100 text-orange-700',
  spoil: 'bg-red-100 text-red-700',
}

export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const year = new Date().getFullYear()

  const [{ data: equipment }, { data: inspections }, { data: jobReports }, { data: pmSchedule }, { data: checklistSubs }] = await Promise.all([
    supabase.from('maintenance_equipment').select('*').eq('id', id).single(),
    supabase.from('maintenance_inspections').select('*').eq('equipment_id', id).order('inspection_date', { ascending: false }).limit(50),
    supabase.from('maintenance_job_reports').select('*').eq('equipment_id', id).order('report_date', { ascending: false }).limit(50),
    supabase.from('maintenance_pm_schedule').select('week_number, planned, completed_at').eq('equipment_id', id).eq('year', year),
    supabase.from('maintenance_checklist_submissions').select('id, submission_date, done_by, verified_by').eq('equipment_id', id).order('submission_date', { ascending: false }).limit(20),
  ])

  if (!equipment) {
    return <div className="p-8 text-center text-gray-500">Equipment not found.</div>
  }

  const plannedWeeks = new Set((pmSchedule || []).filter(r => r.planned).map(r => r.week_number))
  const completedWeeks = new Set((pmSchedule || []).filter(r => r.completed_at).map(r => r.week_number))

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <Link href="/maintenance/equipment" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Equipment
      </Link>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="w-6 h-6 text-orange-600" /> {equipment.name}</h1>
            <p className="text-sm text-gray-400 mt-1">{equipment.equip_code || 'No code'} · {equipment.category || 'Uncategorized'}</p>
          </div>
          {equipment.condition && (
            <span className={`text-xs font-bold uppercase rounded-full px-3 py-1 ${CONDITION_STYLE[equipment.condition] || 'bg-gray-100 text-gray-600'}`}>{equipment.condition}</span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
          <div><span className="text-gray-400 block text-xs uppercase">Location</span>{equipment.location || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">Brand</span>{equipment.brand || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">Manager</span>{equipment.manager || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">Supervisor</span>{equipment.supervisor || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">PIC (Day)</span>{equipment.pic_day || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">PIC (Night)</span>{equipment.pic_night || '-'}</div>
          <div><span className="text-gray-400 block text-xs uppercase">Purpose</span>{equipment.purpose || '-'}</div>
        </div>
        <ManualUpload equipmentId={equipment.id} manualDriveId={equipment.manual_drive_id} />
      </div>

      <h2 className="text-lg font-bold mb-3">PM Schedule — {year}</h2>
      <div className="bg-white border rounded-xl shadow-sm p-4 mb-8 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {Array.from({ length: 52 }, (_, i) => i + 1).map(wk => {
            const planned = plannedWeeks.has(wk)
            const done = completedWeeks.has(wk)
            return (
              <div key={wk} title={`Week ${wk}${planned ? ' — PM planned' : ''}${done ? ' (completed)' : ''}`}
                className={`w-6 h-8 flex items-center justify-center rounded text-[9px] font-bold ${done ? 'bg-green-500 text-white' : planned ? 'bg-yellow-300 text-yellow-900' : 'bg-gray-100 text-gray-300'}`}>
                {wk}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-300 inline-block" /> Planned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> Completed</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-bold mb-3">Maintenance History</h2>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(inspections || []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{r.inspection_date || '-'}</td>
                    <td className="px-3 py-2">{r.condition || '-'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.remarks || '-'}</td>
                  </tr>
                ))}
                {(inspections || []).length === 0 && checklistSubs && checklistSubs.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No history yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {checklistSubs && checklistSubs.length > 0 && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-3">
              <div className="px-3 py-2 bg-gray-50 text-xs font-bold text-gray-600 uppercase">Checklist Submissions</div>
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <tbody className="divide-y divide-gray-100">
                  {checklistSubs.map((s: any) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{s.submission_date}</td>
                      <td className="px-3 py-2 text-gray-500">Done by {s.done_by || '-'}{s.verified_by ? `, verified by ${s.verified_by}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3">Maintenance Record (Job Reports)</h2>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Issue</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(jobReports || []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{r.report_date}</td>
                    <td className="px-3 py-2">{r.issue_description || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${r.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
                {(!jobReports || jobReports.length === 0) && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No job reports yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
