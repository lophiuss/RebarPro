import { createAdminClient } from '@/lib/supabase/admin'
import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * GET /api/rebar/stock
 * 
 * Returns current stock balances across all rebar sizes:
 *   - Current physical count (from latest physical stock take)
 *   - Current theoretical / system balance (including subsequent transactions)
 *   - Target daily usage
 *   - Estimated days of coverage
 *   - Variance from physical count
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  const url = new URL(req.url)
  const supplierFilter = (url.searchParams.get('supplier') || '').trim()

  const admin = createAdminClient()

  const [{ data: sizes }, { data: stockTakes }, { data: transactions }] = await Promise.all([
    admin.from('rebar_sizes').select('*').order('size'),
    admin.from('stock_takes').select('*').order('stock_take_date', { ascending: false }),
    admin.from('transactions').select('size_id, quantity, type, transaction_date, supplier'),
  ])

  const allSizes = sizes || []
  const allSTs = stockTakes || []
  const allTxs = transactions || []

  const stockList = allSizes.map(s => {
    // Find latest stock take for this size
    let matchedSTs = allSTs.filter((st: any) => st.size_id === s.id)
    if (supplierFilter) {
      matchedSTs = matchedSTs.filter((st: any) => (st.supplier || '').toLowerCase() === supplierFilter.toLowerCase())
    }
    const latestST = matchedSTs[0]
    const basePhysicalCount = latestST ? Number(latestST.physical_count) || 0 : 0
    const anchorDate = latestST ? latestST.stock_take_date : '1970-01-01'

    // Sum transactions after anchor date
    let subsequentTxs = allTxs.filter((tx: any) => tx.size_id === s.id && tx.transaction_date > anchorDate)
    if (supplierFilter) {
      subsequentTxs = subsequentTxs.filter((tx: any) => (tx.supplier || '').toLowerCase() === supplierFilter.toLowerCase())
    }
    const postCountTxSum = subsequentTxs.reduce((acc: number, tx: any) => acc + (Number(tx.quantity) || 0), 0)

    // Current theoretical balance
    const theoreticalBalance = latestST ? basePhysicalCount + postCountTxSum : allTxs.filter((tx: any) => tx.size_id === s.id).reduce((acc: number, tx: any) => acc + (Number(tx.quantity) || 0), 0)

    const targetDaily = Number(s.target_daily_usage) || 0
    const daysOfCoverage = targetDaily > 0 && theoreticalBalance > 0 ? round2(theoreticalBalance / targetDaily) : null

    return {
      size_id: s.id,
      size: s.size,
      unit: s.unit || 'Kg',
      theoretical_balance_kg: round2(theoreticalBalance),
      theoretical_balance_tonnes: round2(theoreticalBalance / 1000),
      last_physical_count_kg: latestST ? round2(basePhysicalCount) : null,
      last_stock_take_date: latestST ? latestST.stock_take_date : null,
      variance_at_last_stock_take: latestST ? round2(Number(latestST.variance) || 0) : null,
      target_daily_usage_kg: targetDaily,
      days_of_coverage: daysOfCoverage,
    }
  })

  const totalTheoreticalKg = stockList.reduce((sum, item) => sum + Math.max(0, item.theoretical_balance_kg), 0)

  return jsonWithCors({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      total_stock_kg: round2(totalTheoreticalKg),
      total_stock_tonnes: round2(totalTheoreticalKg / 1000),
      total_sizes: stockList.length,
    },
    data: stockList,
  })
}
