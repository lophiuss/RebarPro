'use client'

import { useState } from 'react'
import { Building2, Plus, Trash2, Users, History, Receipt, Tag, ArrowRightLeft, ChevronDown, ChevronRight } from 'lucide-react'
import {
  createHostel, updateHostel, deleteHostel, assignHostelStay, moveOutStay,
  createBillItemType, updateBillItemType, deleteBillItemType,
  saveHostelBill, previewHostelBillProration, applyHostelBill,
} from '../actions'

type Hostel = { id: number; name: string; status: string; address: string | null; owner_name: string | null; owner_contact: string | null; rental_per_month: number | null; deposit_withheld: number | null }
type Worker = { id: number; name: string }
type Stay = { id: number; worker_id: number; hostel_id: number; move_in_date: string; move_out_date: string | null }
type ItemType = { id: number; name: string; charge_to_workers: boolean; sort_order: number }
type Bill = { id: number; hostel_id: number; month: string; applied_at: string | null; line_items: { item_type_id: number; amount: number }[] }
type Preview = { occupants: { worker_id: number; worker_name: string; days: number; share: number }[]; totalPaxDays: number }

function fmt(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function today() { return new Date().toISOString().slice(0, 10) }
async function guard(fn: () => Promise<any>) { try { await fn() } catch (err: any) { alert('Error: ' + err.message) } }

export default function HostelClient({ hostels, workers, stays, itemTypes, bills }: {
  hostels: Hostel[]; workers: Worker[]; stays: Stay[]; itemTypes: ItemType[]; bills: Bill[]
}) {
  const [tab, setTab] = useState<'manage' | 'assign' | 'billing'>('manage')
  const [newHostelName, setNewHostelName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [assignWorkerId, setAssignWorkerId] = useState('')
  const [assignHostelId, setAssignHostelId] = useState('')
  const [assignMoveIn, setAssignMoveIn] = useState(today())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [transferModal, setTransferModal] = useState<{ workerId: number; workerName: string; currentHostelId: number } | null>(null)
  const [transferHostelId, setTransferHostelId] = useState('')
  const [transferDate, setTransferDate] = useState(today())
  const [newItemName, setNewItemName] = useState('')
  const [newItemCharge, setNewItemCharge] = useState(true)
  const [billHostelId, setBillHostelId] = useState('')
  const [billMonth, setBillMonth] = useState(today().slice(0, 7))
  const [billAmounts, setBillAmounts] = useState<Record<number, string>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  const workerName = (id: number) => workers.find(w => w.id === id)?.name || `#${id}`
  const openStayByWorker = new Map<number, Stay>()
  for (const s of stays) if (!s.move_out_date && !openStayByWorker.has(s.worker_id)) openStayByWorker.set(s.worker_id, s)
  const housedIds = new Set(openStayByWorker.keys())
  const unhoused = workers.filter(w => !housedIds.has(w.id))
  const occupantsByHostel = new Map<number, { workerId: number; moveInDate: string; stayId: number }[]>()
  for (const [wId, s] of openStayByWorker) {
    if (!occupantsByHostel.has(s.hostel_id)) occupantsByHostel.set(s.hostel_id, [])
    occupantsByHostel.get(s.hostel_id)!.push({ workerId: wId, moveInDate: s.move_in_date, stayId: s.id })
  }
  const activeHostels = hostels.filter(h => h.status === 'Active')

  function loadBillForSelection(hostelId: string, month: string) {
    setPreview(null)
    if (!hostelId || !month) { setBillAmounts({}); return }
    const existing = bills.find(b => b.hostel_id === Number(hostelId) && b.month === month)
    const amounts: Record<number, string> = {}
    for (const it of itemTypes) {
      const li = existing?.line_items.find(x => x.item_type_id === it.id)
      amounts[it.id] = li ? String(li.amount) : ''
    }
    setBillAmounts(amounts)
  }
  const chargeableTotal = itemTypes.filter(it => it.charge_to_workers).reduce((s, it) => s + (Number(billAmounts[it.id]) || 0), 0)
  const grandTotal = itemTypes.reduce((s, it) => s + (Number(billAmounts[it.id]) || 0), 0)
  function buildItemsPayload() {
    return itemTypes.filter(it => billAmounts[it.id] !== undefined && billAmounts[it.id] !== '').map(it => ({ item_type_id: it.id, amount: Number(billAmounts[it.id]) || 0 }))
  }

  return (
    <>
      <div className="flex gap-1 mb-5 border-b">
        {[{ key: 'manage', label: 'Manage Hostels', icon: Building2 }, { key: 'assign', label: 'Assign Workers', icon: Users }, { key: 'billing', label: 'Utility Billing', icon: Receipt }].map(t => {
          const Icon = t.icon
          return <button key={t.key} onClick={() => setTab(t.key as any)} className={`flex items-center gap-1.5 px-4 py-2 text-sm -mb-px border-b-2 ${tab === t.key ? 'border-indigo-600 text-indigo-600 font-bold' : 'border-transparent text-gray-500'}`}><Icon className="w-4 h-4" /> {t.label}</button>
        })}
      </div>

      {tab === 'manage' && (
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold flex items-center gap-2 text-indigo-700"><Building2 className="w-5 h-5" /> Manage Hostels</h3>
            <button onClick={() => setShowArchived(v => !v)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200">{showArchived ? 'Hide Archive' : 'Show Archive'}</button>
          </div>
          <form onSubmit={e => { e.preventDefault(); if (!newHostelName.trim()) return; guard(() => createHostel(newHostelName.trim())); setNewHostelName('') }} className="flex gap-2 mb-4">
            <input value={newHostelName} onChange={e => setNewHostelName(e.target.value)} placeholder="New Hostel Name" required className="flex-1 border rounded-md px-3 py-2 text-sm" />
            <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Name</th><th>Address</th><th>Owner</th><th>Contact</th><th>Rental/Mo</th><th>Deposit</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {hostels.filter(h => showArchived || h.status === 'Active').map(h => (
                  <tr key={h.id} className={`border-b border-gray-100 ${h.status === 'Inactive' ? 'opacity-50' : ''}`}>
                    <td className="py-2"><input defaultValue={h.name} onBlur={e => e.target.value.trim() && guard(() => updateHostel(h.id, { name: e.target.value.trim() }))} className="border rounded px-2 py-1 w-28" /></td>
                    <td className="py-2"><input defaultValue={h.address || ''} onBlur={e => guard(() => updateHostel(h.id, { address: e.target.value }))} className="border rounded px-2 py-1 w-32" /></td>
                    <td className="py-2"><input defaultValue={h.owner_name || ''} onBlur={e => guard(() => updateHostel(h.id, { owner_name: e.target.value }))} className="border rounded px-2 py-1 w-24" /></td>
                    <td className="py-2"><input defaultValue={h.owner_contact || ''} onBlur={e => guard(() => updateHostel(h.id, { owner_contact: e.target.value }))} className="border rounded px-2 py-1 w-24" /></td>
                    <td className="py-2"><input type="number" step="0.01" defaultValue={h.rental_per_month ?? ''} onBlur={e => guard(() => updateHostel(h.id, { rental_per_month: e.target.value ? Number(e.target.value) : null }))} className="border rounded px-2 py-1 w-20" /></td>
                    <td className="py-2"><input type="number" step="0.01" defaultValue={h.deposit_withheld ?? ''} onBlur={e => guard(() => updateHostel(h.id, { deposit_withheld: e.target.value ? Number(e.target.value) : null }))} className="border rounded px-2 py-1 w-20" /></td>
                    <td className="py-2"><button onClick={() => guard(() => updateHostel(h.id, { status: h.status === 'Active' ? 'Inactive' : 'Active' }))} className={`text-xs font-bold px-2 py-1 rounded-full ${h.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{h.status}</button></td>
                    <td className="py-2 text-right"><button onClick={() => confirm(`Delete "${h.name}"?`) && guard(() => deleteHostel(h.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {hostels.length === 0 && <tr><td colSpan={8} className="text-gray-400 py-4">No hostels added.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'assign' && (
        <div className="bg-white border rounded-xl shadow-sm p-5">
          <h3 className="font-bold flex items-center gap-2 text-green-700 mb-4"><Users className="w-5 h-5" /> Assign Worker to Hostel</h3>
          <form onSubmit={e => { e.preventDefault(); if (!assignWorkerId || !assignHostelId) return; guard(() => assignHostelStay(Number(assignWorkerId), Number(assignHostelId), assignMoveIn)); setAssignWorkerId('') }} className="flex flex-wrap gap-2 mb-2">
            <select value={assignWorkerId} onChange={e => setAssignWorkerId(e.target.value)} required className="flex-1 min-w-[160px] border rounded-md px-3 py-2 text-sm bg-white">
              <option value="" disabled>Select Worker (not housed)</option>{unhoused.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <select value={assignHostelId} onChange={e => setAssignHostelId(e.target.value)} required className="border rounded-md px-3 py-2 text-sm bg-white w-40">
              <option value="" disabled>Select Hostel</option>{activeHostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <input type="date" value={assignMoveIn} onChange={e => setAssignMoveIn(e.target.value)} required className="border rounded-md px-3 py-2 text-sm" />
            <button type="submit" className="flex items-center gap-1 bg-green-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-green-700"><Plus className="w-4 h-4" /> Assign</button>
          </form>
          <p className="text-xs text-gray-400 mb-4">Already-housed workers don&apos;t show here — use <strong>Transfer</strong> below to move them.</p>

          {hostels.map(h => {
            const occ = occupantsByHostel.get(h.id) || []
            const isOpen = expanded.has(h.id)
            return (
              <div key={h.id} className="bg-gray-50 border rounded-lg p-3 mb-2">
                <div onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n })} className="flex items-center gap-2 cursor-pointer select-none">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-semibold text-sm">{h.name}</span>
                  <span className="text-xs text-gray-500">({occ.length} occupant{occ.length === 1 ? '' : 's'})</span>
                </div>
                {isOpen && (occ.length === 0 ? <p className="text-xs text-gray-400 mt-2">No current occupants.</p> : (
                  <table className="w-full text-sm mt-2">
                    <tbody>
                      {occ.map(o => (
                        <tr key={o.stayId} className="border-b border-gray-200">
                          <td className="py-1.5">{workerName(o.workerId)}</td>
                          <td className="text-xs text-gray-500">Since {o.moveInDate}</td>
                          <td className="text-right whitespace-nowrap">
                            <button onClick={() => { setTransferHostelId(''); setTransferDate(today()); setTransferModal({ workerId: o.workerId, workerName: workerName(o.workerId), currentHostelId: h.id }) }} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded mr-1"><ArrowRightLeft className="w-3 h-3 inline mr-0.5" /> Transfer</button>
                            <button onClick={() => { const d = prompt(`Move-out date for ${workerName(o.workerId)} (yyyy-MM-dd):`, today()); if (d) guard(() => moveOutStay(o.stayId, d)) }} className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded">Move Out</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'billing' && (
        <>
          <div className="bg-white border rounded-xl shadow-sm p-5 mb-6">
            <h3 className="font-bold flex items-center gap-2 text-indigo-700 mb-1"><Tag className="w-5 h-5" /> Bill Item Types</h3>
            <p className="text-xs text-gray-500 mb-3">Utility items billed to hostels each month, and whether each is prorated into occupants&apos; pay.</p>
            <form onSubmit={e => { e.preventDefault(); if (!newItemName.trim()) return; guard(() => createBillItemType(newItemName.trim(), newItemCharge)); setNewItemName(''); setNewItemCharge(true) }} className="flex flex-wrap items-center gap-2 mb-3">
              <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Item Name (e.g. Sewerage)" required className="flex-1 min-w-[160px] border rounded-md px-3 py-2 text-sm" />
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={newItemCharge} onChange={e => setNewItemCharge(e.target.checked)} /> Charge to Workers</label>
              <button type="submit" className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-indigo-700"><Plus className="w-4 h-4" /> Add</button>
            </form>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Item</th><th>Charge to Workers?</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {itemTypes.map(it => (
                  <tr key={it.id} className="border-b border-gray-100">
                    <td className="py-2"><input defaultValue={it.name} onBlur={e => e.target.value.trim() && guard(() => updateBillItemType(it.id, { name: e.target.value.trim() }))} className="border rounded px-2 py-1 w-40" /></td>
                    <td className="py-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.charge_to_workers} onChange={() => guard(() => updateBillItemType(it.id, { charge_to_workers: !it.charge_to_workers }))} /> {it.charge_to_workers ? 'Yes' : 'No'}</label></td>
                    <td className="py-2 text-right"><button onClick={() => confirm(`Delete "${it.name}"?`) && guard(() => deleteBillItemType(it.id))} className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
                {itemTypes.length === 0 && <tr><td colSpan={3} className="text-gray-400 py-4">No bill item types defined.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="bg-white border rounded-xl shadow-sm p-5">
            <h3 className="font-bold flex items-center gap-2 text-amber-700 mb-4"><Receipt className="w-5 h-5" /> Monthly Utility Billing</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              <select value={billHostelId} onChange={e => { setBillHostelId(e.target.value); loadBillForSelection(e.target.value, billMonth) }} className="border rounded-md px-3 py-2 text-sm bg-white w-44">
                <option value="" disabled>Select Hostel</option>{hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
              <input type="month" value={billMonth} onChange={e => { setBillMonth(e.target.value); loadBillForSelection(billHostelId, e.target.value) }} className="border rounded-md px-3 py-2 text-sm" />
            </div>

            {billHostelId && billMonth && (
              <div className="mb-4">
                <table className="w-full text-sm mb-3">
                  <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Item</th><th>Charge?</th><th>Amount (RM)</th></tr></thead>
                  <tbody>
                    {itemTypes.map(it => (
                      <tr key={it.id} className="border-b border-gray-100">
                        <td className="py-1.5">{it.name}</td>
                        <td className="text-xs text-gray-500">{it.charge_to_workers ? 'Yes' : 'No'}</td>
                        <td><input type="number" step="0.01" value={billAmounts[it.id] ?? ''} onChange={e => { setBillAmounts(prev => ({ ...prev, [it.id]: e.target.value })); setPreview(null) }} className="border rounded px-2 py-1 text-sm w-32" /></td>
                      </tr>
                    ))}
                    {itemTypes.length === 0 && <tr><td colSpan={3} className="text-gray-400 py-4">No bill item types defined above.</td></tr>}
                  </tbody>
                </table>
                <p className="text-sm text-gray-500 mb-3">Total Bill: RM {fmt(grandTotal)} &nbsp;|&nbsp; <strong className="text-amber-600">Chargeable to Workers: RM {fmt(chargeableTotal)}</strong></p>
                <div className="flex gap-2">
                  <button disabled={saving} onClick={async () => { setSaving(true); await guard(() => saveHostelBill(Number(billHostelId), billMonth, buildItemsPayload())); setSaving(false) }} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">{saving ? 'Saving...' : 'Save Bill'}</button>
                  <button disabled={previewing} onClick={async () => { setPreviewing(true); try { const p = await previewHostelBillProration(Number(billHostelId), billMonth, chargeableTotal); setPreview(p) } catch (err: any) { alert('Error: ' + err.message) } finally { setPreviewing(false) } }} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">{previewing ? 'Loading...' : 'Preview'}</button>
                </div>
              </div>
            )}

            {preview && (
              <div>
                <table className="w-full text-sm mb-3">
                  <thead><tr className="text-xs text-gray-500 uppercase text-left border-b"><th className="pb-2">Worker</th><th>Days Stayed</th><th>Prorated Share (RM)</th></tr></thead>
                  <tbody>
                    {preview.occupants.map(o => (
                      <tr key={o.worker_id} className="border-b border-gray-100"><td className="py-1.5">{o.worker_name}</td><td>{o.days}</td><td className="font-semibold text-amber-600">{fmt(o.share)}</td></tr>
                    ))}
                    {preview.occupants.length === 0 && <tr><td colSpan={3} className="text-gray-400 py-4">No occupants staying at this hostel during {billMonth}.</td></tr>}
                  </tbody>
                </table>
                <p className="text-xs text-gray-500 mb-3">Chargeable: RM {fmt(chargeableTotal)} across {preview.totalPaxDays} pax-day{preview.totalPaxDays === 1 ? '' : 's'}.</p>
                <button disabled={preview.occupants.length === 0} onClick={async () => {
                  if (!confirm(`Apply RM ${fmt(chargeableTotal)} (chargeable) across ${preview.occupants.length} occupant(s) for ${billMonth}? This writes into each worker's Utility value.`)) return
                  await guard(async () => {
                    const billId = await saveHostelBill(Number(billHostelId), billMonth, buildItemsPayload())
                    const n = await applyHostelBill(billId)
                    alert(`Applied. ${n} worker(s) updated.`)
                    setPreview(null)
                  })
                }} className="bg-indigo-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700">Calculate &amp; Apply</button>
              </div>
            )}
          </div>
        </>
      )}

      {transferModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTransferModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Transfer to Another Hostel</h2>
            <p className="text-xs text-gray-400 mb-4">Move <strong>{transferModal.workerName}</strong>. Their current stay closes automatically the day before the new move-in date.</p>
            <label className="block text-xs font-medium text-gray-500 mb-1">Transfer To</label>
            <select value={transferHostelId} onChange={e => setTransferHostelId(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-3 bg-white">
              <option value="">-- Select --</option>{activeHostels.filter(h => h.id !== transferModal.currentHostelId).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <label className="block text-xs font-medium text-gray-500 mb-1">Move-In Date</label>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setTransferModal(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm">Cancel</button>
              <button disabled={!transferHostelId} onClick={() => guard(() => assignHostelStay(transferModal.workerId, Number(transferHostelId), transferDate)).then(() => setTransferModal(null))} className="bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">Transfer</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
