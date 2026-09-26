'use client'

import { guard } from '../feedback'
import { useState } from 'react'
import { Package, Truck, HelpCircle, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { updateMonthlyTarget, copyTargetsFromMonth } from '../actions'

type Project = { id: number; name: string; status: string; type_id: number | null }
type ProjectType = { id: number; name: string }
type MonthlyTarget = { id: number; project_id: number; month: string; production_target: number | null; delivery_target: number | null; general_target: number | null }
type Claim = { id: number; project_id: number; type: 'Production' | 'Delivery' | 'General'; volume_or_trips: number; date: string }

function monthLabel(d: Date) { return d.toLocaleString(undefined, { month: 'long', year: 'numeric' }) }
function monthStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function TargetsClient({ projects, projectTypes, targets, claims }: {
  projects: Project[]; projectTypes: ProjectType[]; targets: MonthlyTarget[]; claims: Claim[]
}) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [saved, setSaved] = useState(false)
  const [copying, setCopying] = useState(false)

  const currentMonthStr = monthStr(currentDate)
  const typeNameById = new Map(projectTypes.map(t => [t.id, t.name]))
  const targetsByProjectMonth = new Map(targets.filter(t => t.month === currentMonthStr).map(t => [t.project_id, t]))
  const monthClaims = claims.filter(c => c.date && c.date.startsWith(currentMonthStr))

  const getTarget = (projectId: number, field: 'production_target' | 'delivery_target' | 'general_target') =>
    targetsByProjectMonth.get(projectId)?.[field] ?? 0

  // Hide archived projects unless they still have a target or claims this month.
  const visibleProjects = projects.filter(p => {
    if (p.status === 'Active') return true
    const t = targetsByProjectMonth.get(p.id)
    const hasTarget = !!t && ((t.production_target || 0) > 0 || (t.delivery_target || 0) > 0 || (t.general_target || 0) > 0)
    const hasClaims = monthClaims.some(c => c.project_id === p.id)
    return hasTarget || hasClaims
  })

  const sortedProjects = [...visibleProjects].sort((a, b) => {
    const typeCompare = (typeNameById.get(a.type_id!) || '').localeCompare(typeNameById.get(b.type_id!) || '')
    if (typeCompare !== 0) return typeCompare
    return a.name.localeCompare(b.name)
  })

  const totals = { totalProd: 0, totalDel: 0, totalGen: 0 }
  visibleProjects.forEach(p => {
    totals.totalProd += getTarget(p.id, 'production_target')
    totals.totalDel += getTarget(p.id, 'delivery_target')
    totals.totalGen += getTarget(p.id, 'general_target')
  })

  const claimVolumes = { prodVol: 0, delVol: 0, genVol: 0 }
  monthClaims.forEach(c => {
    if (c.type === 'Production') claimVolumes.prodVol += c.volume_or_trips || 0
    if (c.type === 'Delivery') claimVolumes.delVol += c.volume_or_trips || 0
    if (c.type === 'General') claimVolumes.genVol += c.volume_or_trips || 0
  })

  const projectVolumes = new Map<number, { prod: number; del: number; gen: number }>()
  visibleProjects.forEach(p => {
    const vol = { prod: 0, del: 0, gen: 0 }
    monthClaims.filter(c => c.project_id === p.id).forEach(c => {
      if (c.type === 'Production') vol.prod += c.volume_or_trips || 0
      if (c.type === 'Delivery') vol.del += c.volume_or_trips || 0
      if (c.type === 'General') vol.gen += c.volume_or_trips || 0
    })
    projectVolumes.set(p.id, vol)
  })

  const pct = (actual: number, target: number) => (target ? Math.round((actual / target) * 100) : null)
  const PctBadge = ({ actual, target }: { actual: number; target: number }) => {
    const p = pct(actual, target)
    if (p === null) return <span className="text-gray-400 text-xs">—</span>
    const cls = p >= 100 ? 'text-green-600' : p >= 70 ? 'text-amber-600' : 'text-red-600'
    return <span className={`font-bold text-xs ${cls}`}>{p}%</span>
  }

  const handleUpdate = (projectId: number, field: 'production_target' | 'delivery_target' | 'general_target', value: string) =>
    guard(() => updateMonthlyTarget(projectId, currentMonthStr, field, Number(value) || 0))

  const handleCopyFromPrevious = async () => {
    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    setCopying(true)
    try {
      await copyTargetsFromMonth(monthStr(prev), currentMonthStr)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center">
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft className="w-5 h-5" /></button>
          <h3 className="font-bold w-44 text-center">{monthLabel(currentDate)}</h3>
          <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopyFromPrevious} disabled={copying} className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50">{copying ? 'Copying...' : 'Copy from Previous Month'}</button>
          {saved && <span className="text-green-600 flex items-center gap-1 text-sm"><Save className="w-3.5 h-3.5" /> Saved!</span>}
        </div>
      </div>

      <div className="flex gap-4 mb-5 flex-wrap">
        {[
          { label: 'Total Production Target', icon: <Package className="w-4 h-4" />, target: totals.totalProd, actual: claimVolumes.prodVol, color: 'text-indigo-600' },
          { label: 'Total Delivery Target', icon: <Truck className="w-4 h-4" />, target: totals.totalDel, actual: claimVolumes.delVol, color: 'text-green-600' },
          { label: 'Total General Target', icon: <HelpCircle className="w-4 h-4" />, target: totals.totalGen, actual: claimVolumes.genVol, color: 'text-amber-600' },
        ].map(({ label, icon, target, actual, color }) => (
          <div key={label} className="flex-1 min-w-[200px] bg-gray-50 border rounded-lg px-4 py-3 flex flex-col gap-1">
            <div className={`flex items-center gap-1.5 font-semibold text-sm ${color}`}>{icon} {label}</div>
            <div className={`text-2xl font-extrabold ${color}`}>{target.toLocaleString()}</div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Actual: <strong className="text-gray-800">{actual.toLocaleString()}</strong></span>
              <PctBadge actual={actual} target={target} />
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase text-left border-b">
              <th className="pb-2">Project</th>
              <th className="bg-indigo-50">Production Target (m³)</th>
              <th className="bg-indigo-50 text-[0.68rem]">Actual Vol / %</th>
              <th className="bg-green-50">Delivery Target (m³)</th>
              <th className="bg-green-50 text-[0.68rem]">Actual Vol / %</th>
              <th className="bg-amber-50">General Target (m³)</th>
              <th className="bg-amber-50 text-[0.68rem]">Actual Vol / %</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-indigo-50/60 font-bold">
              <td className="text-indigo-700 py-2">TOTAL</td>
              <td className="text-indigo-700 bg-indigo-50">{totals.totalProd.toLocaleString()}</td>
              <td className="bg-indigo-50">{claimVolumes.prodVol.toLocaleString()} <PctBadge actual={claimVolumes.prodVol} target={totals.totalProd} /></td>
              <td className="text-green-700 bg-green-50">{totals.totalDel.toLocaleString()}</td>
              <td className="bg-green-50">{claimVolumes.delVol.toLocaleString()} <PctBadge actual={claimVolumes.delVol} target={totals.totalDel} /></td>
              <td className="text-amber-700 bg-amber-50">{totals.totalGen.toLocaleString()}</td>
              <td className="bg-amber-50">{claimVolumes.genVol.toLocaleString()} <PctBadge actual={claimVolumes.genVol} target={totals.totalGen} /></td>
            </tr>
            {sortedProjects.map(p => {
              const prodTgt = getTarget(p.id, 'production_target')
              const delTgt = getTarget(p.id, 'delivery_target')
              const genTgt = getTarget(p.id, 'general_target')
              const vol = projectVolumes.get(p.id) || { prod: 0, del: 0, gen: 0 }
              const typeName = typeNameById.get(p.type_id!) || ''
              return (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2">
                    <div className="font-semibold">{p.name}</div>
                    {typeName && <div className="text-xs text-gray-400">{typeName}</div>}
                  </td>
                  <td className="bg-indigo-50/30"><input type="number" defaultValue={prodTgt} onBlur={e => handleUpdate(p.id, 'production_target', e.target.value)} className="border rounded px-2 py-1 w-28" /></td>
                  <td className="bg-indigo-50/30 whitespace-nowrap">{vol.prod.toLocaleString()} <PctBadge actual={vol.prod} target={prodTgt} /></td>
                  <td className="bg-green-50/30"><input type="number" defaultValue={delTgt} onBlur={e => handleUpdate(p.id, 'delivery_target', e.target.value)} className="border rounded px-2 py-1 w-28" /></td>
                  <td className="bg-green-50/30 whitespace-nowrap">{vol.del.toLocaleString()} <PctBadge actual={vol.del} target={delTgt} /></td>
                  <td className="bg-amber-50/30"><input type="number" defaultValue={genTgt} onBlur={e => handleUpdate(p.id, 'general_target', e.target.value)} className="border rounded px-2 py-1 w-28" /></td>
                  <td className="bg-amber-50/30 whitespace-nowrap">{vol.gen.toLocaleString()} <PctBadge actual={vol.gen} target={genTgt} /></td>
                </tr>
              )
            })}
            {visibleProjects.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-4">No projects configured. Add projects in Configuration.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4">Targets are saved automatically when you leave the field. &quot;Actual Vol / %&quot; is computed live from claims data.</p>
    </div>
  )
}
