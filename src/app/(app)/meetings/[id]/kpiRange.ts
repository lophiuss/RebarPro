import { ymd, type Cadence } from '@/lib/meetings'

// Date-range handling for the KPI table and charts.

export type RangePreset = 'recent' | 'quarter' | 'year' | 'lastyear' | 'custom'
export type Range = { preset: RangePreset; from: string; to: string }
export type Period = { start: string; label: string }

export const RANGE_LABEL: Record<RangePreset, string> = {
  recent: 'Recent periods', quarter: 'This quarter', year: 'This year', lastyear: 'Last year', custom: 'Custom range',
}

export function parseYmd(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// The dates a preset stands for, or null for "recent" (which is count-based).
export function resolveRange(r: Range): { from: Date; to: Date } | null {
  const now = new Date()
  if (r.preset === 'recent') return null
  if (r.preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    return { from: new Date(now.getFullYear(), q * 3, 1), to: new Date(now.getFullYear(), q * 3 + 3, 0) }
  }
  if (r.preset === 'year') return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) }
  if (r.preset === 'lastyear') return { from: new Date(now.getFullYear() - 1, 0, 1), to: new Date(now.getFullYear() - 1, 11, 31) }
  if (!r.from || !r.to) return null
  const from = parseYmd(r.from)
  const to = parseYmd(r.to)
  return from <= to ? { from, to } : { from: to, to: from }
}

function recent(cadence: Cadence): Period[] {
  const out: Period[] = []
  const now = new Date()
  if (cadence === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}` })
    }
  } else if (cadence === 'weekly') {
    const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    for (let i = 7; i >= 0; i--) {
      const d = new Date(monday); d.setDate(d.getDate() - i * 7)
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}` })
    }
  } else if (cadence === 'monthly') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ start: ymd(d), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
    }
  } else {
    const q = Math.floor(now.getMonth() / 3)
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), (q - i) * 3, 1)
      out.push({ start: ymd(d), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}` })
    }
  }
  return out
}

// Every period of `cadence` that starts inside the range.
export function periodsFor(cadence: Cadence, range: Range): Period[] {
  const span = resolveRange(range)
  if (!span) return recent(cadence)
  const { from, to } = span
  const crossYears = from.getFullYear() !== to.getFullYear()
  const yy = (d: Date) => (crossYears ? `/${String(d.getFullYear()).slice(2)}` : '')
  const out: Period[] = []

  if (cadence === 'daily') {
    for (const d = new Date(from); d <= to && out.length < 400; d.setDate(d.getDate() + 1)) {
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}${yy(d)}` })
    }
  } else if (cadence === 'weekly') {
    const d = new Date(from)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    for (; d <= to && out.length < 160; d.setDate(d.getDate() + 7)) {
      out.push({ start: ymd(d), label: `${d.getMonth() + 1}/${d.getDate()}${yy(d)}` })
    }
  } else if (cadence === 'monthly') {
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to && out.length < 120; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      out.push({ start: ymd(d), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) })
    }
  } else {
    for (let d = new Date(from.getFullYear(), Math.floor(from.getMonth() / 3) * 3, 1); d <= to && out.length < 40; d = new Date(d.getFullYear(), d.getMonth() + 3, 1)) {
      out.push({ start: ymd(d), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}` })
    }
  }
  return out
}

export type Group = 'period' | 'quarter' | 'year'
export const GROUP_LABEL: Record<Group, string> = { period: 'Each period', quarter: 'By quarter', year: 'By year' }

export type Bucket = { key: string; label: string; value: number | null; n: number }

// Groups values (already limited to the range) into periods, quarters or years.
export function bucketValues(
  rows: { period_start: string; value: number | null }[],
  group: Group,
  agg: 'avg' | 'sum',
  periods: Period[],
): Bucket[] {
  const valid = rows.filter(r => r.value !== null && r.value !== undefined) as { period_start: string; value: number }[]
  if (group === 'period') {
    const by = new Map(valid.map(r => [r.period_start, r.value]))
    return periods.map(p => ({ key: p.start, label: p.label, value: by.get(p.start) ?? null, n: by.has(p.start) ? 1 : 0 }))
  }
  const map = new Map<string, { label: string; sum: number; n: number }>()
  for (const r of valid) {
    const d = parseYmd(r.period_start)
    const y = d.getFullYear()
    const key = group === 'year' ? `${y}` : `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`
    const label = group === 'year' ? `${y}` : `Q${Math.floor(d.getMonth() / 3) + 1} ${y}`
    const cur = map.get(key) ?? { label, sum: 0, n: 0 }
    cur.sum += r.value
    cur.n += 1
    map.set(key, cur)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, v]) => ({ key, label: v.label, value: agg === 'sum' ? v.sum : v.sum / v.n, n: v.n }))
}
