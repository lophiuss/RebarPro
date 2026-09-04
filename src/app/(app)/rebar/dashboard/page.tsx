export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import UsageTrendsChart from '@/components/UsageTrendsChart'
import StockBalanceLineChart from '@/components/StockBalanceLineChart'
import ShoutoutBoard from '@/components/ShoutoutBoard'
import { naturalSort } from '@/lib/utils/sort'
import { fmtQty, fmtQtyNum, unitLabel, type DefaultUnit } from '@/lib/utils/unit'

interface SearchParams {
  period?: string
  from?: string
  to?: string
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams
  const period = (['this_month', 'last_month', 'custom'].includes(rawPeriod || '') ? rawPeriod : 'all') as 'all' | 'this_month' | 'last_month' | 'custom'

  const supabase = await createClient()

  const [txRes, sizesRes, settingsRes, stRes, pTypesRes, projectsRes] = await Promise.all([
    supabase.from('transactions').select('quantity, type, transaction_date, size_id, project_type_id, project_id'),
    supabase.from('rebar_sizes').select('*'),
    supabase.from('global_settings').select('target_coverage_days, default_unit').eq('id', 1).single(),
    supabase.from('stock_takes').select('id, size_id, stock_take_date, physical_count, project_type_id').order('stock_take_date', { ascending: false }),
    supabase.from('project_types').select('id, name'),
    supabase.from('projects').select('id, name, project_type_id')
  ])

  const transactions = txRes.data || []
  const sizes = naturalSort(sizesRes.data || [], s => s.size)
  const targetCoverageDays = settingsRes.data?.target_coverage_days || 14
  const unit: DefaultUnit = (settingsRes.data?.default_unit as DefaultUnit) || 'kg'
  const uLabel = unitLabel(unit)

  const allStockTakes = stRes.data || []
  const projectTypes = naturalSort(pTypesRes.data || [], pt => pt.name)
  const projects = naturalSort(projectsRes.data || [], p => p.name)

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  }

  const sevenDaysAgoStr = daysAgo(7)

  // --- Period boundaries for the KPI cards (Total Stock / Suspended / Usable / Avg Daily / Incoming / Coverage) ---
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const toStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
  const lastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0)

  let periodStart: string | null = null
  let periodEnd: string = todayStr
  let periodLabel = 'All Time'

  if (period === 'this_month') {
    periodStart = toStr(firstOfMonth(today))
    periodEnd = todayStr
    periodLabel = today.toLocaleString('default', { month: 'long', year: 'numeric' })
  } else if (period === 'last_month') {
    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    periodStart = toStr(firstOfMonth(lastMonthDate))
    periodEnd = toStr(lastOfMonth(lastMonthDate))
    periodLabel = lastMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })
  } else if (period === 'custom') {
    periodStart = rawFrom || toStr(firstOfMonth(today))
    periodEnd = rawTo || todayStr
    periodLabel = `${periodStart} → ${periodEnd}`
  }

  // Transactions counted toward point-in-time balances: everything up to the end of the selected period.
  const balanceTxs = period === 'all' ? transactions : transactions.filter(t => t.transaction_date <= periodEnd)
  // Transactions counted toward flow metrics (incoming, usage): within the selected period only.
  const flowTxs = period === 'all'
    ? transactions
    : transactions.filter(t => t.transaction_date <= periodEnd && (periodStart === null || t.transaction_date >= periodStart))

  function getSizeBalanceInfo(sizeId: string, txs: typeof transactions = transactions) {
    let balance = 0
    let latestSTDate: string | null = null
    let hasST = false

    for (const pt of projectTypes) {
      const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)

      const ptTxs = txs.filter(t =>
        t.size_id === sizeId &&
        (t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id)))
      )

      const ptST = allStockTakes.find(st => st.size_id === sizeId && st.project_type_id === pt.id && st.stock_take_date <= periodEnd)

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

    const knownProjectIds = projects.map(p => p.id)
    const unassignedTxs = txs.filter(t =>
      t.size_id === sizeId &&
      !t.project_type_id &&
      (!t.project_id || !knownProjectIds.includes(t.project_id))
    )
    balance += unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)

    return { balance, hasST, latestSTDate }
  }

  let totalBalance = 0
  let totalUsage7d = 0
  let totalIncoming = 0
  let totalWastage = 0
  let totalSuspended = 0
  let periodUsage = 0

  sizes.forEach(size => {
    const { balance } = getSizeBalanceInfo(size.id, balanceTxs)
    totalBalance += balance
  })

  balanceTxs.forEach(tx => {
    const q = Math.abs(Number(tx.quantity))
    if (tx.type === 'usage' && tx.transaction_date >= sevenDaysAgoStr && tx.transaction_date <= todayStr) {
      totalUsage7d += q
    }
    if (tx.type === 'suspended') {
      totalSuspended += q
    }
    if (tx.type === 'unsuspend') {
      totalSuspended -= q
    }
  })

  flowTxs.forEach(tx => {
    const q = Math.abs(Number(tx.quantity))
    if (tx.type === 'incoming') {
      totalIncoming += Number(tx.quantity)
    }
    if (tx.type === 'wastage') {
      totalWastage += q
    }
    if (tx.type === 'usage') {
      periodUsage += q
    }
  })

  totalSuspended = Math.max(totalSuspended, 0)
  const totalUsableBalance = Math.max(totalBalance - totalSuspended, 0)

  // "All Time" keeps the original fixed trailing-7-day average; a selected period averages over its own span instead.
  const msPerDay = 24 * 60 * 60 * 1000
  const daysInPeriod = periodStart ? Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / msPerDay) + 1) : 7
  const avgDailyUsage7d = period === 'all' ? (totalUsage7d / 7) : (periodUsage / daysInPeriod)
  const avgDailyLabel = period === 'all' ? 'Avg Daily 7d' : 'Avg Daily'
  const globalDaysCoverage = avgDailyUsage7d > 0 ? totalUsableBalance / avgDailyUsage7d : 0

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
      unit: uLabel,
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 className="text-3xl font-bold">Dashboard</h1>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: 'All Time' },
              { key: 'this_month', label: 'This Month' },
              { key: 'last_month', label: 'Last Month' },
            ].map(opt => (
              <a
                key={opt.key}
                href={opt.key === 'all' ? '/rebar/dashboard' : `/rebar/dashboard?period=${opt.key}`}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition ${period === opt.key ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {opt.label}
              </a>
            ))}
          </div>
          <form method="GET" className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
            <input type="hidden" name="period" value="custom" />
            <input type="date" name="from" defaultValue={period === 'custom' ? (periodStart || '') : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" name="to" defaultValue={period === 'custom' ? periodEnd : ''} className="border rounded-md px-2 py-1 text-sm bg-white" />
            <button type="submit" className={`px-3 py-1 rounded-md text-sm font-semibold transition ${period === 'custom' ? 'bg-white shadow-sm text-slate-900' : 'text-gray-500 hover:text-gray-700'}`}>Go</button>
          </form>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-6">KPI cards below reflect <strong>{periodLabel}</strong>{period !== 'all' && ' — balances as of the end of this period, flow metrics within it'}.</p>

      <ShoutoutBoard department="rebar" />

      {/* Global KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
        <div className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">Total Stock ({uLabel})</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-800 truncate" title={fmtQty(totalBalance, unit)}>{fmtQty(totalBalance, unit)}</p>
          <p className="text-xs text-gray-400 mt-1 truncate">Physical balance</p>
        </div>
        <div className="border rounded-xl p-4 bg-amber-50/70 border-amber-200 shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-amber-700 uppercase truncate">Suspended ({uLabel})</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-amber-800 truncate" title={fmtQty(totalSuspended, unit)}>{fmtQty(totalSuspended, unit)}</p>
          <p className="text-xs text-amber-600 mt-1 truncate">Held / Quarantined</p>
        </div>
        <div className="border rounded-xl p-4 bg-blue-50/70 border-blue-200 shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-blue-700 uppercase truncate">Usable Balance ({uLabel})</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-blue-900 truncate" title={fmtQty(totalUsableBalance, unit)}>{fmtQty(totalUsableBalance, unit)}</p>
          <p className="text-xs text-blue-600 mt-1 truncate">Total - Suspended</p>
        </div>
        <div className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">{avgDailyLabel} ({uLabel}/day)</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-800 truncate" title={fmtQty(avgDailyUsage7d, unit)}>{fmtQty(avgDailyUsage7d, unit)}</p>
        </div>
        <div className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">Total Incoming ({uLabel})</h3>
          <p className="text-xl sm:text-2xl font-bold mt-1 text-green-600 truncate" title={`+${fmtQty(totalIncoming, unit)}`}>+{fmtQty(totalIncoming, unit)}</p>
        </div>
        <div className="border rounded-xl p-4 bg-white shadow-sm overflow-hidden">
          <h3 className="font-semibold text-xs text-gray-500 uppercase truncate">Usable Coverage</h3>
          <p className={`text-xl sm:text-2xl font-bold mt-1 truncate ${globalDaysCoverage < 3 ? 'text-red-500' : 'text-slate-800'}`}>
            {globalDaysCoverage > 999 ? '∞' : globalDaysCoverage.toFixed(1)} Days
          </p>
        </div>
      </div>

      {/* Stock Balance Line Chart */}
      <StockBalanceLineChart
        transactions={transactions}
        stockTakes={allStockTakes}
        sizes={sizes}
        projectTypes={projectTypes}
        projects={projects}
        unit={unit}
      />

      {/* Trends Chart */}
      <div className="bg-white border rounded-xl shadow-sm mb-10">
        <div className="px-6 pt-6 pb-2 border-b">
          <h2 className="text-xl font-bold text-slate-900">Inventory Trends (Incoming, Usage & Wastage)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Historical and custom range activity tracking ({uLabel})</p>
        </div>
        <UsageTrendsChart transactions={transactions} unit={unit} />
      </div>

      {/* Breakdown by Rebar Size Table */}
      <h2 className="text-xl font-bold mb-4">Breakdown by Rebar Size</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Level</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Balance ({uLabel})</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase bg-amber-50/50">Suspended ({uLabel})</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-blue-800 uppercase bg-blue-50/50">Usable Balance ({uLabel})</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Today Usage ({uLabel})</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Daily ({uLabel}/day)</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Daily 7d ({uLabel}/day)</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase">Usable Coverage</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Stock Take</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-blue-50">Req. Order ({targetCoverageDays}d, {uLabel})</th>
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
                  <td className="px-4 py-4 text-slate-600 font-medium whitespace-nowrap">{fmtQty(stat.balance, unit)}</td>
                  <td className="px-4 py-4 text-amber-700 font-medium bg-amber-50/30 whitespace-nowrap">{stat.suspended > 0 ? fmtQty(stat.suspended, unit) : '-'}</td>
                  <td className="px-4 py-4 text-blue-900 font-bold bg-blue-50/30 whitespace-nowrap">{fmtQty(stat.usableBalance, unit)}</td>
                  <td className="px-4 py-4 text-red-600 font-medium whitespace-nowrap">{stat.todayUsage > 0 ? fmtQty(stat.todayUsage, unit) : '-'}</td>
                  <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                    {stat.targetDailyUsage > 0 ? `${fmtQtyNum(stat.targetDailyUsage, unit)} ${uLabel}/day` : <span className="text-gray-300 italic text-xs">not set</span>}
                  </td>
                  <td className="px-4 py-4 text-slate-600 whitespace-nowrap">{fmtQtyNum(stat.avgDailyUsage, unit)}</td>
                  <td className={`px-4 py-4 font-bold whitespace-nowrap ${stat.coverage < 3 ? 'text-red-500' : stat.coverage < 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {stat.targetDailyUsage > 0 || stat.avgDailyUsage > 0
                      ? (stat.coverage > 999 ? '∞' : stat.coverage.toFixed(1) + ' Days')
                      : '-'}
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-500 whitespace-nowrap">
                    {stat.hasStockTake ? <span className="text-green-700 font-medium">✓ {stat.lastStockTakeDate}</span> : <span className="text-gray-300">No stock take</span>}
                  </td>
                  <td className={`px-4 py-4 font-bold bg-blue-50 whitespace-nowrap ${stat.requireOrder > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                    {stat.requireOrder > 0 ? fmtQty(stat.requireOrder, unit) : '-'}
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
