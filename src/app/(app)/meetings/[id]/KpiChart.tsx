'use client'

import { formatGoal, formatKpiValue, evaluateGoal, type Goal, type UnitType } from '@/lib/meetings'
import type { Bucket } from './kpiRange'

// Hand-drawn SVG bar chart (the app has no chart library). Bars turn green or
// red against the goal when each bar is one period; the goal is drawn as a
// dashed line (or a band for "between").
export default function KpiChart({ buckets, unit, goal, colourByGoal, goalFor }: {
  buckets: Bucket[]
  unit: UnitType
  goal: Goal
  colourByGoal: boolean
  goalFor?: (key: string) => Goal
}) {
  const W = 760, H = 280, L = 56, R = 16, T = 20, B = 44
  const vals = buckets.map(b => b.value).filter((v): v is number => v !== null)
  const goalVals = colourByGoal ? [goal.value, goal.rule === 'between' ? goal.max : null].filter((v): v is number => v !== null && v !== undefined) : []

  if (vals.length === 0) {
    return <div className="border border-dashed rounded-xl p-10 text-center text-sm text-gray-500 bg-white">No values recorded in this date range.</div>
  }

  const max = Math.max(...vals, ...goalVals, 0)
  const min = Math.min(...vals, ...goalVals, 0)
  const span = max - min || 1
  const step = niceStep(span / 4)
  const top = Math.ceil(max / step) * step
  const bottom = Math.floor(min / step) * step
  const range = top - bottom || 1
  const y = (v: number) => T + (H - T - B) * (1 - (v - bottom) / range)
  const ticks: number[] = []
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)

  const plotW = W - L - R
  const slot = plotW / buckets.length
  const barW = Math.min(52, slot * 0.62)
  const fmt = (v: number | null) => (unit === 'yesno' ? (v === null ? '—' : `${Math.round(v * 100)}%`) : formatKpiValue(v, unit))
  const every = Math.ceil(buckets.length / 14)

  return (
    <div className="border rounded-xl bg-white shadow-sm p-3 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="KPI chart">
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e5e7eb" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{fmt(t)}</text>
          </g>
        ))}
        {colourByGoal && goal.value !== null && goal.rule === 'between' && goal.max !== null && (
          <rect x={L} width={plotW} y={y(Math.max(goal.value, goal.max))} height={Math.abs(y(goal.value) - y(goal.max))} fill="#22c55e" opacity={0.1} />
        )}
        {colourByGoal && goal.value !== null && goal.rule !== 'between' && (
          <g>
            <line x1={L} x2={W - R} y1={y(goal.value)} y2={y(goal.value)} stroke="#475569" strokeDasharray="5 4" strokeWidth={1.5} />
            <text x={W - R} y={y(goal.value) - 5} textAnchor="end" fontSize={11} fill="#475569">Goal {formatGoal(goal, unit)}</text>
          </g>
        )}
        {buckets.map((b, i) => {
          const cx = L + slot * i + slot / 2
          if (b.value === null) {
            return i % every === 0 ? <text key={b.key} x={cx} y={H - B + 18} textAnchor="middle" fontSize={11} fill="#9ca3af">{b.label}</text> : null
          }
          const hit = colourByGoal ? evaluateGoal(goalFor ? goalFor(b.key) : goal, b.value) : null
          const fill = hit === null ? '#2563eb' : hit ? '#16a34a' : '#dc2626'
          const y0 = y(0 < bottom ? bottom : 0)
          const y1 = y(b.value)
          return (
            <g key={b.key}>
              <title>{`${b.label}: ${fmt(b.value)}${b.n > 1 ? ` (${b.n} periods)` : ''}`}</title>
              <rect x={cx - barW / 2} width={barW} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y0 - y1))} rx={3} fill={fill} />
              {buckets.length <= 16 && <text x={cx} y={Math.min(y0, y1) - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#111827">{fmt(b.value)}</text>}
              {i % every === 0 && <text x={cx} y={H - B + 18} textAnchor="middle" fontSize={11} fill="#6b7280">{b.label}</text>}
            </g>
          )
        })}
        <line x1={L} x2={W - R} y1={y(Math.max(bottom, Math.min(0, top)))} y2={y(Math.max(bottom, Math.min(0, top)))} stroke="#9ca3af" strokeWidth={1} />
      </svg>
    </div>
  )
}

function niceStep(raw: number) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const f = raw / pow
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return n * pow
}
