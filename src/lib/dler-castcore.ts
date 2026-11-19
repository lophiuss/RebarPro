import { createAdminClient } from '@/lib/supabase/admin'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS_PER_CHUNK = 31
const MAX_TOTAL_DAYS = 366
const FETCH_TIMEOUT_MS = 75_000
const MAX_429_RETRIES = 2

export interface CastcoreSyncOptions {
  startDate: string
  endDate: string
  overwriteManual?: boolean
  updatedBy?: string | null
}

export interface CastcoreSyncResult {
  startDate: string
  endDate: string
  chunksFetched: number
  partial: boolean
  partialProjects: { code: string; name: string; error: string }[]
  matchedProjects: number
  upsertedRows: number
  skippedManualRows: number
  zeroClearedRows: number
  unmappedWithVolume: { code: string; name: string; totalCastM3: number }[]
  totalCastM3Synced: number
  rateLimitRemaining: number | null
}

interface CastcoreDailyPoint {
  date: string
  casting_volume: number
  delivery_volume?: number
  batching_volume?: number
  batching_loads?: number
}

interface CastcoreProject {
  id: number
  code: string
  name: string
  type: string
  error: string | null
  daily: CastcoreDailyPoint[]
}

interface CastcoreApiResponse {
  status: boolean
  message?: string
  data?: {
    company_id: number
    start_date: string
    end_date: string
    timezone: string
    partial: boolean
    projects: CastcoreProject[]
    errors?: Record<string, string[]>
  }
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

function parseUtcDate(dateStr: string): Date {
  if (!DATE_RE.test(dateStr)) {
    throw new Error(`Invalid date format "${dateStr}". Expected YYYY-MM-DD.`)
  }
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`Invalid calendar date "${dateStr}".`)
  }
  return dt
}

function formatUtcDate(dt: Date): string {
  return dt.toISOString().slice(0, 10)
}

function addUtcDays(dt: Date, days: number): Date {
  const next = new Date(dt.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Splits an inclusive [startDate, endDate] range into windows of at most 31 days each
 * to comply with Castcore's 31-day per-request maximum.
 */
export function splitDateRangeInto31DayChunks(
  startDate: string,
  endDate: string
): { start: string; end: string }[] {
  const startDt = parseUtcDate(startDate)
  const endDt = parseUtcDate(endDate)
  if (endDt.getTime() < startDt.getTime()) {
    throw new Error('End date must be on or after start date.')
  }
  const totalDays = Math.floor((endDt.getTime() - startDt.getTime()) / 86_400_000) + 1
  if (totalDays > MAX_TOTAL_DAYS) {
    throw new Error(`Date range (${totalDays} days) exceeds the ${MAX_TOTAL_DAYS}-day maximum per sync.`)
  }

  const chunks: { start: string; end: string }[] = []
  let cur = startDt
  while (cur.getTime() <= endDt.getTime()) {
    const candidateEnd = addUtcDays(cur, MAX_DAYS_PER_CHUNK - 1)
    const chunkEnd = candidateEnd.getTime() < endDt.getTime() ? candidateEnd : endDt
    chunks.push({ start: formatUtcDate(cur), end: formatUtcDate(chunkEnd) })
    cur = addUtcDays(chunkEnd, 1)
  }
  return chunks
}

/** Returns true when Castcore server environment variables are present. */
export function isCastcoreConfigured(): boolean {
  return Boolean(process.env.CASTCORE_API_HOST?.trim() && process.env.CASTCORE_API_KEY?.trim())
}

function getCastcoreConfig(): { host: string; apiKey: string; companyId: number } {
  const rawHost = process.env.CASTCORE_API_HOST?.trim() ?? ''
  const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  const apiKey = process.env.CASTCORE_API_KEY?.trim() ?? ''
  const rawCompanyId = Number(process.env.CASTCORE_COMPANY_ID?.trim() || '1')

  if (!host || !apiKey) {
    throw new Error('Castcore API is not configured. Set CASTCORE_API_HOST and CASTCORE_API_KEY in environment variables.')
  }
  if (!Number.isInteger(rawCompanyId) || rawCompanyId <= 0) {
    throw new Error('Invalid CASTCORE_COMPANY_ID environment variable.')
  }
  return { host, apiKey, companyId: rawCompanyId }
}

async function fetchCastcoreChunk(
  startDate: string,
  endDate: string
): Promise<{ data: NonNullable<CastcoreApiResponse['data']>; rateLimitRemaining: number | null }> {
  const { host, apiKey, companyId } = getCastcoreConfig()
  const url = new URL(`https://${host}/api/external/v1/production-summary`)
  url.searchParams.set('company_id', String(companyId))
  url.searchParams.set('start_date', startDate)
  url.searchParams.set('end_date', endDate)

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const remainingHeader = res.headers.get('x-ratelimit-remaining')
    const parsedRemaining = remainingHeader != null ? Number.parseInt(remainingHeader, 10) : Number.NaN
    const rateLimitRemaining = Number.isFinite(parsedRemaining) ? parsedRemaining : null

    if (res.status === 429) {
      const retryRaw = Number.parseInt(res.headers.get('retry-after') ?? '', 10)
      const retryAfter = Number.isFinite(retryRaw) && retryRaw > 0 ? retryRaw : 5
      if (retryAfter <= 30 && attempt < MAX_429_RETRIES) {
        await sleep((retryAfter + 0.5) * 1000)
        continue
      }
      throw new Error(`Castcore rate limit reached (60 req/min). Please wait ${retryAfter}s and retry.`)
    }

    let json: CastcoreApiResponse | null = null
    try {
      json = (await res.json()) as CastcoreApiResponse
    } catch {
      json = null
    }

    if (!res.ok) {
      const detail = json?.message || `HTTP ${res.status}`
      throw new Error(`Castcore API error (${res.status}): ${detail}`)
    }

    if (!json || json.status !== true || !json.data) {
      throw new Error(`Castcore API returned unsuccessful status: ${json?.message ?? 'Unknown error'}`)
    }

    return { data: json.data, rateLimitRemaining }
  }

  throw new Error('Castcore rate limit reached (60 req/min). Please retry shortly.')
}

/**
 * Fetches casting_volume from Castcore Production Summary API across [startDate, endDate]
 * and upserts matched active DLER project rows in dler_daily_m3.
 */
export async function syncCastcoreM3Range(options: CastcoreSyncOptions): Promise<CastcoreSyncResult> {
  const { startDate, endDate, overwriteManual = false, updatedBy = null } = options
  const chunks = splitDateRangeInto31DayChunks(startDate, endDate)

  const admin = createAdminClient()

  const [{ data: projRows, error: projErr }, { data: existingRows, error: exErr }] = await Promise.all([
    admin
      .from('dler_projects')
      .select('id, name, erp_code, status')
      .eq('status', 'Active')
      .not('erp_code', 'is', null),
    admin
      .from('dler_daily_m3')
      .select('entry_key, source, m3_volume, remarks')
      .eq('target_type', 'project')
      .gte('entry_date', startDate)
      .lte('entry_date', endDate),
  ])

  if (projErr) throw projErr
  if (exErr) throw exErr

  const projByCode = new Map<string, { id: number; name: string; erp_code: string }>()
  for (const p of projRows ?? []) {
    const code = (p.erp_code ?? '').trim().toUpperCase()
    if (code) {
      projByCode.set(code, { id: p.id, name: p.name, erp_code: p.erp_code!.trim() })
    }
  }

  const existingMap = new Map<
    string,
    { entry_key: string; source: string; m3_volume: number; remarks: string | null }
  >()
  for (const r of existingRows ?? []) {
    existingMap.set(r.entry_key, {
      entry_key: r.entry_key,
      source: r.source,
      m3_volume: Number(r.m3_volume) || 0,
      remarks: r.remarks ?? null,
    })
  }

  const now = new Date().toISOString()
  const upsertMap = new Map<
    string,
    {
      entry_key: string
      entry_date: string
      target_type: 'project'
      project_id: number
      department_id: null
      m3_volume: number
      remarks: string | null
      source: 'erp_sync'
      erp_ref: string
      updated_by: string | null
      updated_at: string
    }
  >()

  const matchedProjectIds = new Set<number>()
  const partialProjectsMap = new Map<string, { code: string; name: string; error: string }>()
  const unmappedMap = new Map<string, { code: string; name: string; totalCastM3: number }>()
  const clearedKeys = new Set<string>()
  let partial = false
  let skippedManualRows = 0
  let lastRateLimitRemaining: number | null = null

  for (let idx = 0; idx < chunks.length; idx++) {
    if (idx > 0 && lastRateLimitRemaining !== null && lastRateLimitRemaining <= 2) {
      await sleep(1500)
    }

    const chunk = chunks[idx]
    const { data, rateLimitRemaining } = await fetchCastcoreChunk(chunk.start, chunk.end)
    lastRateLimitRemaining = rateLimitRemaining
    if (data.partial) partial = true

    for (const proj of data.projects ?? []) {
      const codeKey = (proj.code ?? '').trim().toUpperCase()
      if (!codeKey) continue

      if (proj.error) {
        partial = true
        partialProjectsMap.set(codeKey, {
          code: proj.code,
          name: proj.name,
          error: proj.error,
        })
        continue
      }

      const dlerProj = projByCode.get(codeKey)
      if (!dlerProj) {
        const castSum = (proj.daily ?? []).reduce(
          (sum, d) => sum + (Number(d.casting_volume) || 0),
          0
        )
        if (castSum > 0) {
          const prev = unmappedMap.get(codeKey) ?? { code: proj.code, name: proj.name, totalCastM3: 0 }
          prev.totalCastM3 = round4(prev.totalCastM3 + castSum)
          unmappedMap.set(codeKey, prev)
        }
        continue
      }

      matchedProjectIds.add(dlerProj.id)

      for (const d of proj.daily ?? []) {
        if (!d.date || d.date < startDate || d.date > endDate) continue
        const vol = round4(Math.max(0, Number(d.casting_volume) || 0))
        const entryKey = `project:${d.date}:${dlerProj.id}`
        const existing = existingMap.get(entryKey)

        if (existing?.source === 'manual' && !overwriteManual) {
          if (Number(existing.m3_volume) !== vol) {
            skippedManualRows++
          }
          continue
        }

        if (vol > 0) {
          upsertMap.set(entryKey, {
            entry_key: entryKey,
            entry_date: d.date,
            target_type: 'project',
            project_id: dlerProj.id,
            department_id: null,
            m3_volume: vol,
            remarks: existing?.remarks ?? null,
            source: 'erp_sync',
            erp_ref: `castcore:${proj.code}:${d.date}`,
            updated_by: updatedBy,
            updated_at: now,
          })
          clearedKeys.delete(entryKey)
        } else if (
          existing &&
          (existing.source === 'erp_sync' || overwriteManual) &&
          Number(existing.m3_volume) > 0
        ) {
          upsertMap.set(entryKey, {
            entry_key: entryKey,
            entry_date: d.date,
            target_type: 'project',
            project_id: dlerProj.id,
            department_id: null,
            m3_volume: 0,
            remarks: existing.remarks ?? null,
            source: 'erp_sync',
            erp_ref: `castcore:${proj.code}:${d.date}`,
            updated_by: updatedBy,
            updated_at: now,
          })
          clearedKeys.add(entryKey)
        }
      }
    }
  }

  const upserts = Array.from(upsertMap.values())
  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await admin
      .from('dler_daily_m3')
      .upsert(upserts.slice(i, i + 500), { onConflict: 'entry_key' })
    if (error) throw error
  }

  const totalCastM3Synced = round4(
    upserts.reduce((sum, r) => sum + (r.m3_volume > 0 ? r.m3_volume : 0), 0)
  )

  return {
    startDate,
    endDate,
    chunksFetched: chunks.length,
    partial,
    partialProjects: Array.from(partialProjectsMap.values()),
    matchedProjects: matchedProjectIds.size,
    upsertedRows: upserts.length,
    skippedManualRows,
    zeroClearedRows: clearedKeys.size,
    unmappedWithVolume: Array.from(unmappedMap.values()),
    totalCastM3Synced,
    rateLimitRemaining: lastRateLimitRemaining,
  }
}
