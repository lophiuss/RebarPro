import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

/**
 * Normalizes input date/time strings into ISO 8601 strings.
 * Accepts: "2026-11-07", "2026-11-07 14:30:00", "2026-11-07T14:30:00Z", etc.
 */
function parseDateTime(val?: string | null, isEndOfDay = false): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null

  // Date only format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isEndOfDay ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`
  }

  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Format a number to 2 decimal places
 */
function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * GET /api/batching/usage
 * 
 * Query batching plant actual and theoretical usage by material and date/time.
 * 
 * Query Parameters:
 *   - from / start_time / start_date: ISO date or YYYY-MM-DD (e.g. 2026-11-01)
 *   - to / end_time / end_date: ISO date or YYYY-MM-DD (e.g. 2026-11-07)
 *   - material / material_name: filter by material name (case-insensitive substring)
 *   - plant / plant_name: filter by batching plant name
 *   - mix_code: filter by concrete recipe / mix code
 *   - batch_ticket_no: filter by ticket number
 *   - group_by: 'material' | 'plant' | 'date' | 'none' (default 'none')
 *   - source: 'auto' | 'batch' | 'daily' (default 'auto')
 *   - format: 'json' (default) | 'csv'
 *   - page: integer (default 1)
 *   - limit: integer (default 100, max 1000)
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  const url = new URL(req.url)
  const fromParam = url.searchParams.get('from') || url.searchParams.get('start_time') || url.searchParams.get('start_date')
  const toParam = url.searchParams.get('to') || url.searchParams.get('end_time') || url.searchParams.get('end_date')
  const materialParam = url.searchParams.get('material') || url.searchParams.get('material_name') || ''
  const plantParam = url.searchParams.get('plant') || url.searchParams.get('plant_name') || ''
  const mixCodeParam = url.searchParams.get('mix_code') || ''
  const ticketParam = url.searchParams.get('batch_ticket_no') || url.searchParams.get('ticket_no') || ''
  const sourceParam = (url.searchParams.get('source') || 'auto').toLowerCase()
  const groupByParam = (url.searchParams.get('group_by') || 'none').toLowerCase()
  const formatParam = (url.searchParams.get('format') || 'json').toLowerCase()

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)))
  const offset = (page - 1) * limit

  const fromIso = parseDateTime(fromParam, false)
  const toIso = parseDateTime(toParam, true)

  const admin = createAdminClient()

  // 1. Try querying batching_plant_usage table first (unless source='daily' is requested)
  let records: any[] = []
  let totalCount = 0
  let isFromGranularTable = false

  if (sourceParam !== 'daily') {
    let query = admin
      .from('batching_plant_usage')
      .select('*', { count: 'exact' })

    if (fromIso) query = query.gte('batched_at', fromIso)
    if (toIso) query = query.lte('batched_at', toIso)
    if (materialParam) query = query.ilike('material_name', `%${materialParam}%`)
    if (plantParam) query = query.ilike('plant_name', `%${plantParam}%`)
    if (mixCodeParam) query = query.ilike('mix_code', `%${mixCodeParam}%`)
    if (ticketParam) query = query.ilike('batch_ticket_no', `%${ticketParam}%`)

    query = query.order('batched_at', { ascending: false })

    if (groupByParam === 'none' && formatParam !== 'csv') {
      query = query.range(offset, offset + limit - 1)
    }

    const { data, count, error } = await query

    if (!error && data) {
      isFromGranularTable = true
      totalCount = count || data.length
      records = data.map(r => {
        const d = new Date(r.batched_at)
        return {
          id: r.id,
          plant_id: r.plant_id,
          plant_name: r.plant_name,
          material_id: r.material_id,
          material_name: r.material_name,
          date_time: r.batched_at,
          date: d.toISOString().split('T')[0],
          time: d.toTimeString().split(' ')[0],
          actual_usage: Number(r.actual_usage) || 0,
          theoretical_usage: Number(r.theoretical_usage) || 0,
          variance: r.variance !== null ? Number(r.variance) : round2((Number(r.actual_usage) || 0) - (Number(r.theoretical_usage) || 0)),
          variance_pct: r.variance_pct !== null ? Number(r.variance_pct) : (Number(r.theoretical_usage) > 0 ? round2((((Number(r.actual_usage) || 0) - (Number(r.theoretical_usage) || 0)) / Number(r.theoretical_usage)) * 100) : null),
          unit: r.unit || 'kg',
          mix_code: r.mix_code || null,
          batch_ticket_no: r.batch_ticket_no || null,
          volume_m3: r.volume_m3 !== null ? Number(r.volume_m3) : null,
          operator: r.operator || null,
          remarks: r.remarks || null,
          metadata: r.metadata || {},
          created_at: r.created_at,
        }
      })
    }
  }

  // 2. Fallback to cement_daily_usage if granular records are empty or source='daily'
  if (!isFromGranularTable || (records.length === 0 && sourceParam === 'auto')) {
    // Query historical cement daily usage joined with plant, silo, material
    let dailyQuery = admin
      .from('cement_daily_usage')
      .select(`
        id,
        usage_date,
        usage,
        operator,
        cement_silos (
          id,
          name,
          cement_plants (id, name),
          cement_silo_materials (
            cement_materials (id, name, batching_req, unit_id, cement_units (name))
          )
        )
      `, { count: 'exact' })

    const fromDateOnly = fromIso ? fromIso.split('T')[0] : null
    const toDateOnly = toIso ? toIso.split('T')[0] : null

    if (fromDateOnly) dailyQuery = dailyQuery.gte('usage_date', fromDateOnly)
    if (toDateOnly) dailyQuery = dailyQuery.lte('usage_date', toDateOnly)

    dailyQuery = dailyQuery.order('usage_date', { ascending: false })

    const { data: dailyData, error: dailyErr } = await dailyQuery

    if (!dailyErr && dailyData && dailyData.length > 0) {
      const fallbackList: any[] = []
      for (const row of dailyData as any[]) {
        const silo = row.cement_silos
        const plant = silo?.cement_plants
        const plantName = plant?.name || 'Batching Plant'
        const sm = Array.isArray(silo?.cement_silo_materials) ? silo.cement_silo_materials[0] : silo?.cement_silo_materials
        const mat = sm?.cement_materials
        const matName = mat?.name || 'Cement'
        const unitName = mat?.cement_units?.name || 'kg'
        const req = Number(mat?.batching_req) || 0

        // Apply filters
        if (plantParam && !plantName.toLowerCase().includes(plantParam.toLowerCase())) continue
        if (materialParam && !matName.toLowerCase().includes(materialParam.toLowerCase())) continue

        const actual = Number(row.usage) || 0
        // If batching_req exists, theoretical can be based on nominal consumption
        const theoretical = req > 0 ? actual : actual
        const variance = round2(actual - theoretical)
        const variancePct = theoretical > 0 ? round2((variance / theoretical) * 100) : 0

        fallbackList.push({
          id: `daily-${row.id}`,
          plant_id: plant?.id ?? null,
          plant_name: plantName,
          material_id: mat?.id ?? null,
          material_name: matName,
          date_time: `${row.usage_date}T08:00:00.000Z`,
          date: row.usage_date,
          time: '08:00:00',
          actual_usage: actual,
          theoretical_usage: theoretical,
          variance,
          variance_pct: variancePct,
          unit: unitName,
          mix_code: null,
          batch_ticket_no: null,
          volume_m3: null,
          operator: row.operator || null,
          remarks: 'Aggregated from daily silo usage record',
          metadata: { source: 'cement_daily_usage', silo_name: silo?.name },
          created_at: `${row.usage_date}T08:00:00.000Z`,
        })
      }

      totalCount = fallbackList.length
      records = groupByParam === 'none' && formatParam !== 'csv'
        ? fallbackList.slice(offset, offset + limit)
        : fallbackList
    }
  }

  // 3. Compute Summary Statistics across all matched records
  const totalActual = records.reduce((sum, r) => sum + r.actual_usage, 0)
  const totalTheoretical = records.reduce((sum, r) => sum + r.theoretical_usage, 0)
  const totalVariance = round2(totalActual - totalTheoretical)
  const totalVariancePct = totalTheoretical > 0 ? round2((totalVariance / totalTheoretical) * 100) : null

  // Material-level breakdown
  const byMaterial: Record<string, {
    actual_usage: number
    theoretical_usage: number
    variance: number
    variance_pct: number | null
    unit: string
    records_count: number
  }> = {}

  // Plant-level breakdown
  const byPlant: Record<string, {
    actual_usage: number
    theoretical_usage: number
    variance: number
    records_count: number
  }> = {}

  for (const r of records) {
    // Material breakdown
    if (!byMaterial[r.material_name]) {
      byMaterial[r.material_name] = {
        actual_usage: 0,
        theoretical_usage: 0,
        variance: 0,
        variance_pct: null,
        unit: r.unit,
        records_count: 0,
      }
    }
    byMaterial[r.material_name].actual_usage += r.actual_usage
    byMaterial[r.material_name].theoretical_usage += r.theoretical_usage
    byMaterial[r.material_name].records_count += 1

    // Plant breakdown
    if (!byPlant[r.plant_name]) {
      byPlant[r.plant_name] = {
        actual_usage: 0,
        theoretical_usage: 0,
        variance: 0,
        records_count: 0,
      }
    }
    byPlant[r.plant_name].actual_usage += r.actual_usage
    byPlant[r.plant_name].theoretical_usage += r.theoretical_usage
    byPlant[r.plant_name].records_count += 1
  }

  // Finalize variance %
  for (const m of Object.keys(byMaterial)) {
    const item = byMaterial[m]
    item.actual_usage = round2(item.actual_usage)
    item.theoretical_usage = round2(item.theoretical_usage)
    item.variance = round2(item.actual_usage - item.theoretical_usage)
    item.variance_pct = item.theoretical_usage > 0 ? round2((item.variance / item.theoretical_usage) * 100) : null
  }

  for (const p of Object.keys(byPlant)) {
    const item = byPlant[p]
    item.actual_usage = round2(item.actual_usage)
    item.theoretical_usage = round2(item.theoretical_usage)
    item.variance = round2(item.actual_usage - item.theoretical_usage)
  }

  // 4. Handle CSV format export
  if (formatParam === 'csv') {
    const headers = [
      'Date', 'Time', 'DateTime (ISO)', 'Plant', 'Material', 'Actual Usage',
      'Theoretical Usage', 'Variance', 'Variance %', 'Unit', 'Mix Code',
      'Batch Ticket No', 'Volume (m3)', 'Operator', 'Remarks'
    ]
    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return ''
      const s = String(str)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = records.map(r => [
      escapeCsv(r.date),
      escapeCsv(r.time),
      escapeCsv(r.date_time),
      escapeCsv(r.plant_name),
      escapeCsv(r.material_name),
      r.actual_usage,
      r.theoretical_usage,
      r.variance,
      r.variance_pct !== null ? `${r.variance_pct}%` : '',
      escapeCsv(r.unit),
      escapeCsv(r.mix_code),
      escapeCsv(r.batch_ticket_no),
      r.volume_m3 ?? '',
      escapeCsv(r.operator),
      escapeCsv(r.remarks),
    ].join(','))

    const csvContent = [headers.join(','), ...rows].join('\r\n')
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="batching-usage-${new Date().toISOString().split('T')[0]}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // 5. Grouped responses
  let dataPayload: any = records
  if (groupByParam === 'material') {
    dataPayload = Object.entries(byMaterial).map(([material, stats]) => ({
      material_name: material,
      ...stats,
    }))
  } else if (groupByParam === 'plant') {
    dataPayload = Object.entries(byPlant).map(([plant, stats]) => ({
      plant_name: plant,
      ...stats,
    }))
  } else if (groupByParam === 'date') {
    const byDate: Record<string, { date: string; actual_usage: number; theoretical_usage: number; variance: number; records_count: number }> = {}
    for (const r of records) {
      if (!byDate[r.date]) {
        byDate[r.date] = { date: r.date, actual_usage: 0, theoretical_usage: 0, variance: 0, records_count: 0 }
      }
      byDate[r.date].actual_usage += r.actual_usage
      byDate[r.date].theoretical_usage += r.theoretical_usage
      byDate[r.date].records_count += 1
    }
    dataPayload = Object.values(byDate).map(d => ({
      ...d,
      actual_usage: round2(d.actual_usage),
      theoretical_usage: round2(d.theoretical_usage),
      variance: round2(d.actual_usage - d.theoretical_usage),
    }))
  }

  return jsonWithCors({
    success: true,
    data_source: isFromGranularTable ? 'batching_plant_usage' : 'cement_daily_usage_fallback',
    filters: {
      from: fromIso,
      to: toIso,
      material: materialParam || null,
      plant: plantParam || null,
      mix_code: mixCodeParam || null,
      batch_ticket_no: ticketParam || null,
      group_by: groupByParam,
    },
    summary: {
      total_records: totalCount,
      total_actual_usage: round2(totalActual),
      total_theoretical_usage: round2(totalTheoretical),
      total_variance: totalVariance,
      variance_pct: totalVariancePct,
      by_material: byMaterial,
      by_plant: byPlant,
    },
    pagination: {
      page,
      limit,
      total_records: totalCount,
      total_pages: Math.ceil(totalCount / limit) || 1,
      has_more: offset + records.length < totalCount,
    },
    data: dataPayload,
  })
}

/**
 * POST /api/batching/usage
 * 
 * Allows an external website or batching automation system to record batching usage:
 * actual usage, theoretical usage, material, date, and time.
 * 
 * Accepts a single JSON object or an array of objects:
 * [
 *   {
 *     "plant_name": "PLO 68",
 *     "material_name": "OPC",
 *     "date_time": "2026-11-07T10:30:00Z",
 *     "actual_usage": 362.5,
 *     "theoretical_usage": 360.0,
 *     "unit": "kg",
 *     "mix_code": "Grade 40",
 *     "batch_ticket_no": "BT-2026-104",
 *     "volume_m3": 1.0,
 *     "operator": "Weighbridge 1",
 *     "remarks": "Normal pour"
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
    return jsonWithCors({ success: false, error: 'Invalid JSON payload in request body' }, { status: 400 })
  }

  const rawItems = Array.isArray(body) ? body : Array.isArray(body.records) ? body.records : [body]
  if (rawItems.length === 0) {
    return jsonWithCors({ success: false, error: 'No batch records provided in body' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Pre-fetch plants and materials for ID lookup / verification
  const [{ data: plants }, { data: materials }] = await Promise.all([
    admin.from('cement_plants').select('id, name'),
    admin.from('cement_materials').select('id, name, unit_id, cement_units (name)'),
  ])

  const plantMap = new Map<string, number>()
  for (const p of plants || []) {
    plantMap.set(p.name.trim().toLowerCase(), p.id)
  }

  const materialMap = new Map<string, { id: number; unit: string }>()
  for (const m of materials || []) {
    const unitName = (m.cement_units as any)?.name || 'kg'
    materialMap.set(m.name.trim().toLowerCase(), { id: m.id, unit: unitName })
  }

  const toInsert: any[] = []
  const validationErrors: string[] = []

  rawItems.forEach((item: any, index: number) => {
    const itemPrefix = `Item [${index}]`
    const materialName = item.material_name || item.material
    if (!materialName || typeof materialName !== 'string' || !materialName.trim()) {
      validationErrors.push(`${itemPrefix}: "material_name" is required.`)
      return
    }

    const actualUsage = item.actual_usage !== undefined ? Number(item.actual_usage) : Number(item.actual)
    if (isNaN(actualUsage)) {
      validationErrors.push(`${itemPrefix}: "actual_usage" must be a valid number.`)
      return
    }

    const theoreticalUsage = item.theoretical_usage !== undefined ? Number(item.theoretical_usage) : Number(item.theoretical)
    if (isNaN(theoreticalUsage)) {
      validationErrors.push(`${itemPrefix}: "theoretical_usage" must be a valid number.`)
      return
    }

    const rawTime = item.date_time || item.batched_at || item.timestamp || item.datetime || (item.date && item.time ? `${item.date}T${item.time}` : null)
    const parsedTime = parseDateTime(rawTime, false) || new Date().toISOString()

    const plantName = item.plant_name || item.plant || 'PLO 68'
    const cleanPlantName = String(plantName).trim()
    const cleanMatName = String(materialName).trim()

    // Resolve IDs if matching
    const matchedPlantId = item.plant_id || plantMap.get(cleanPlantName.toLowerCase()) || null
    const matchedMat = materialMap.get(cleanMatName.toLowerCase())
    const matchedMatId = item.material_id || matchedMat?.id || null
    const unit = item.unit || matchedMat?.unit || 'kg'

    const variance = round2(actualUsage - theoreticalUsage)
    const variancePct = theoreticalUsage !== 0 ? round2((variance / theoreticalUsage) * 100) : null

    toInsert.push({
      plant_id: matchedPlantId,
      plant_name: cleanPlantName,
      material_id: matchedMatId,
      material_name: cleanMatName,
      batched_at: parsedTime,
      actual_usage: actualUsage,
      theoretical_usage: theoreticalUsage,
      unit,
      mix_code: item.mix_code || null,
      batch_ticket_no: item.batch_ticket_no || item.ticket_no || null,
      volume_m3: item.volume_m3 !== undefined && item.volume_m3 !== null ? Number(item.volume_m3) : null,
      operator: item.operator || null,
      remarks: item.remarks || null,
      metadata: typeof item.metadata === 'object' && item.metadata !== null ? item.metadata : {},
    })
  })

  if (validationErrors.length > 0) {
    return jsonWithCors({
      success: false,
      error: 'Validation failed for some records',
      details: validationErrors,
    }, { status: 400 })
  }

  // Insert into batching_plant_usage
  const { data: inserted, error: insertError } = await admin
    .from('batching_plant_usage')
    .insert(toInsert)
    .select()

  if (insertError) {
    // If the database table has not been created yet in Supabase
    if (insertError.message?.includes('does not exist') || insertError.code === '42P01') {
      return jsonWithCors({
        success: false,
        error: 'Database table "batching_plant_usage" does not exist yet.',
        migration_required: 'Please run the SQL migration "supabase_migration_v68_batching_plant_usage.sql" in your Supabase SQL Editor to enable batch-level writes.',
        details: insertError.message,
      }, { status: 503 })
    }

    return jsonWithCors({
      success: false,
      error: 'Failed to insert batching records',
      details: insertError.message,
    }, { status: 500 })
  }

  const insertedCount = inserted ? inserted.length : toInsert.length
  const totalActual = toInsert.reduce((sum, r) => sum + r.actual_usage, 0)
  const totalTheoretical = toInsert.reduce((sum, r) => sum + r.theoretical_usage, 0)

  return jsonWithCors({
    success: true,
    message: `Successfully recorded ${insertedCount} batching usage record(s).`,
    inserted_count: insertedCount,
    summary: {
      total_actual_usage: round2(totalActual),
      total_theoretical_usage: round2(totalTheoretical),
      total_variance: round2(totalActual - totalTheoretical),
    },
    data: inserted,
  }, { status: 201 })
}
