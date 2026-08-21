export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import UsageTrendsChart from '@/components/UsageTrendsChart'
import RebarStockChart from '@/components/RebarStockChart'
import { naturalSort } from '@/lib/utils/sort'

export default async function DashboardPage() {
  const supabase = await createClient()

  const [txRes, sizesRes, settingsRes, stRes, pTypesRes, projectsRes] = await Promise.all([
    supabase.from('transactions').select('quantity, type, transaction_date, size_id, project_type_id, project_id'),
    supabase.from('rebar_sizes').select('*'),
    supabase.from('global_settings').select('target_coverage_days').eq('id', 1).single(),
    supabase.from('stock_takes').select('id, size_id, stock_take_date, physical_count, project_type_id').order('stock_take_date', { ascending: false }),
    supabase.from('project_types').select('id, name'),
    supabase.from('projects').select('id, name, project_type_id')
  ])

  const transactions = txRes.data || []
  // Apply natural sort so H6, H8, H10, H12, H13, H16, H20, H25, H28, H32, H40 sort properly
  const sizes = naturalSort(sizesRes.data || [], s => s.size)
  const targetCoverageDays = settingsRes.data?.target_coverage_days || 14
  const allStockTakes = stRes.data || []
  const projectTypes = naturalSort(pTypesRes.data || [], pt => pt.name)
  const projects = naturalSort(projectsRes.data || [], p => p.name)

  // Date helpers
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  }

  const sevenDaysAgoStr = daysAgo(7)

  // ── HELPER: calculate accurate stock-take-anchored balance per size ──
  function getSizeBalanceInfo(sizeId: string) {
    let balance = 0
    let latestSTDate: string | null = null
    let hasST = false

    // 1. Process each project type
    for (const pt of projectTypes) {
      const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)
      
      const ptTxs = transactions.filter(t => 
        t.size_id === sizeId && 
        (t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id)))
      )

      const ptST = allStockTakes.find(st => st.size_id === sizeId && st.project_type_id === pt.id)

      if (ptST) {
        hasST = true
        if (!latestSTDate || ptST.stock_take_date > latestSTDate) {
          latestSTDate = ptST.stock_take_date
        }
        const txsAfter = ptTxs.filter(t => t.transaction_date > ptST.stock_take_date)
        const ptTxSum = txsAfter.reduce((sum, t) => sum + Number(t.quantity), 0)
        balance += Number(ptST.physical_count) + ptTxSum
      } else {
        const ptTxSum = ptTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
        balance += ptTxSum
      }
    }

    // 2. Add unassigned transactions
    const knownProjectIds = projects.map(p => p.id)
    const unassignedTxs = transactions.filter(t => 
      t.size_id === sizeId && 
      !t.project_type_id && 
      (!t.project_id || !knownProjectIds.includes(t.project_id))
    )
    balance += unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)

    return { balance, hasST, latestSTDate }
  }

  // Global KPIs
  let totalBalance = 0
  let totalUsage7d = 0
  let totalIncoming = 0
  let totalWastage = 0
  let totalSuspended = 0

  sizes.forEach(size => {
    const { balance } = getSizeBalanceInfo(size.id)
    totalBalance += balance
  })

  transactions.forEach(tx => {
    const q = Math.abs(Number(tx.quantity))
    if (tx.type === 'usage' && tx.transaction_date >= sevenDaysAgoStr) {
      totalUsage7d += q
    }
    if (tx.type === 'incoming') {
      totalIncoming += Number(tx.quantity)
    }
    if (tx.type === 'wastage') {
      totalWastage += q
    }
    if (tx.type === 'suspended') {
      totalSuspended += q
    }
    if (tx.type === 'unsuspend') {
      totalSuspended -= q
    }
  })

  totalSuspended = Math.max(totalSuspended, 0)
  const totalUsableBalance = Math.max(totalBalance - totalSuspended, 0)
  const avgDailyUsage7d = totalUsage7d / 7
  const globalDaysCoverage = avgDailyUsage7d > 0 ? totalUsableBalance / avgDailyUsage7d : 0

  // Per-size stats with natural sorting
  const sizeStats = sizes.map(size => {
    const sizeTxs = transactions.filter(t => t.size_id === size.id)
    const { balance, hasST, latestSTDate } = getSizeBalanceInfo(size.id)

    let usage7d = 0
    let todayUsage = 0
    let suspended = 0

    sizeTxs.forEach(tx => {
      const q = Math.abs(Number(tx.quantity))
      if (tx.type === 'usage' && tx.transaction_date >= sevenDaysAgoStr) {
        usage7d += q
      }
      if (tx.type === 'usage' && tx.transaction_date === todayStr) {
        todayUsage += q
      }
      if (tx.type === 'suspended') {
        suspended += q
      }
      if (tx.type === 'unsuspend') {
        suspended -= q
      }
    })

    suspended = Math.max(suspended, 0)
    const usableBalance = Math.max(balance - suspended, 0)

    const avgDailyUsage = usage7d / 7
    const targetDailyUsage = Number(size.target_daily_usage) || 0

    const coverage = targetDailyUsage > 0
      ? (usableBalance / targetDailyUsage)
      : (avgDailyUsage > 0 ? (usableBalance / avgDailyUsage) : 0)

    const dailyDemand = targetDailyUsage > 0 ? targetDailyUsage : avgDailyUsage
    const requiredForTarget = targetCoverageDays * dailyDemand
    const requireOrder = requiredForTarget > usableBalance ? (requiredForTarget - usableBalance) : 0

    const stockLevelPct = targetCoverageDays > 0
      ? Math.min(Math.max((coverage / targetCoverageDays) * 100, 0), 100)
      : 0

    return {
      size: size.size,
      unit: size.unit || 'T',
      balance,
      suspended,
      usableBalance,
      avgDailyUsage,
      todayUsage,
      coverage,
      targetDailyUsage,
      requireOrder,
      stockLevelPct,
      hasStockTake: hasST,
      lastStockTakeDate: latestSTDate
    }
  }).filter(s => s.balance !== 0 || s.usableBalance !== 0 || s.avgDailyUsage > 0 || s.targetDailyUsage > 0 || s.todayUsage > 0)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Global KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6 mb-10">
        <div className="border rounded-xl p-5 bg-white shadow-sm">
          <h3 className="font-semibold text-xs text-gray-500 uppercase">Total Stock</h3>
          <p className="text-2xl font-bold mt-1 text-slate-800">{totalBalance.toFixed(2)} T</p>
          <p className="text-xs text-gray-400 mt-1">Physical balance</p>
        </div>
        <div className="border rounded-xl p-5 bg-amber-50/70 border-amber-200 shadow-sm">
          <h3 className="font-semibold text-xs text-amber-700 uppercase">Suspended</h3>
          <p className="text-2xl font-bold mt-1 text-amber-800">{totalSuspended.toFixed(2)} T</p>
          <p className="text-xs text-amber-600 mt-1">Held / Quarantined</p>
        </div>
        <div className="border rounded-xl p-5 bg-blue-50/70 border-blue-200 shadow-sm">
          <h3 className="font-semibold text-xs text-blue-700 uppercase">Usable Balance</h3>
          <p className="text-2xl font-bold mt-1 text-blue-900">{totalUsableBalance.toFixed(2)} T</p>
          <p className="text-xs text-blue-600 mt-1">Total - Suspended</p>
        </div>
        <div className="border rounded-xl p-5 bg-white shadow-sm">
          <h3 className="font-semibold text-xs text-gray-500 uppercase">Avg Daily (7d)</h3>
          <p className="text-2xl font-bold mt-1 text-slate-800">{avgDailyUsage7d.toFixed(2)} T</p>
        </div>
        <div className="border rounded-xl p-5 bg-white shadow-sm">
          <h3 className="font-semibold text-xs text-gray-500 uppercase">Total Incoming</h3>
          <p className="text-2xl font-bold mt-1 text-green-600">+{totalIncoming.toFixed(2)} T</p>
        </div>
        <div className="border rounded-xl p-5 bg-white shadow-sm">
          <h3 className="font-semibold text-xs text-gray-500 uppercase">Usable Coverage</h3>
          <p className={`text-2xl font-bold mt-1 ${globalDaysCoverage < 3 ? 'text-red-500' : 'text-slate-800'}`}>
            {globalDaysCoverage > 999 ? '∞' : globalDaysCoverage.toFixed(1)} Days
          </p>
        </div>
      </div>

      {/* Visual Rebar Stock Graph */}
      <RebarStockChart stats={sizeStats} />

      {/* Trends Chart */}
      <div className="bg-white border rounded-xl shadow-sm mb-10">
        <div className="px-6 pt-6 pb-2 border-b">
          <h2 className="text-xl font-bold text-slate-900">Inventory Trends (Incoming, Usage & Wastage)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Historical and custom range activity tracking</p>
        </div>
        <UsageTrendsChart transactions={transactions} />
      </div>

      {/* Breakdown by Rebar Size */}
      <h2 className="text-xl font-bold mb-4">Breakdown by Rebar Size</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Level</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase bg-amber-50/50">Suspended</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-blue-800 uppercase bg-blue-50/50">Usable Balance</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Today Usage</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Daily</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Daily (7d)</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Usable Coverage</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Stock Take</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-blue-50">Req. Order ({targetCoverageDays}d)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sizeStats.map((stat, i) => {
              const meterColor = stat.stockLevelPct < 25 ? 'bg-red-500' : stat.stockLevelPct < 60 ? 'bg-yellow-400' : 'bg-green-500'
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-4 font-bold text-slate-700 text-lg">{stat.size}</td>
                  <td className="px-4 py-4 w-32">
                    <div className="flex flex-col gap-1">
                      <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                        <div className={`${meterColor} h-4 rounded-full transition-all`} style={{ width: `${Math.max(stat.stockLevelPct, 2)}%` }} />
                      </div>
                      <span className={`text-xs font-bold text-center ${stat.stockLevelPct < 25 ? 'text-red-600' : stat.stockLevelPct < 60 ? 'text-yellow-700' : 'text-green-700'}`}>
                        {stat.stockLevelPct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-slate-600 font-medium">{stat.balance.toFixed(2)} {stat.unit}</td>
                  <td className="px-4 py-4 text-amber-700 font-medium bg-amber-50/30">{stat.suspended > 0 ? `${stat.suspended.toFixed(2)} ${stat.unit}` : '-'}</td>
                  <td className="px-4 py-4 text-blue-900 font-bold bg-blue-50/30">{stat.usableBalance.toFixed(2)} {stat.unit}</td>
                  <td className="px-4 py-4 text-red-600 font-medium">{stat.todayUsage > 0 ? stat.todayUsage.toFixed(2) : '-'}</td>
                  <td className="px-4 py-4 text-slate-500">
                    {stat.targetDailyUsage > 0 ? `${stat.targetDailyUsage.toFixed(2)} ${stat.unit}/d` : <span className="text-gray-300 italic text-xs">not set</span>}
                  </td>
                  <td className="px-4 py-4 text-slate-600">{stat.avgDailyUsage.toFixed(2)}</td>
                  <td className={`px-4 py-4 font-bold ${stat.coverage < 3 ? 'text-red-500' : stat.coverage < 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {stat.targetDailyUsage > 0 || stat.avgDailyUsage > 0
                      ? (stat.coverage > 999 ? '∞' : stat.coverage.toFixed(1) + ' Days')
                      : '-'}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500">
                    {stat.hasStockTake ? <span className="text-green-700 font-medium">✓ {stat.lastStockTakeDate}</span> : <span className="text-gray-300">No stock take</span>}
                  </td>
                  <td className={`px-4 py-4 font-bold bg-blue-50 ${stat.requireOrder > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                    {stat.requireOrder > 0 ? stat.requireOrder.toFixed(2) : '-'}
                  </td>
                </tr>
              )
            })}
            {sizeStats.length === 0 && (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-500">No active stock or usage data.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
