import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// Builds the real-data snapshot the AI Helper is grounded in. Every number
// here comes straight from a query — nothing is estimated or invented here;
// if the model needs to reason beyond this (e.g. a forecast), the prompt
// instructs it to base that reasoning only on the figures included below.

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }

async function buildRebarSnapshot(supabase: SupabaseClient) {
  const [{ data: transactions }, { data: sizes }, { data: stockTakes }] = await Promise.all([
    supabase.from('transactions').select('quantity, type, transaction_date, size_id'),
    supabase.from('rebar_sizes').select('id, size, target_daily_usage'),
    supabase.from('stock_takes').select('size_id, stock_take_date, physical_count').order('stock_take_date', { ascending: false }),
  ])
  const txs = transactions || []
  const today = todayStr()
  const fourteenAgo = daysAgoStr(14)

  const sizeRows = (sizes || []).map(size => {
    const st = (stockTakes || []).find(s => s.size_id === size.id)
    const txsAfter = st ? txs.filter(t => t.size_id === size.id && t.transaction_date > st.stock_take_date) : txs.filter(t => t.size_id === size.id)
    const balance = (st ? Number(st.physical_count) : 0) + txsAfter.reduce((s, t) => s + Number(t.quantity), 0)

    const sizeTxs = txs.filter(t => t.size_id === size.id)
    let suspended = 0, usage14d = 0
    for (const t of sizeTxs) {
      const q = Math.abs(Number(t.quantity))
      if (t.type === 'suspended') suspended += q
      if (t.type === 'unsuspend') suspended -= q
      if (t.type === 'usage' && t.transaction_date >= fourteenAgo) usage14d += q
    }
    suspended = Math.max(suspended, 0)
    const usableBalance = Math.max(balance - suspended, 0)
    const avgDaily14d = usage14d / 14
    const targetDaily = Number(size.target_daily_usage) || 0
    const demand = targetDaily > 0 ? targetDaily : avgDaily14d
    const coverageDays = demand > 0 ? usableBalance / demand : null
    return { size: size.size, usable_balance_tonnes: Number(usableBalance.toFixed(2)), avg_daily_usage_14d_tonnes: Number(avgDaily14d.toFixed(3)), coverage_days: coverageDays === null ? null : Number(coverageDays.toFixed(1)) }
  }).filter(r => r.usable_balance_tonnes !== 0 || r.avg_daily_usage_14d_tonnes > 0)

  const sevenAgo = daysAgoStr(7)
  const sumBy = (type: string, sinceDate: string, exact?: string) => txs
    .filter(t => t.type === type && (exact ? t.transaction_date === exact : t.transaction_date >= sinceDate))
    .reduce((s, t) => s + Math.abs(Number(t.quantity)), 0)

  const lowCoverageSizes = sizeRows.filter(r => r.coverage_days !== null && r.coverage_days < 3)

  return {
    sizes: sizeRows,
    today_usage_tonnes: Number(sumBy('usage', '', today).toFixed(2)),
    today_incoming_tonnes: Number(sumBy('incoming', '', today).toFixed(2)),
    last_7_days_usage_tonnes: Number(sumBy('usage', sevenAgo).toFixed(2)),
    last_7_days_incoming_tonnes: Number(sumBy('incoming', sevenAgo).toFixed(2)),
    sizes_below_3_days_coverage: lowCoverageSizes,
  }
}

async function buildCementSnapshot(supabase: SupabaseClient) {
  const today = todayStr()
  const [{ data: stock }, { data: silos }, { data: todayStockTake }, { data: todayUsage }, { data: recentAlerts }, { data: weightIns7d }] = await Promise.all([
    supabase.rpc('cement_silo_stock'),
    supabase.from('cement_silos').select('id, name, cement_plants(name), cement_silo_materials(cement_materials(name))').eq('is_active', true),
    supabase.from('cement_daily_stock_take').select('silo_id').eq('take_date', today),
    supabase.from('cement_daily_usage').select('silo_id').eq('usage_date', today),
    supabase.from('cement_alert_log').select('alert_date, plant_name, material_name, variance_pct, alert_type').gte('alert_date', daysAgoStr(7)).order('alert_date', { ascending: false }),
    supabase.from('cement_weight_in').select('weigh_date, do_weight').gte('weigh_date', daysAgoStr(7)),
  ])

  const stockDoneIds = new Set((todayStockTake || []).map((r: any) => r.silo_id))
  const usageDoneIds = new Set((todayUsage || []).map((r: any) => r.silo_id))
  const missingToday = (silos || []).filter((s: any) => !stockDoneIds.has(s.id) || !usageDoneIds.has(s.id)).map((s: any) => {
    const sm = Array.isArray(s.cement_silo_materials) ? s.cement_silo_materials[0] : s.cement_silo_materials
    return {
      plant: s.cement_plants?.name || '-',
      silo: s.name,
      material: sm?.cement_materials?.name ?? null,
      missing_stock_take: !stockDoneIds.has(s.id),
      missing_usage: !usageDoneIds.has(s.id),
    }
  })

  return {
    current_stock_by_silo: stock || [],
    silos_missing_todays_entry: missingToday,
    recent_variance_alerts_7d: (recentAlerts || []).map((a: any) => ({ date: a.alert_date, plant: a.plant_name, material: a.material_name, variance_pct: a.variance_pct, type: a.alert_type })),
    last_7_days_deliveries_count: (weightIns7d || []).length,
    last_7_days_deliveries_tonnes: Number((weightIns7d || []).reduce((s: number, r: any) => s + Number(r.do_weight || 0), 0).toFixed(2)),
  }
}

async function buildSecuritySnapshot(supabase: SupabaseClient) {
  const today = todayStr()
  const startOfDay = new Date(today + 'T00:00:00').toISOString()
  const sevenDaysAgo = new Date(daysAgoStr(7) + 'T00:00:00').toISOString()
  const thirtyDaysAgo = new Date(daysAgoStr(30) + 'T00:00:00').toISOString()
  const [{ data: guardPosts }, { data: todayPostLogs }, { data: openShifts }, { data: entries7d }, { data: entries30dCategoryOnly }, { data: overstayed }, { data: incidents }, { data: panics }] = await Promise.all([
    supabase.from('security_guard_posts').select('id, name'),
    supabase.from('security_post_logs').select('post_name, guard_name, time_in, time_out').gte('time_in', startOfDay),
    supabase.from('security_post_logs').select('post_name, guard_name, time_in').is('time_out', null).order('time_in', { ascending: true }),
    supabase.from('security_entries').select('category, status, time_in').gte('time_in', sevenDaysAgo),
    supabase.from('security_entries').select('category').gte('time_in', thirtyDaysAgo),
    supabase.from('security_entries').select('category, person_name, time_in').eq('status', 'in').lt('time_in', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase.from('security_incidents').select('type, severity, description, created_at').gte('created_at', daysAgoStr(7)),
    supabase.from('security_panic_logs').select('triggered_by, remark, created_at').gte('created_at', daysAgoStr(7)),
  ])

  const postsCoveredToday = new Set((todayPostLogs || []).map((p: any) => p.post_name))
  const postsNotYetLogged = (guardPosts || []).filter((p: any) => !postsCoveredToday.has(p.name)).map((p: any) => p.name)

  const now = Date.now()
  const overdueShifts = (openShifts || []).filter((s: any) => (now - new Date(s.time_in).getTime()) / 3600000 > 14)

  const countBy = (rows: any[], pred: (r: any) => boolean) => {
    const counts: Record<string, number> = {}
    for (const e of rows) if (pred(e)) counts[e.category] = (counts[e.category] || 0) + 1
    return counts
  }

  return {
    guard_posts_not_logged_today: postsNotYetLogged,
    shifts_overdue_over_14h: overdueShifts.map((s: any) => ({ post: s.post_name, guard: s.guard_name, since: s.time_in })),
    today_entry_counts_by_category: countBy(entries7d || [], e => e.time_in >= startOfDay),
    last_7_days_entry_counts_by_category: countBy(entries7d || [], () => true),
    last_30_days_entry_counts_by_category: countBy(entries30dCategoryOnly || [], () => true),
    entries_overstayed_over_24h: (overstayed || []).map((e: any) => ({ category: e.category, name: e.person_name, since: e.time_in })),
    incidents_last_7d: incidents || [],
    panic_alerts_last_7d: panics || [],
  }
}

export async function buildGroundingSnapshot(supabase: SupabaseClient) {
  const [rebar, cement, security] = await Promise.all([
    buildRebarSnapshot(supabase).catch(e => ({ error: String(e?.message || e) })),
    buildCementSnapshot(supabase).catch(e => ({ error: String(e?.message || e) })),
    buildSecuritySnapshot(supabase).catch(e => ({ error: String(e?.message || e) })),
  ])
  return { generated_at: new Date().toISOString(), today: todayStr(), rebar, cement, security }
}
