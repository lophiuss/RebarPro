'use client'

import { useState, useMemo } from 'react'
import { Truck, Package, CheckCircle, BarChart2, Trash2, Calendar, HelpCircle } from 'lucide-react'
import { createClaim, updateClaimField, deleteClaim } from '../actions'

type Project = { id: number; name: string; status: string }
type Claim = { id: number; project_id: number; type: 'Production' | 'Delivery' | 'General'; volume_or_trips: number; amount: number; remarks: string | null; date: string }
type ClaimType = Claim['type']

async function guard(fn: () => Promise<any>) { try { await fn() } catch (err: any) { alert('Error: ' + err.message) } }
function fmt(n: number) { return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function todayStr() { return new Date().toISOString().slice(0, 10) }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1) }
function monthStr(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function monthLabel(d: Date) { return d.toLocaleString(undefined, { month: 'long', year: 'numeric' }) }

export default function ClaimsClient({ projects, claims }: { projects: Project[]; claims: Claim[] }) {
  const [claimType, setClaimType] = useState<ClaimType>('Production')
  const [selectedMonth, setSelectedMonth] = useState(monthStr(new Date()))
  const [formProjectId, setFormProjectId] = useState('')
  const [formVolume, setFormVolume] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formRemarks, setFormRemarks] = useState('')
  const [formDate, setFormDate] = useState(todayStr())
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const availableMonthsList = useMemo(() => {
    const now = new Date()
    const list: { value: string; label: string }[] = []
    for (let i = 6; i >= 1; i--) { const d = addMonths(now, -i); list.push({ value: monthStr(d), label: monthLabel(d) }) }
    list.push({ value: monthStr(now), label: monthLabel(now) })
    for (let i = 1; i <= 2; i++) { const d = addMonths(now, i); list.push({ value: monthStr(d), label: monthLabel(d) }) }
    return list
  }, [])

  const filteredClaims = claims.filter(c => c.date && c.date.startsWith(selectedMonth))
  const activeOrClaimedProjects = projects.filter(p => p.status === 'Active' || filteredClaims.some(c => c.project_id === p.id))
  const projectValue = formProjectId || String(activeOrClaimedProjects[0]?.id || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectValue) return
    setSubmitting(true)
    try {
      await createClaim({
        project_id: Number(projectValue), type: claimType,
        volume_or_trips: Number(formVolume) || 0, amount: Number(formAmount) || 0,
        remarks: formRemarks, date: formDate,
      })
      setShowSuccess(true)
      setFormProjectId(''); setFormVolume(''); setFormAmount(''); setFormRemarks(''); setFormDate(todayStr())
      setTimeout(() => setShowSuccess(false), 3000)
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const sortedForSummary = [...activeOrClaimedProjects].sort((a, b) => a.name.localeCompare(b.name))
  const summaryByProject = sortedForSummary.map(p => {
    const projClaims = filteredClaims.filter(c => c.project_id === p.id)
    const of = (t: ClaimType) => projClaims.filter(c => c.type === t)
    return {
      project: p.name,
      totalProdVolume: of('Production').reduce((s, c) => s + (c.volume_or_trips || 0), 0),
      totalProdAmount: of('Production').reduce((s, c) => s + (c.amount || 0), 0),
      totalDelVolume: of('Delivery').reduce((s, c) => s + (c.volume_or_trips || 0), 0),
      totalDelAmount: of('Delivery').reduce((s, c) => s + (c.amount || 0), 0),
      totalGenVolume: of('General').reduce((s, c) => s + (c.volume_or_trips || 0), 0),
      totalGenAmount: of('General').reduce((s, c) => s + (c.amount || 0), 0),
    }
  })

  const selectedMonthLabel = availableMonthsList.find(m => m.value === selectedMonth)?.label || selectedMonth

  return (
    <>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <label className="text-sm text-gray-500 font-semibold">Select Month:</label>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm font-semibold bg-white">
            {availableMonthsList.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {showSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-2.5 mb-4 text-sm">
          <CheckCircle className="w-5 h-5" /> Claim submitted successfully and saved to records!
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold">Submit Claim</h3>
            <div className="flex gap-1">
              {(['Production', 'Delivery', 'General'] as ClaimType[]).map(t => (
                <button key={t} type="button" onClick={() => setClaimType(t)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ${claimType === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {t === 'Production' && <Package className="w-3.5 h-3.5" />}
                  {t === 'Delivery' && <Truck className="w-3.5 h-3.5" />}
                  {t === 'General' && <HelpCircle className="w-3.5 h-3.5" />}
                  {t}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required className="border rounded-md px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Project</label>
              <select value={projectValue} onChange={e => setFormProjectId(e.target.value)} required className="border rounded-md px-3 py-2 text-sm w-full bg-white">
                <option value="" disabled>Select a project</option>
                {activeOrClaimedProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{claimType === 'Production' ? 'Production Volume (m³)' : claimType === 'Delivery' ? 'Delivery Volume (m³)' : 'General Volume / Output (m³)'}</label>
              <input type="number" required value={formVolume} onChange={e => setFormVolume(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount Claimed (RM)</label>
              <input type="number" required value={formAmount} onChange={e => setFormAmount(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Remarks</label>
              <textarea rows={3} value={formRemarks} onChange={e => setFormRemarks(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full" />
            </div>
            <button type="submit" disabled={submitting} className="bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {submitting ? 'Submitting...' : `Submit ${claimType} Claim`}
            </button>
          </form>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h3 className="font-bold flex items-center gap-2 mb-1"><BarChart2 className="w-5 h-5" /> Project Claims Summary ({selectedMonthLabel})</h3>
          <p className="text-xs text-gray-400 mb-4">Aggregated claims by project for the selected month.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Project</th><th>Prod (m³)</th><th>Prod (RM)</th><th>Del (m³)</th><th>Del (RM)</th><th>Gen (m³)</th><th>Gen (RM)</th></tr></thead>
              <tbody>
                {summaryByProject.map(s => (
                  <tr key={s.project} className="border-b border-gray-100">
                    <td className="py-2 font-semibold">{s.project}</td>
                    <td>{fmt(s.totalProdVolume)}</td>
                    <td className="text-indigo-600 font-semibold">{fmt(s.totalProdAmount)}</td>
                    <td>{fmt(s.totalDelVolume)}</td>
                    <td className="text-green-600 font-semibold">{fmt(s.totalDelAmount)}</td>
                    <td>{fmt(s.totalGenVolume)}</td>
                    <td className="text-amber-600 font-semibold">{fmt(s.totalGenAmount)}</td>
                  </tr>
                ))}
                {summaryByProject.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-4">No projects.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5 mt-6">
        <h3 className="font-bold">Recent Claims Ledger ({selectedMonthLabel})</h3>
        <p className="text-xs text-gray-400 mb-3">Edit fields directly. Changes instantly reflect in the summary above.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Date</th><th>Project</th><th>Type</th><th>Volume (m³)</th><th>Amount (RM)</th><th>Remarks</th><th>Action</th></tr></thead>
            <tbody>
              {filteredClaims.map(claim => (
                <tr key={claim.id} className="border-b border-gray-100">
                  <td className="py-2"><input type="date" defaultValue={claim.date} onBlur={e => e.target.value !== claim.date && guard(() => updateClaimField(claim.id, 'date', e.target.value))} className="border rounded px-2 py-1" /></td>
                  <td>
                    <select defaultValue={claim.project_id} onChange={e => guard(() => updateClaimField(claim.id, 'project_id', Number(e.target.value)))} className="border rounded px-2 py-1 bg-white">
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select defaultValue={claim.type} onChange={e => guard(() => updateClaimField(claim.id, 'type', e.target.value))} className="border rounded px-2 py-1 bg-white w-28">
                      <option value="Production">Production</option><option value="Delivery">Delivery</option><option value="General">General</option>
                    </select>
                  </td>
                  <td><input type="number" defaultValue={claim.volume_or_trips} onBlur={e => guard(() => updateClaimField(claim.id, 'volume_or_trips', Number(e.target.value) || 0))} className="border rounded px-2 py-1 w-20" /></td>
                  <td className="font-semibold">RM <input type="number" defaultValue={claim.amount} onBlur={e => guard(() => updateClaimField(claim.id, 'amount', Number(e.target.value) || 0))} className="border rounded px-2 py-1 w-20 inline-block" /></td>
                  <td><input type="text" defaultValue={claim.remarks || ''} onBlur={e => guard(() => updateClaimField(claim.id, 'remarks', e.target.value))} className="border rounded px-2 py-1" /></td>
                  <td><button onClick={() => confirm('Delete this claim?') && guard(() => deleteClaim(claim.id))} className="text-red-500 hover:text-red-700 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
              {filteredClaims.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-4">No claims submitted for {selectedMonthLabel} yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
