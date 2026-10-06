'use client'

import React, { useState, useMemo } from 'react'
import { toDisplayUnit, unitLabel, fmtQtyNum, type DefaultUnit } from '@/lib/utils/unit'

interface TransactionItem {
  quantity: number
  type: string
  transaction_date: string
  size_id: string | null
  project_type_id: string | null
  project_id: string | null
}

interface StockTakeItem {
  id: string
  size_id: string
  stock_take_date: string
  physical_count: number
  project_type_id: string | null
}

interface RebarSize {
  id: string
  size: string
  unit?: string
}

interface ProjectType {
  id: string
  name: string
}

interface Project {
  id: string
  project_type_id: string | null
}

interface Props {
  transactions: TransactionItem[]
  stockTakes: StockTakeItem[]
  sizes: RebarSize[]
  projectTypes: ProjectType[]
  projects: Project[]
  unit?: DefaultUnit
}

type RangeOption = '14_days' | 'this_month' | '30_days' | '60_days'
type MultiMetric = 'usable' | 'total'

const SIZE_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // purple
  '#db2777', // pink
  '#ea580c', // orange
  '#059669', // emerald
  '#d97706', // amber
  '#0284c7', // sky
  '#4f46e5', // indigo
  '#e11d48', // rose
  '#0d9488', // teal
  '#84cc16', // lime
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f59e0b', // yellow-amber
]

export default function StockBalanceLineChart({
  transactions,
  stockTakes,
  sizes,
  projectTypes,
  projects,
  unit = 'kg'
}: Props) {
  const uLabel = unitLabel(unit)
  const [selectedMode, setSelectedMode] = useState<string>('all_multi')
  const [multiMetric, setMultiMetric] = useState<MultiMetric>('usable')
  const [range, setRange] = useState<RangeOption>('30_days')
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null)
  const [activeSizeFilter, setActiveSizeFilter] = useState<string | null>(null)
  // Dotted "theoretical" line = what the books say if no physical stock take
  // had ever corrected them (pure running sum of transactions). The solid
  // line resets to the counted figure at each stock take, so the gap between
  // the two is the accumulated stock-take correction.
  const [showTheo, setShowTheo] = useState(true)

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const dateList = useMemo(() => {
    const dates: string[] = []

    if (range === 'this_month') {
      const y = today.getFullYear()
      const m = today.getMonth()
      const lastDay = new Date(y, m + 1, 0).getDate()
      for (let d = 1; d <= lastDay; d++) {
        dates.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }
    } else {
      const count = range === '14_days' ? 14 : range === '60_days' ? 60 : 30
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(today.getDate() - i)
        dates.push(d.toISOString().split('T')[0])
      }
    }

    return dates
  }, [range])

  const dailyData = useMemo(() => {
    const knownProjectIds = projects.map(p => p.id)

    return dateList.map(dateStr => {
      let combinedTotal = 0
      let combinedSuspended = 0
      let combinedTheoTotal = 0
      const perSizeBalances: Record<string, { total: number; usable: number; suspended: number; theoTotal: number; theoUsable: number }> = {}

      sizes.forEach(size => {
        let sizeTotal = 0
        let sizeTheo = 0

        for (const pt of projectTypes) {
          const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)
          const ptTxs = transactions.filter(t => 
            t.size_id === size.id && 
            (t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id))) &&
            t.transaction_date <= dateStr
          )

          const priorSTs = stockTakes.filter(st => 
            st.size_id === size.id && 
            st.project_type_id === pt.id && 
            st.stock_take_date <= dateStr
          ).sort((a, b) => b.stock_take_date.localeCompare(a.stock_take_date))

          const latestST = priorSTs[0]
          sizeTheo += ptTxs.reduce((sum, t) => sum + Number(t.quantity), 0)

          if (latestST) {
            const txsAfter = ptTxs.filter(t => t.transaction_date > latestST.stock_take_date)
            const txSum = txsAfter.reduce((sum, t) => sum + Number(t.quantity), 0)
            sizeTotal += Number(latestST.physical_count) + txSum
          } else {
            const txSum = ptTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
            sizeTotal += txSum
          }
        }

        const unassignedTxs = transactions.filter(t => 
          t.size_id === size.id && 
          !t.project_type_id && 
          (!t.project_id || !knownProjectIds.includes(t.project_id)) &&
          t.transaction_date <= dateStr
        )
        const unassignedSum = unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
        sizeTotal += unassignedSum
        sizeTheo += unassignedSum

        const sizeTxs = transactions.filter(t => t.size_id === size.id && t.transaction_date <= dateStr)
        let sCount = 0
        sizeTxs.forEach(t => {
          const q = Math.abs(Number(t.quantity))
          if (t.type === 'suspended') sCount += q
          if (t.type === 'unsuspend') sCount -= q
        })
        const sizeSuspended = Math.max(sCount, 0)
        const sizeUsable = Math.max(sizeTotal - sizeSuspended, 0)

        perSizeBalances[size.id] = {
          total: Math.max(sizeTotal, 0),
          usable: sizeUsable,
          suspended: sizeSuspended,
          theoTotal: Math.max(sizeTheo, 0),
          theoUsable: Math.max(sizeTheo - sizeSuspended, 0),
        }

        combinedTotal += Math.max(sizeTotal, 0)
        combinedTheoTotal += Math.max(sizeTheo, 0)
        combinedSuspended += sizeSuspended
      })

      const combinedUsable = Math.max(combinedTotal - combinedSuspended, 0)

      return {
        date: dateStr,
        label: dateStr.slice(5),
        combinedTotal,
        combinedUsable,
        combinedSuspended,
        combinedTheoTotal,
        combinedTheoUsable: Math.max(combinedTheoTotal - combinedSuspended, 0),
        perSizeBalances,
        isToday: dateStr === todayStr
      }
    })
  }, [dateList, sizes, transactions, stockTakes, projectTypes, projects])

  const activeSizes = useMemo(() => {
    return sizes.map((s, idx) => {
      const color = SIZE_COLORS[idx % SIZE_COLORS.length]
      const maxInPeriod = Math.max(...dailyData.map(d => d.perSizeBalances[s.id]?.total || 0))
      return { ...s, color, maxInPeriod }
    }).filter(s => s.maxInPeriod > 0)
  }, [sizes, dailyData])

  const maxVal = useMemo(() => {
    let rawMax = 1
    if (selectedMode === 'all_total') {
      rawMax = Math.max(...dailyData.map(d => Math.max(d.combinedTotal, showTheo ? d.combinedTheoTotal : 0)), 1)
    } else if (selectedMode === 'all_multi') {
      const allVals = dailyData.flatMap(d => 
        activeSizes.flatMap(s => { const b = d.perSizeBalances[s.id]; if (!b) return [0]; return multiMetric === 'usable' ? [b.usable, showTheo ? b.theoUsable : 0] : [b.total, showTheo ? b.theoTotal : 0] })
      )
      rawMax = Math.max(...allVals, 1)
    } else {
      const vals = dailyData.map(d => Math.max(d.perSizeBalances[selectedMode]?.total || 0, showTheo ? d.perSizeBalances[selectedMode]?.theoTotal || 0 : 0))
      rawMax = Math.max(...vals, 1)
    }
    const padded = rawMax * 1.15
    const step = Math.max(Math.ceil((padded / 4) / 100) * 100, 25)
    return step * 4
  }, [dailyData, selectedMode, activeSizes, multiMetric, showTheo])

  const width = 900
  const height = 270
  const paddingLeft = 65
  const paddingRight = 30
  const paddingTop = 30
  const paddingBottom = 40

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const points = useMemo(() => {
    return dailyData.map((d, index) => {
      const x = paddingLeft + (index / Math.max(dailyData.length - 1, 1)) * plotWidth
      
      const yTotal = paddingTop + plotHeight - (d.combinedTotal / maxVal) * plotHeight
      const yUsable = paddingTop + plotHeight - (d.combinedUsable / maxVal) * plotHeight

      const yTheoTotal = paddingTop + plotHeight - (d.combinedTheoTotal / maxVal) * plotHeight
      const yTheoUsable = paddingTop + plotHeight - (d.combinedTheoUsable / maxVal) * plotHeight
      const sizeCoords: Record<string, { y: number; val: number; yTheo: number }> = {}
      activeSizes.forEach(s => {
        const val = multiMetric === 'usable' 
          ? (d.perSizeBalances[s.id]?.usable || 0)
          : (d.perSizeBalances[s.id]?.total || 0)
        const y = paddingTop + plotHeight - (val / maxVal) * plotHeight
        const theoVal = multiMetric === 'usable' ? (d.perSizeBalances[s.id]?.theoUsable || 0) : (d.perSizeBalances[s.id]?.theoTotal || 0)
        sizeCoords[s.id] = { y, val, yTheo: paddingTop + plotHeight - (theoVal / maxVal) * plotHeight }
      })

      let ySingleTotal = 0
      let ySingleUsable = 0
      let ySingleTheoTotal = 0
      let ySingleTheoUsable = 0
      if (selectedMode !== 'all_multi' && selectedMode !== 'all_total') {
        const sData = d.perSizeBalances[selectedMode] || { total: 0, usable: 0, suspended: 0 }
        ySingleTotal = paddingTop + plotHeight - (sData.total / maxVal) * plotHeight
        ySingleUsable = paddingTop + plotHeight - (sData.usable / maxVal) * plotHeight
        const sb = d.perSizeBalances[selectedMode]
        ySingleTheoTotal = paddingTop + plotHeight - ((sb?.theoTotal || 0) / maxVal) * plotHeight
        ySingleTheoUsable = paddingTop + plotHeight - ((sb?.theoUsable || 0) / maxVal) * plotHeight
      }

      return {
        ...d,
        x,
        yTotal,
        yUsable,
        yTheoTotal,
        yTheoUsable,
        sizeCoords,
        ySingleTotal,
        ySingleUsable,
        ySingleTheoTotal,
        ySingleTheoUsable
      }
    })
  }, [dailyData, maxVal, activeSizes, multiMetric, selectedMode])

  const totalPath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yTotal.toFixed(1)}`, '')
    : ''

  const usablePath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yUsable.toFixed(1)}`, '')
    : ''

  const singleTotalPath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.ySingleTotal.toFixed(1)}`, '')
    : ''

  const singleUsablePath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.ySingleUsable.toFixed(1)}`, '')
    : ''

  const mkPath = (key: 'yTheoTotal' | 'yTheoUsable' | 'ySingleTheoTotal' | 'ySingleTheoUsable') =>
    points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${(p as any)[key].toFixed(1)}`, '')
  const theoTotalPath = mkPath('yTheoTotal')
  const theoUsablePath = mkPath('yTheoUsable')
  const singleTheoTotalPath = mkPath('ySingleTheoTotal')
  const singleTheoUsablePath = mkPath('ySingleTheoUsable')

  const multiTheoPaths = useMemo(() => {
    const paths: Record<string, string> = {}
    activeSizes.forEach(s => {
      paths[s.id] = points.reduce((acc, p, i) => {
        const coord = p.sizeCoords[s.id]
        if (!coord) return acc
        return `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${coord.yTheo.toFixed(1)}`
      }, '')
    })
    return paths
  }, [activeSizes, points])

  // Which sizes have drifted furthest from their books-only balance, as of
  // the last day shown: actual (counted) minus theoretical.
  const lastDay = dailyData[dailyData.length - 1]
  const gaps = lastDay
    ? activeSizes.map(s => {
        const b = lastDay.perSizeBalances[s.id]
        const actual = multiMetric === 'usable' ? b?.usable || 0 : b?.total || 0
        const theo = multiMetric === 'usable' ? b?.theoUsable || 0 : b?.theoTotal || 0
        return { ...s, actual, theo, diff: actual - theo }
      }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    : []
  const maxGap = Math.max(...gaps.map(g => Math.abs(g.diff)), 1)

  const multiPaths = useMemo(() => {
    const paths: Record<string, string> = {}
    activeSizes.forEach(s => {
      paths[s.id] = points.reduce((acc, p, i) => {
        const coord = p.sizeCoords[s.id]
        if (!coord) return acc
        return `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${coord.y.toFixed(1)}`
      }, '')
    })
    return paths
  }, [activeSizes, points])

  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal]

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 sm:p-6 mb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock Balance Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectedMode === 'all_multi' && `Comparing daily stock lines across all rebar sizes (${multiMetric === 'usable' ? 'Usable' : 'Total'} ${uLabel})`}
            {selectedMode === 'all_total' && `Total combined factory physical balance & usable balance (${uLabel})`}
            {selectedMode !== 'all_multi' && selectedMode !== 'all_total' && `Daily balance for ${sizes.find(s => s.id === selectedMode)?.size || 'Selected Size'} (${uLabel})`}
          </p>
          {showTheo && <p className="text-[11px] text-gray-400 mt-0.5">Solid = actual (resets to the counted figure at each stock take) · Dotted = theoretical (transactions only). The wider the gap, the bigger the stock-take correction.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-500 font-medium">View:</span>
            <select
              value={selectedMode}
              onChange={e => {
                setSelectedMode(e.target.value)
                setActiveSizeFilter(null)
              }}
              className="border rounded-lg px-2.5 py-1.5 bg-white font-semibold text-slate-800 text-xs shadow-xs"
            >
              <option value="all_multi">📊 Multi-Line (Each Size One Line)</option>
              <option value="all_total">∑ Combined Factory Total</option>
              <optgroup label="Single Size Isolation">
                {sizes.map(s => (
                  <option key={s.id} value={s.id}>{s.size}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {selectedMode === 'all_multi' && (
            <div className="flex items-center bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setMultiMetric('usable')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${multiMetric === 'usable' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Usable Stock
              </button>
              <button
                onClick={() => setMultiMetric('total')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${multiMetric === 'total' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
              >
                Total Stock
              </button>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none" title="Dotted line = balance from transactions only, ignoring stock-take corrections">
            <input type="checkbox" checked={showTheo} onChange={e => setShowTheo(e.target.checked)} className="accent-slate-700" />
            <svg width="22" height="6"><line x1="1" y1="3" x2="21" y2="3" stroke="#475569" strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" /></svg>
            Theoretical
          </label>

          <div className="flex items-center bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setRange('14_days')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${range === '14_days' ? 'bg-white text-slate-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
            >
              14 Days
            </button>
            <button
              onClick={() => setRange('this_month')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${range === 'this_month' ? 'bg-white text-slate-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
            >
              This Month
            </button>
            <button
              onClick={() => setRange('30_days')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${range === '30_days' ? 'bg-white text-slate-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
            >
              30 Days
            </button>
            <button
              onClick={() => setRange('60_days')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${range === '60_days' ? 'bg-white text-slate-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}
            >
              60 Days
            </button>
          </div>
        </div>
      </div>

      {selectedMode === 'all_multi' && (
        <div className="flex flex-wrap items-center gap-2 mb-4 p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs">
          <span className="text-gray-400 font-medium mr-1">Filter Line:</span>
          <button
            onClick={() => setActiveSizeFilter(null)}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${activeSizeFilter === null ? 'bg-slate-800 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-200'}`}
          >
            All Lines
          </button>
          {activeSizes.map(s => {
            const isSelected = activeSizeFilter === s.id
            return (
              <button
                key={s.id}
                onClick={() => setActiveSizeFilter(isSelected ? null : s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition ${
                  isSelected 
                    ? 'bg-slate-900 text-white shadow-xs' 
                    : activeSizeFilter !== null 
                    ? 'opacity-40 hover:opacity-100 bg-white border' 
                    : 'bg-white border text-slate-700 hover:border-slate-400'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span>{s.size}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-64 select-none min-w-[650px]"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {yTicks.map((tick, i) => {
            const y = paddingTop + plotHeight - (tick / maxVal) * plotHeight
            const tickDisp = fmtQtyNum(tick, unit)
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94a3b8"
                  fontWeight="500"
                >
                  {tickDisp} {uLabel}
                </text>
              </g>
            )
          })}

          {selectedMode === 'all_multi' && (
            <>
              {activeSizes.map(s => {
                const isDimmed = activeSizeFilter !== null && activeSizeFilter !== s.id
                const isHighlighted = activeSizeFilter === s.id
                return (
                  <g key={s.id} opacity={isDimmed ? 0.15 : 1}>
                    <path
                      d={multiPaths[s.id] || ''}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={isHighlighted ? 3.5 : 2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-200"
                    />
                    {showTheo && (
                      <path d={multiTheoPaths[s.id] || ''} fill="none" stroke={s.color} strokeWidth={isHighlighted ? 2.5 : 1.8} strokeDasharray="2 5" strokeLinecap="round" opacity={0.85} />
                    )}
                  </g>
                )
              })}
            </>
          )}

          {selectedMode === 'all_total' && (
            <>
              <path
                d={totalPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={usablePath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {showTheo && (
                <>
                  <path d={theoTotalPath} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
                  <path d={theoUsablePath} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
                </>
              )}
            </>
          )}

          {selectedMode !== 'all_multi' && selectedMode !== 'all_total' && (
            <>
              <path
                d={singleTotalPath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={singleUsablePath}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {showTheo && (
                <>
                  <path d={singleTheoTotalPath} fill="none" stroke="#2563eb" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
                  <path d={singleTheoUsablePath} fill="none" stroke="#10b981" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
                </>
              )}
            </>
          )}

          {points.map((p) => (
            <rect
              key={p.date}
              x={p.x - (plotWidth / points.length) / 2}
              y={paddingTop}
              width={plotWidth / points.length}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHoveredPoint(p)}
              className="cursor-pointer"
            />
          ))}

          {hoveredPoint && (
            <g>
              <line
                x1={hoveredPoint.x}
                y1={paddingTop}
                x2={hoveredPoint.x}
                y2={paddingTop + plotHeight}
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              {selectedMode === 'all_multi' ? (
                activeSizes.map(s => {
                  if (activeSizeFilter !== null && activeSizeFilter !== s.id) return null
                  const coord = hoveredPoint.sizeCoords[s.id]
                  if (!coord) return null
                  return (
                    <circle
                      key={s.id}
                      cx={hoveredPoint.x}
                      cy={coord.y}
                      r="4.5"
                      fill={s.color}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  )
                })
              ) : selectedMode === 'all_total' ? (
                <>
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.yTotal} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.yUsable} r="4.5" fill="#10b981" stroke="#fff" strokeWidth="2" />
                </>
              ) : (
                <>
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.ySingleTotal} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
                  <circle cx={hoveredPoint.x} cy={hoveredPoint.ySingleUsable} r="4.5" fill="#10b981" stroke="#fff" strokeWidth="2" />
                </>
              )}
            </g>
          )}

          {points.map((p, idx) => {
            const step = points.length > 40 ? 5 : points.length > 20 ? 3 : 2
            const showLabel = idx % step === 0 || idx === points.length - 1 || p.isToday
            if (!showLabel) return null

            return (
              <text
                key={p.date}
                x={p.x}
                y={height - 12}
                textAnchor="middle"
                fontSize="10"
                fill={p.isToday ? '#2563eb' : '#64748b'}
                fontWeight={p.isToday ? 'bold' : 'normal'}
              >
                {p.label}
              </text>
            )
          })}
        </svg>

        {hoveredPoint && (
          <div
            className="absolute bg-slate-900 text-white text-xs rounded-xl shadow-2xl p-3 z-30 pointer-events-none border border-slate-700 min-w-[200px]"
            style={{
              left: `${Math.min(Math.max((hoveredPoint.x / width) * 100, 18), 82)}%`,
              top: '10px',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-bold border-b border-slate-700 pb-1 mb-2 text-slate-200 flex items-center justify-between">
              <span>{hoveredPoint.date}</span>
              {hoveredPoint.isToday && <span className="bg-blue-600 text-[10px] px-1.5 py-0.5 rounded">Today</span>}
            </div>

            {selectedMode === 'all_multi' ? (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {activeSizes.map(s => {
                  const sData = hoveredPoint.perSizeBalances[s.id]
                  if (!sData) return null
                  const val = multiMetric === 'usable' ? sData.usable : sData.total
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5 font-medium">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.size}:
                      </span>
                      <span className="font-bold text-slate-100">
                        {fmtQtyNum(val, unit)} {uLabel}
                        {showTheo && (() => { const th = multiMetric === 'usable' ? sData.theoUsable : sData.theoTotal; const d = val - th; return Math.abs(d) >= 1 ? <span className={`ml-1.5 font-medium ${d < 0 ? 'text-red-300' : 'text-green-300'}`}>({d > 0 ? '+' : ''}{fmtQtyNum(d, unit)} vs theo)</span> : null })()}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : selectedMode === 'all_total' ? (
              <div className="space-y-1">
                <div className="text-blue-400 font-semibold flex justify-between">
                  <span>Total Stock:</span>
                  <span>{fmtQtyNum(hoveredPoint.combinedTotal, unit)} {uLabel}</span>
                </div>
                <div className="text-green-400 font-semibold flex justify-between">
                  <span>Usable Stock:</span>
                  <span>{fmtQtyNum(hoveredPoint.combinedUsable, unit)} {uLabel}</span>
                </div>
                {showTheo && (
                  <div className="text-slate-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                    <span>Theoretical total:</span>
                    <span>{fmtQtyNum(hoveredPoint.combinedTheoTotal, unit)} {uLabel}</span>
                  </div>
                )}
                {hoveredPoint.combinedSuspended > 0 && (
                  <div className="text-amber-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                    <span>Suspended:</span>
                    <span>{fmtQtyNum(hoveredPoint.combinedSuspended, unit)} {uLabel}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {(() => {
                  const sData = hoveredPoint.perSizeBalances[selectedMode] || { total: 0, usable: 0, suspended: 0 }
                  const sName = sizes.find(s => s.id === selectedMode)?.size || 'Size'
                  return (
                    <>
                      <div className="text-slate-300 font-bold mb-1">{sName} Balance:</div>
                      <div className="text-blue-400 font-semibold flex justify-between">
                        <span>Total:</span>
                        <span>{fmtQtyNum(sData.total, unit)} {uLabel}</span>
                      </div>
                      <div className="text-green-400 font-semibold flex justify-between">
                        <span>Usable:</span>
                        <span>{fmtQtyNum(sData.usable, unit)} {uLabel}</span>
                      </div>
                      {showTheo && (
                        <div className="text-slate-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                          <span>Theoretical total:</span>
                          <span>{fmtQtyNum(sData.theoTotal, unit)} {uLabel}</span>
                        </div>
                      )}
                      {sData.suspended > 0 && (
                        <div className="text-amber-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                          <span>Suspended:</span>
                          <span>{fmtQtyNum(sData.suspended, unit)} {uLabel}</span>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {showTheo && selectedMode === 'all_multi' && gaps.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h3 className="text-xs font-bold text-slate-700 mb-0.5">Actual vs theoretical — which sizes differ most</h3>
          <p className="text-[11px] text-gray-400 mb-2">As of {lastDay?.date}. Negative = fewer counted than the books say; positive = more. Click a size to isolate its line.</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {gaps.map(g => (
              <button key={g.id} onClick={() => setActiveSizeFilter(activeSizeFilter === g.id ? null : g.id)} className="flex items-center gap-2 text-xs text-left hover:bg-gray-50 rounded px-1 py-0.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="w-9 font-semibold text-slate-800">{g.size}</span>
                <span className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                  <span className={`block h-full ${g.diff < 0 ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${(Math.abs(g.diff) / maxGap) * 100}%` }} />
                </span>
                <span className={`w-28 text-right font-semibold ${Math.abs(g.diff) < 1 ? 'text-gray-400' : g.diff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {Math.abs(g.diff) < 1 ? '—' : `${g.diff > 0 ? '+' : ''}${fmtQtyNum(g.diff, unit)} ${uLabel}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
