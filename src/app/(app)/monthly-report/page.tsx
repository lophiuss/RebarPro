export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { naturalSort } from '@/lib/utils/sort'
import ExportMonthlyReportButton from '@/components/ExportMonthlyReportButton'

interface SearchParams {
  month?: string
  project_type?: string
}

export default async function MonthlyReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { month: rawMonth, project_type: rawProjectType } = await searchParams
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const selectedMonth = rawMonth || defaultMonth
  const selectedProjectType = rawProjectType || 'all'

  const [year, mon] = selectedMonth.split('-').map(Number)
  const monthName = new Date(year, mon - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
  const startDate = `${selectedMonth}-01`
  const endDay = new Date(year, mon, 0).getDate()
  const endDate = `${selectedMonth}-${String(endDay).padStart(2, '0')}`

  const supabase = await createClient()

  const [txRes, sizesRes, projRes, pTypeRes, stRes, prevStRes] = await Promise.all([
    // All transactions up to end of this month
    supabase.from('transactions')
      .select('quantity, type, transaction_date, size_id, project_id, project_type_id, rebar_sizes(size), projects(name, project_type_id), project_types(name)')
      .lte('transaction_date', endDate),
    supabase.from('rebar_sizes').select('*'),
    supabase.from('projects').select('id, name, project_type_id'),
    supabase.from('project_types').select('id, name'),
    // Stock takes IN this month
    supabase.from('stock_takes').select('id, size_id, physical_count, system_balance, variance, stock_take_date, project_type_id, project_types(name), rebar_sizes(size)')
      .gte('stock_take_date', startDate)
      .lte('stock_take_date', endDate)
      .order('stock_take_date', { ascending: true }),
    // All stock takes BEFORE this month
    supabase.from('stock_takes').select('size_id, physical_count, stock_take_date, project_type_id')
      .lt('stock_take_date', startDate)
      .order('stock_take_date', { ascending: false })
  ])

  const allRawTxs = txRes.data || []
  const rawSizes = sizesRes.data || []
  const rawProjects = projRes.data || []
  const rawProjectTypes = pTypeRes.data || []
  const rawStockTakesThisMonth = stRes.data || []
  const rawPrevSTs = prevStRes.data || []

  const sizes = naturalSort(rawSizes, s => s.size)
  const projects = naturalSort(rawProjects, p => p.name)
  const projectTypes = naturalSort(rawProjectTypes, pt => pt.name)

  // Determine active project types & projects based on filter
  const isTypeFiltered = selectedProjectType !== 'all'
  const activeProjectTypes = isTypeFiltered
    ? projectTypes.filter(pt => pt.id === selectedProjectType)
    : projectTypes

  const activeProjectIds = isTypeFiltered
    ? projects.filter(p => p.project_type_id === selectedProjectType).map(p => p.id)
    : projects.map(p => p.id)

  const selectedProjectTypeName = isTypeFiltered
    ? projectTypes.find(pt => pt.id === selectedProjectType)?.name
    : undefined

  // Filter transactions to only active project type scope
  const filteredAllTxs = allRawTxs.filter(t => {
    if (!isTypeFiltered) return true
    if (t.project_type_id === selectedProjectType) return true
    if (t.project_id && activeProjectIds.includes(t.project_id)) return true
    return false
  })

  const txs = filteredAllTxs.filter(t => t.transaction_date >= startDate && t.transaction_date <= endDate)

  const stockTakesThisMonth = isTypeFiltered
    ? rawStockTakesThisMonth.filter(st => st.project_type_id === selectedProjectType)
    : rawStockTakesThisMonth

  const allPrevSTs = isTypeFiltered
    ? rawPrevSTs.filter(st => st.project_type_id === selectedProjectType)
    : rawPrevSTs

  // ── HELPER: Opening balance anchored to stock takes within active project type scope ──
  function getOpeningBalance(sizeId: string): { balance: number; source: string } {
    let balance = 0
    let hasSource = false

    for (const pt of activeProjectTypes) {
      const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)
      const ptTxs = allRawTxs.filter(t => 
        t.size_id === sizeId && 
        (t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id)))
      )

      // 1. Check if there was a stock take BEFORE this month
      const prevST = allPrevSTs.find(st => st.size_id === sizeId && st.project_type_id === pt.id)
      if (prevST) {
        hasSource = true
        const txsBetween = ptTxs.filter(t => t.transaction_date > prevST.stock_take_date && t.transaction_date < startDate)
        const txSum = txsBetween.reduce((sum, t) => sum + Number(t.quantity), 0)
        balance += Number(prevST.physical_count) + txSum
        continue
      }

      // 2. Check if there is a FIRST stock take of this month
      const firstMonthST = stockTakesThisMonth.find(st => st.size_id === sizeId && st.project_type_id === pt.id)
      if (firstMonthST) {
        hasSource = true
        const txsBeforeST = ptTxs.filter(t => t.transaction_date >= startDate && t.transaction_date <= firstMonthST.stock_take_date)
        const txSumBefore = txsBeforeST.reduce((sum, t) => sum + Number(t.quantity), 0)
        balance += Number(firstMonthST.physical_count) - txSumBefore
        continue
      }

      // 3. Fallback: sum of all transactions before startDate
      const txsBefore = ptTxs.filter(t => t.transaction_date < startDate)
      balance += txsBefore.reduce((sum, t) => sum + Number(t.quantity), 0)
    }

    // Add unassigned only when viewing all
    if (!isTypeFiltered) {
      const knownProjectIds = projects.map(p => p.id)
      const unassignedTxs = allRawTxs.filter(t => 
        t.size_id === sizeId && 
        !t.project_type_id && 
        (!t.project_id || !knownProjectIds.includes(t.project_id)) &&
        t.transaction_date < startDate
      )
      balance += unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
    }

    return { balance: Math.max(balance, 0), source: hasSource ? 'Stock Take' : 'Transactions' }
  }

  // Build per-size rows
  const sizeRows = sizes.map(size => {
    const sizeTxs = txs.filter(t => t.size_id === size.id)

    let incoming = 0, transfer = 0, usage = 0, suspended = 0, wastage = 0

    sizeTxs.forEach(t => {
      const q = Number(t.quantity)
      switch (t.type) {
        case 'incoming':  incoming  += q; break
        case 'transfer':  transfer  += q; break
        case 'usage':     usage     += Math.abs(q); break
        case 'suspended': suspended += Math.abs(q); break
        case 'unsuspend': suspended -= Math.abs(q); break
        case 'wastage':   wastage   += Math.abs(q); break
      }
    })

    const { balance: opening } = getOpeningBalance(size.id)
    
    const expectedClosing = opening + incoming + transfer - usage - wastage

    // Find latest stock take in this month for this size
    const monthSTsForSize = stockTakesThisMonth.filter(st => st.size_id === size.id)
    const hasStockTake = monthSTsForSize.length > 0
    const latestST = monthSTsForSize.length > 0 ? monthSTsForSize[monthSTsForSize.length - 1] : null
    const stPhysical = latestST ? Number(latestST.physical_count) : null

    const variance = (hasStockTake && stPhysical !== null) ? (stPhysical - expectedClosing) : null
    const wastagePct = usage > 0 ? (wastage / usage) * 100 : 0
    const variancePct = (variance !== null && usage > 0) ? (variance / usage) * 100 : (variance !== null && variance === 0 ? 0 : null)

    return {
      sizeId: size.id,
      size: size.size,
      unit: size.unit || 'T',
      opening,
      incoming,
      transfer,
      usage,
      suspended: Math.max(suspended, 0),
      wastage,
      wastagePct,
      expectedClosing,
      hasStockTake,
      stPhysical,
      variance,
      variancePct
    }
  }).filter(r => r.opening > 0 || r.incoming > 0 || r.usage > 0 || r.wastage > 0 || r.transfer !== 0 || r.hasStockTake)

  // Overall Wastage without specific size
  const unassignedWastageTxs = txs.filter(t => t.type === 'wastage' && !t.size_id)
  const unassignedWastageQty = unassignedWastageTxs.reduce((sum, t) => sum + Math.abs(Number(t.quantity)), 0)

  // Totals row
  const totals = sizeRows.reduce((acc, r) => ({
    opening: acc.opening + r.opening,
    incoming: acc.incoming + r.incoming,
    transfer: acc.transfer + r.transfer,
    usage: acc.usage + r.usage,
    suspended: acc.suspended + r.suspended,
    wastage: acc.wastage + r.wastage,
    expectedClosing: acc.expectedClosing + r.expectedClosing,
    variance: acc.variance + (r.variance || 0)
  }), { 
    opening: 0, incoming: 0, transfer: 0, usage: 0, suspended: 0, 
    wastage: unassignedWastageQty, 
    expectedClosing: -unassignedWastageQty,
    variance: 0
  })

  const totalWastagePct = totals.usage > 0 ? (totals.wastage / totals.usage) * 100 : 0
  const totalVariancePct = totals.usage > 0 ? (totals.variance / totals.usage) * 100 : 0

  // Per-project usage breakdown
  const projectUsage: Record<string, { name: string; typeName: string; usage: number; suspended: number }> = {}
  txs.filter(t => t.project_id && (t.type === 'usage' || t.type === 'suspended' || t.type === 'unsuspend')).forEach(t => {
    const pid = t.project_id!
    if (!projectUsage[pid]) {
      const proj = projects.find(p => p.id === pid)
      const pt = projectTypes.find(pt => pt.id === proj?.project_type_id)
      projectUsage[pid] = { name: proj?.name || 'Unknown', typeName: pt?.name || '-', usage: 0, suspended: 0 }
    }
    if (t.type === 'usage') projectUsage[pid].usage += Math.abs(Number(t.quantity))
    if (t.type === 'suspended') projectUsage[pid].suspended += Math.abs(Number(t.quantity))
    if (t.type === 'unsuspend') projectUsage[pid].suspended -= Math.abs(Number(t.quantity))
  })

  // Per-project-type breakdown
  const typeUsage: Record<string, { name: string; incoming: number; usage: number; wastage: number; transferIn: number; transferOut: number }> = {}
  txs.forEach((t: any) => {
    const projObj = Array.isArray(t.projects) ? t.projects[0] : t.projects
    const projTypeObj = Array.isArray(t.project_types) ? t.project_types[0] : t.project_types
    const typeId = t.project_type_id || projObj?.project_type_id
    if (!typeId) return
    const ptName = projTypeObj?.name || projectTypes.find(pt => pt.id === typeId)?.name || 'Unknown'
    if (!typeUsage[typeId]) typeUsage[typeId] = { name: ptName, incoming: 0, usage: 0, wastage: 0, transferIn: 0, transferOut: 0 }
    const q = Number(t.quantity)
    if (t.type === 'incoming') typeUsage[typeId].incoming += q
    if (t.type === 'usage') typeUsage[typeId].usage += Math.abs(q)
    if (t.type === 'wastage') typeUsage[typeId].wastage += Math.abs(q)
    if (t.type === 'transfer') {
      if (q > 0) typeUsage[typeId].transferIn += q
      else typeUsage[typeId].transferOut += Math.abs(q)
    }
  })

  function fmt(n: number) { return n === 0 ? '-' : n.toFixed(2) }

  return (
    <div className="p-4 md:p-8 max-w-[96rem] mx-auto pb-20">
      {/* Header with Month & Project Type Filters + Export */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Monthly Report</h1>
          <p className="text-gray-500 mt-1">
            Full inventory breakdown for <strong>{monthName}</strong>
            {selectedProjectTypeName && (
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                Type: {selectedProjectTypeName}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Form */}
          <form method="GET" className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border shadow-xs">
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white"
            />
            <select
              name="project_type"
              defaultValue={selectedProjectType}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white font-medium text-slate-800"
            >
              <option value="all">All Project Types</option>
              {projectTypes.map(pt => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="bg-slate-800 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-slate-700 font-medium transition shadow-xs"
            >
              Filter
            </button>
          </form>

          {/* Export Complete Report */}
          <ExportMonthlyReportButton
            monthName={monthName}
            selectedMonth={selectedMonth}
            projectTypeName={selectedProjectTypeName}
            totals={totals}
            sizeRows={sizeRows}
            unassignedWastageQty={unassignedWastageQty}
            stockTakes={stockTakesThisMonth}
            typeUsage={typeUsage}
            projectUsage={projectUsage}
          />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        {[
          { label: 'Opening Balance', value: totals.opening.toFixed(2), color: 'text-slate-700' },
          { label: 'Incoming', value: `+${totals.incoming.toFixed(2)}`, color: 'text-green-600' },
          { label: 'Usage', value: `-${totals.usage.toFixed(2)}`, color: 'text-red-600' },
          { label: 'Wastage (Total)', value: `-${totals.wastage.toFixed(2)} (${totalWastagePct.toFixed(1)}%)`, color: 'text-orange-600' },
          { label: 'Expected Closing', value: totals.expectedClosing.toFixed(2), color: 'text-slate-700 font-bold' },
          { 
            label: 'Total Variance', 
            value: `${totals.variance > 0 ? `+${totals.variance.toFixed(2)}` : totals.variance.toFixed(2)} (${totalVariancePct > 0 ? '+' : ''}${totalVariancePct.toFixed(1)}%)`, 
            color: totals.variance < 0 ? 'text-red-600 font-bold' : totals.variance > 0 ? 'text-green-600 font-bold' : 'text-slate-700' 
          },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border rounded-xl p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-medium uppercase">{kpi.label}</p>
            <p className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value} {kpi.label.includes('%') ? '' : 'T'}</p>
          </div>
        ))}
      </div>

      {/* Main breakdown by size */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Breakdown by Rebar Size</h2>
        {selectedProjectTypeName && (
          <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
            Filtered by: {selectedProjectTypeName}
          </span>
        )}
      </div>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto mb-10">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-bold text-gray-600 uppercase sticky left-0 bg-gray-50">Size</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase border-l">Opening</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-green-600 uppercase border-l">Incoming</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-purple-600 uppercase border-l">Transfer (Net)</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-red-600 uppercase border-l bg-red-50/50">Usage</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-amber-600 uppercase border-l">Net Suspended</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-orange-600 uppercase border-l">Wastage</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-orange-600 uppercase border-l">Wastage %</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 uppercase border-l bg-slate-50">Expected Closing</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase border-l">ST Physical</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-800 uppercase border-l bg-gray-100">Variance</th>
              <th className="px-3 py-3 text-right text-xs font-bold text-gray-800 uppercase border-l bg-gray-100">Variance % (Var/Use)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sizeRows.map(r => (
              <tr key={r.sizeId} className="hover:bg-gray-50">
                <td className="px-3 py-3 font-bold text-slate-700 sticky left-0 bg-white border-r">{r.size}</td>
                <td className="px-3 py-3 text-right text-gray-700 font-medium border-l">{r.opening.toFixed(2)}</td>
                <td className="px-3 py-3 text-right text-green-700 font-medium border-l">{fmt(r.incoming)}</td>
                <td className={`px-3 py-3 text-right font-medium border-l ${r.transfer < 0 ? 'text-red-600' : r.transfer > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  {r.transfer > 0 ? `+${r.transfer.toFixed(2)}` : r.transfer < 0 ? r.transfer.toFixed(2) : '-'}
                </td>
                <td className="px-3 py-3 text-right text-red-700 font-medium border-l bg-red-50/30">{fmt(r.usage)}</td>
                <td className="px-3 py-3 text-right text-amber-700 border-l">{r.suspended > 0 ? r.suspended.toFixed(2) : '-'}</td>
                <td className="px-3 py-3 text-right text-orange-700 border-l">{fmt(r.wastage)}</td>
                <td className="px-3 py-3 text-right text-orange-600 border-l text-xs font-medium">
                  {r.wastage > 0 ? `${r.wastagePct.toFixed(1)}%` : '-'}
                </td>
                <td className="px-3 py-3 text-right font-bold text-slate-800 border-l bg-slate-50">{r.expectedClosing.toFixed(2)}</td>
                <td className="px-3 py-3 text-right text-gray-700 font-medium border-l">
                  {r.hasStockTake ? r.stPhysical?.toFixed(2) : <span className="text-gray-300 text-xs italic">No ST</span>}
                </td>
                <td className={`px-3 py-3 text-right font-bold border-l bg-gray-50/50 ${
                  r.variance === null ? 'text-gray-300' :
                  r.variance < 0 ? 'text-red-600' :
                  r.variance > 0 ? 'text-green-600' :
                  'text-green-600'
                }`}>
                  {r.variance === null ? '—' : 
                   r.variance === 0 ? <span className="text-green-600">✓ Match (0.00)</span> :
                   (r.variance > 0 ? `+${r.variance.toFixed(2)}` : r.variance.toFixed(2))}
                </td>
                <td className={`px-3 py-3 text-right font-bold border-l bg-gray-50/50 text-xs ${
                  r.variancePct === null ? 'text-gray-300' :
                  r.variancePct < 0 ? 'text-red-600' :
                  r.variancePct > 0 ? 'text-green-600' :
                  'text-green-600'
                }`}>
                  {r.variancePct === null ? '—' : 
                   r.variancePct === 0 ? '0.0%' :
                   (r.variancePct > 0 ? `+${r.variancePct.toFixed(1)}%` : `${r.variancePct.toFixed(1)}%`)}
                </td>
              </tr>
            ))}

            {/* General / Combined Wastage Row */}
            {unassignedWastageQty > 0 && !isTypeFiltered && (
              <tr className="bg-orange-50/50 hover:bg-orange-50">
                <td className="px-3 py-3 font-semibold text-orange-800 sticky left-0 bg-orange-50 border-r italic">Overall Scrap (Combined)</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l bg-red-50/30">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-orange-700 font-bold border-l">{unassignedWastageQty.toFixed(2)}</td>
                <td className="px-3 py-3 text-right text-orange-600 border-l text-xs">-</td>
                <td className="px-3 py-3 text-right font-semibold text-orange-800 border-l bg-slate-50">-{unassignedWastageQty.toFixed(2)}</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
                <td className="px-3 py-3 text-right text-gray-400 border-l">-</td>
              </tr>
            )}

            {/* Totals row */}
            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
              <td className="px-3 py-3 sticky left-0 bg-slate-100 border-r">TOTAL</td>
              <td className="px-3 py-3 text-right border-l">{totals.opening.toFixed(2)}</td>
              <td className="px-3 py-3 text-right text-green-700 border-l">{totals.incoming.toFixed(2)}</td>
              <td className={`px-3 py-3 text-right border-l ${totals.transfer < 0 ? 'text-red-600' : totals.transfer > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                {totals.transfer > 0 ? `+${totals.transfer.toFixed(2)}` : totals.transfer < 0 ? totals.transfer.toFixed(2) : '-'}
              </td>
              <td className="px-3 py-3 text-right text-red-700 border-l bg-red-50">{totals.usage.toFixed(2)}</td>
              <td className="px-3 py-3 text-right text-amber-700 border-l">{totals.suspended > 0 ? totals.suspended.toFixed(2) : '-'}</td>
              <td className="px-3 py-3 text-right text-orange-700 border-l">{totals.wastage.toFixed(2)}</td>
              <td className="px-3 py-3 text-right text-orange-700 border-l text-xs font-bold">{totalWastagePct.toFixed(1)}%</td>
              <td className="px-3 py-3 text-right border-l bg-slate-200">{totals.expectedClosing.toFixed(2)}</td>
              <td className="px-3 py-3 border-l" />
              <td className={`px-3 py-3 text-right border-l font-bold ${totals.variance < 0 ? 'text-red-700' : totals.variance > 0 ? 'text-green-700' : 'text-slate-800'}`}>
                {totals.variance > 0 ? `+${totals.variance.toFixed(2)}` : totals.variance.toFixed(2)}
              </td>
              <td className={`px-3 py-3 text-right border-l font-bold text-xs ${totals.variance < 0 ? 'text-red-700' : totals.variance > 0 ? 'text-green-700' : 'text-slate-800'}`}>
                {totalVariancePct !== 0 ? (totalVariancePct > 0 ? `+${totalVariancePct.toFixed(1)}%` : `${totalVariancePct.toFixed(1)}%`) : '0.0%'}
              </td>
            </tr>

            {sizeRows.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500">No active stock or transactions for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Stock Take Summary this month */}
      {stockTakesThisMonth.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Stock Takes Recorded This Month</h2>
            <Link href="/stock-take" className="text-sm text-blue-600 hover:text-blue-800 underline">
              Manage in Stock Take →
            </Link>
          </div>
          <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Physical Count</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">System Balance</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-800 uppercase">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stockTakesThisMonth.map((st: any, i: number) => {
                  const pTypeName = st.project_types?.name || (st.project_type_id ? 'Unknown Type' : 'Unassigned / Legacy')
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{st.stock_take_date}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${!st.project_type_id ? 'bg-amber-100 text-amber-800' : 'text-slate-700'}`}>
                          {pTypeName}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">{st.rebar_sizes?.size || '-'}</td>
                      <td className="px-4 py-3 text-right font-medium">{Number(st.physical_count).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{Number(st.system_balance).toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${Number(st.variance) < 0 ? 'text-red-600' : Number(st.variance) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {Number(st.variance) > 0 ? `+${Number(st.variance).toFixed(2)}` : Number(st.variance).toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Project type breakdown & Project usage */}
      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <div>
          <h2 className="text-xl font-bold mb-4">Activity by Project Type</h2>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-green-600 uppercase">Incoming</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-red-600 uppercase">Usage</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-purple-600 uppercase">Transfer Net</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-orange-600 uppercase">Wastage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.values(typeUsage).map((row, i) => {
                  const netTrans = row.transferIn - row.transferOut
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-right text-green-700">{row.incoming > 0 ? row.incoming.toFixed(2) : '-'}</td>
                      <td className="px-4 py-3 text-right text-red-700">{row.usage > 0 ? row.usage.toFixed(2) : '-'}</td>
                      <td className={`px-4 py-3 text-right font-medium ${netTrans < 0 ? 'text-red-600' : netTrans > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {netTrans > 0 ? `+${netTrans.toFixed(2)}` : netTrans < 0 ? netTrans.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-700">{row.wastage > 0 ? row.wastage.toFixed(2) : '-'}</td>
                    </tr>
                  )
                })}
                {Object.keys(typeUsage).length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-gray-400">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold mb-4">Usage & Suspension by Project</h2>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-red-600 uppercase">Usage (T)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-amber-600 uppercase">Suspended (T)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.values(projectUsage).sort((a, b) => b.usage - a.usage).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3 text-gray-500">{row.typeName}</td>
                    <td className="px-4 py-3 text-right text-red-700 font-medium">{row.usage.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-amber-700 font-medium">{row.suspended !== 0 ? row.suspended.toFixed(2) : '-'}</td>
                  </tr>
                ))}
                {Object.keys(projectUsage).length === 0 && <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">No project usage this month</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
