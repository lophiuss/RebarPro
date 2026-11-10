import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

function parseDateTime(val?: string | null, isEndOfDay = false): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isEndOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`
  }
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * GET /api/rebar/usage
 * 
 * Query rebar usage and transaction records by size, supplier, date and time.
 * 
 * Query Parameters:
 *   - from / start_date: ISO date or YYYY-MM-DD
 *   - to / end_date: ISO date or YYYY-MM-DD
 *   - size: filter by rebar size (e.g. "H10", "H13", "H16", "H20", "H25", "H28", "H32", "H40", "H6", "H8")
 *   - supplier: filter by supplier name (e.g. "CES", "KOMT")
 *   - type: transaction type ("usage" (default), "incoming", "transfer", "all")
 *   - format: "json" (default) | "csv"
 *   - page: integer (default 1)
 *   - limit: integer (default 100, max 1000)
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from') || url.searchParams.get('start_date')
  const toParam = url.searchParams.get('to') || url.searchParams.get('end_date')
  const sizeParam = (url.searchParams.get('size') || '').trim().toUpperCase()
  const supplierParam = (url.searchParams.get('supplier') || '').trim()
  const typeParam = (url.searchParams.get('type') || 'usage').toLowerCase()
  const formatParam = (url.searchParams.get('format') || 'json').toLowerCase()

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))
  const offset = (page - 1) * limit

  const fromIso = parseDateTime(fromParam, false)
  const toIso = parseDateTime(toParam, true)

  const admin = createAdminClient()

  let query = admin
    .from('transactions')
    .select(`
      id,
      transaction_date,
      type,
      quantity,
      supplier,
      do_number,
      notes,
      created_at,
      rebar_sizes!inner (
        id,
        size,
        unit,
        target_daily_usage
      ),
      projects (
        id,
        name
      )
    `, { count: 'exact' })

  // Filters
  if (typeParam !== 'all') {
    query = query.eq('type', typeParam)
  }
  if (fromIso) {
    const fromDate = fromIso.split('T')[0]
    query = query.gte('transaction_date', fromDate)
  }
  if (toIso) {
    const toDate = toIso.split('T')[0]
    query = query.lte('transaction_date', toDate)
  }
  if (sizeParam) {
    query = query.eq('rebar_sizes.size', sizeParam)
  }
  if (supplierParam) {
    query = query.ilike('supplier', `%${supplierParam}%`)
  }

  query = query.order('transaction_date', { ascending: false }).order('created_at', { ascending: false })

  if (formatParam !== 'csv') {
    query = query.range(offset, offset + limit - 1)
  }

  const { data, count, error } = await query

  if (error) {
    return jsonWithCors({
      success: false,
      error: 'Failed to query rebar transactions',
      details: error.message,
    }, { status: 500 })
  }

  const rows = data || []
  const totalCount = count || rows.length

  const mapped = rows.map((r: any) => {
    const sizeInfo = r.rebar_sizes
    const rawQty = Number(r.quantity) || 0
    // In RebarPro, usage transactions are recorded as negative values; convert to positive for usage display
    const actualUsage = r.type === 'usage' ? Math.abs(rawQty) : rawQty
    const theoreticalDaily = Number(sizeInfo?.target_daily_usage) || 0

    return {
      id: r.id,
      date: r.transaction_date,
      date_time: r.created_at,
      size: sizeInfo?.size,
      size_id: sizeInfo?.id,
      type: r.type,
      quantity: actualUsage,
      raw_quantity: rawQty,
      unit: sizeInfo?.unit || 'Kg',
      theoretical_daily_target: theoreticalDaily,
      supplier: r.supplier || null,
      do_number: r.do_number || null,
      project_name: r.projects?.name || null,
      notes: r.notes || null,
    }
  })

  // Summary by size
  const bySize: Record<string, { total_usage: number; target_daily_usage: number; unit: string; count: number; suppliers: string[] }> = {}
  let totalUsage = 0

  for (const m of mapped) {
    if (m.type === 'usage') {
      totalUsage += m.quantity
      if (!bySize[m.size]) {
        bySize[m.size] = {
          total_usage: 0,
          target_daily_usage: m.theoretical_daily_target,
          unit: m.unit,
          count: 0,
          suppliers: [],
        }
      }
      bySize[m.size].total_usage += m.quantity
      bySize[m.size].count += 1
      if (m.supplier && !bySize[m.size].suppliers.includes(m.supplier)) {
        bySize[m.size].suppliers.push(m.supplier)
      }
    }
  }

  for (const k of Object.keys(bySize)) {
    bySize[k].total_usage = round2(bySize[k].total_usage)
  }

  if (formatParam === 'csv') {
    const headers = ['Date', 'DateTime', 'Size', 'Type', 'Quantity', 'Unit', 'Target Daily', 'Supplier', 'DO Number', 'Project', 'Notes']
    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return ''
      const s = String(str)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = mapped.map(r => [
      escapeCsv(r.date),
      escapeCsv(r.date_time),
      escapeCsv(r.size),
      escapeCsv(r.type),
      r.quantity,
      escapeCsv(r.unit),
      r.theoretical_daily_target,
      escapeCsv(r.supplier),
      escapeCsv(r.do_number),
      escapeCsv(r.project_name),
      escapeCsv(r.notes),
    ].join(','))

    return new NextResponse([headers.join(','), ...lines].join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="rebar-usage-${new Date().toISOString().split('T')[0]}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  return jsonWithCors({
    success: true,
    filters: {
      from: fromIso ? fromIso.split('T')[0] : null,
      to: toIso ? toIso.split('T')[0] : null,
      size: sizeParam || null,
      supplier: supplierParam || null,
      type: typeParam,
    },
    summary: {
      total_records: totalCount,
      total_usage_kg: round2(totalUsage),
      total_usage_tonnes: round2(totalUsage / 1000),
      by_size: bySize,
    },
    pagination: {
      page,
      limit,
      total_records: totalCount,
      total_pages: Math.ceil(totalCount / limit) || 1,
      has_more: offset + mapped.length < totalCount,
    },
    data: mapped,
  })
}

/**
 * POST /api/rebar/usage
 * 
 * Ingest rebar usage or incoming delivery records from another website.
 * 
 * Payload:
 * [
 *   {
 *     "date": "2026-11-10",
 *     "size": "H16",
 *     "quantity": 2500,
 *     "type": "usage",
 *     "supplier": "CES",
 *     "do_number": "DO-9921",
 *     "notes": "Bay 4 slab"
 *   }
 * ]
 */
export async function POST(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch (err) {
    return jsonWithCors({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  const rawItems = Array.isArray(body) ? body : Array.isArray(body.records) ? body.records : [body]
  if (rawItems.length === 0) {
    return jsonWithCors({ success: false, error: 'No rebar records provided in body' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Pre-fetch rebar sizes
  const { data: sizes } = await admin.from('rebar_sizes').select('id, size')
  const sizeMap = new Map<string, string>()
  for (const s of sizes || []) {
    sizeMap.set(s.size.trim().toUpperCase(), s.id)
  }

  const toInsert: any[] = []
  const validationErrors: string[] = []

  rawItems.forEach((item: any, idx: number) => {
    const prefix = `Item [${idx}]`
    const sizeName = (item.size || item.rebar_size || '').trim().toUpperCase()
    const sizeId = item.size_id || sizeMap.get(sizeName)

    if (!sizeId) {
      validationErrors.push(`${prefix}: Valid rebar "size" is required (e.g. H6, H8, H10, H12, H13, H16, H20, H25, H28, H32, H40).`)
      return
    }

    const qty = Number(item.quantity || item.actual_usage || item.amount)
    if (isNaN(qty) || qty === 0) {
      validationErrors.push(`${prefix}: "quantity" must be a non-zero number.`)
      return
    }

    const type = (item.type || 'usage').toLowerCase()
    // In RebarPro transactions, usage is negative; incoming is positive
    const adjustedQty = type === 'usage' ? -Math.abs(qty) : Math.abs(qty)

    const txDate = item.date || item.transaction_date || new Date().toISOString().split('T')[0]

    toInsert.push({
      size_id: sizeId,
      transaction_date: txDate,
      type,
      quantity: adjustedQty,
      supplier: item.supplier ? String(item.supplier).trim() : null,
      do_number: item.do_number ? String(item.do_number).trim() : null,
      project_id: item.project_id || null,
      project_type_id: item.project_type_id || null,
      notes: item.notes || null,
    })
  })

  if (validationErrors.length > 0) {
    return jsonWithCors({
      success: false,
      error: 'Validation failed for some records',
      details: validationErrors,
    }, { status: 400 })
  }

  const { data: inserted, error: insertError } = await admin
    .from('transactions')
    .insert(toInsert)
    .select(`
      id,
      transaction_date,
      type,
      quantity,
      supplier,
      do_number,
      notes,
      rebar_sizes (size, unit)
    `)

  if (insertError) {
    return jsonWithCors({
      success: false,
      error: 'Failed to record rebar transactions',
      details: insertError.message,
    }, { status: 500 })
  }

  return jsonWithCors({
    success: true,
    message: `Successfully recorded ${toInsert.length} rebar transaction(s).`,
    inserted_count: toInsert.length,
    data: inserted,
  }, { status: 201 })
}
