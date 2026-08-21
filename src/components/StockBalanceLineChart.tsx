'use client'

import React, { useState, useMemo } from 'react'

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
}

type RangeOption = '14_days' | 'this_month' | '30_days' | '60_days'
type MultiMetric = 'usable' | 'total'

// Distinct color palette for multi-line view
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
  projects
}: Props) {
  // 'all_multi' = Multi-line (each size one line)
  // 'all_total' = Combined total
  // sizeId = Specific size
  const [selectedMode, setSelectedMode] = useState<string>('all_multi')
  const [multiMetric, setMultiMetric] = useState<MultiMetric>('usable')
  const [range, setRange] = useState<RangeOption>('30_days')
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null)
  const [activeSizeFilter, setActiveSizeFilter] = useState<string | null>(null)

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Generate date list based on selected range
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

  // Precompute balance for each size on each date
  const dailyData = useMemo(() => {
    const knownProjectIds = projects.map(p => p.id)

    return dateList.map(dateStr => {
      let combinedTotal = 0
      let combinedSuspended = 0
      const perSizeBalances: Record<string, { total: number; usable: number; suspended: number }> = {}

      sizes.forEach(size => {
        let sizeTotal = 0

        // 1. Across project types anchored to latest prior stock take
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

          if (latestST) {
            const txsAfter = ptTxs.filter(t => t.transaction_date > latestST.stock_take_date)
            const txSum = txsAfter.reduce((sum, t) => sum + Number(t.quantity), 0)
            sizeTotal += Number(latestST.physical_count) + txSum
          } else {
            const txSum = ptTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
            sizeTotal += txSum
          }
        }

        // 2. Unassigned transactions
        const unassignedTxs = transactions.filter(t => 
          t.size_id === size.id && 
          !t.project_type_id && 
          (!t.project_id || !knownProjectIds.includes(t.project_id)) &&
          t.transaction_date <= dateStr
        )
        sizeTotal += unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)

        // 3. Suspended
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
          suspended: sizeSuspended
        }

        combinedTotal += Math.max(sizeTotal, 0)
        combinedSuspended += sizeSuspended
      })

      const combinedUsable = Math.max(combinedTotal - combinedSuspended, 0)

      return {
        date: dateStr,
        label: dateStr.slice(5),
        combinedTotal,
        combinedUsable,
        combinedSuspended,
        perSizeBalances,
        isToday: dateStr === todayStr
      }
    })
  }, [dateList, sizes, transactions, stockTakes, projectTypes, projects])

  // Filter sizes that actually have active stock in this range
  const activeSizes = useMemo(() => {
    return sizes.map((s, idx) => {
      const color = SIZE_COLORS[idx % SIZE_COLORS.length]
      const maxInPeriod = Math.max(...dailyData.map(d => d.perSizeBalances[s.id]?.total || 0))
      return { ...s, color, maxInPeriod }
    }).filter(s => s.maxInPeriod > 0)
  }, [sizes, dailyData])

  // Determine Max Y value
  const maxVal = useMemo(() => {
    if (selectedMode === 'all_total') {
      return Math.max(...dailyData.map(d => d.combinedTotal), 1) * 1.15
    } else if (selectedMode === 'all_multi') {
      const allVals = dailyData.flatMap(d => 
        activeSizes.map(s => multiMetric === 'usable' ? d.perSizeBalances[s.id]?.usable || 0 : d.perSizeBalances[s.id]?.total || 0)
      )
      return Math.max(...allVals, 1) * 1.15
    } else {
      const vals = dailyData.map(d => d.perSizeBalances[selectedMode]?.total || 0)
      return Math.max(...vals, 1) * 1.15
    }
  }, [dailyData, selectedMode, activeSizes, multiMetric])

  // Dimensions
  const width = 900
  const height = 270
  const paddingLeft = 55
  const paddingRight = 30
  const paddingTop = 30
  const paddingBottom = 40

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  // Generate SVG Points
  const points = useMemo(() => {
    return dailyData.map((d, index) => {
      const x = paddingLeft + (index / Math.max(dailyData.length - 1, 1)) * plotWidth
      
      // Total combined
      const yTotal = paddingTop + plotHeight - (d.combinedTotal / maxVal) * plotHeight
      const yUsable = paddingTop + plotHeight - (d.combinedUsable / maxVal) * plotHeight

      // Per-size coordinates
      const sizeCoords: Record<string, { y: number; val: number }> = {}
      activeSizes.forEach(s => {
        const val = multiMetric === 'usable' 
          ? (d.perSizeBalances[s.id]?.usable || 0)
          : (d.perSizeBalances[s.id]?.total || 0)
        const y = paddingTop + plotHeight - (val / maxVal) * plotHeight
        sizeCoords[s.id] = { y, val }
      })

      // Single size coordinates
      let ySingleTotal = 0
      let ySingleUsable = 0
      if (selectedMode !== 'all_multi' && selectedMode !== 'all_total') {
        const sData = d.perSizeBalances[selectedMode] || { total: 0, usable: 0, suspended: 0 }
        ySingleTotal = paddingTop + plotHeight - (sData.total / maxVal) * plotHeight
        ySingleUsable = paddingTop + plotHeight - (sData.usable / maxVal) * plotHeight
      }

      return {
        ...d,
        x,
        yTotal,
        yUsable,
        sizeCoords,
        ySingleTotal,
        ySingleUsable
      }
    })
  }, [dailyData, maxVal, activeSizes, multiMetric, selectedMode])

  // Lines paths for single / combined mode
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

  // Per-size line paths in multi-line mode
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
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock Balance Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectedMode === 'all_multi' && `Comparing daily stock lines across all rebar sizes (${multiMetric === 'usable' ? 'Usable' : 'Total'} Tonnage)`}
            {selectedMode === 'all_total' && 'Total combined factory physical balance & usable balance'}
            {selectedMode !== 'all_multi' && selectedMode !== 'all_total' && `Daily balance for ${sizes.find(s => s.id === selectedMode)?.size || 'Selected Size'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Mode Selector */}
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

          {/* Metric toggle in multi-line mode */}
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

          {/* Time Range Selector */}
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

      {/* Interactive Size Legend for Multi-Line Mode */}
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

      {/* Interactive SVG Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-64 select-none min-w-[650px]"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Y-axis Grid */}
          {yTicks.map((tick, i) => {
            const y = paddingTop + plotHeight - (tick / maxVal) * plotHeight
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
                  {tick.toFixed(0)} T
                </text>
              </g>
            )
          })}

          {/* MULTI-LINE MODE */}
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
                  </g>
                )
              })}
            </>
          )}

          {/* COMBINED TOTAL MODE */}
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
            </>
          )}

          {/* SINGLE SIZE MODE */}
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
            </>
          )}

          {/* Hover Trigger Zones */}
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

          {/* Active Hover Cursor & Line */}
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

          {/* X-axis Date Labels */}
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

        {/* Hover Tooltip Overlay */}
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
                      <span className="font-bold text-slate-100">{val.toFixed(2)} T</span>
                    </div>
                  )
                })}
              </div>
            ) : selectedMode === 'all_total' ? (
              <div className="space-y-1">
                <div className="text-blue-400 font-semibold flex justify-between">
                  <span>Total Stock:</span>
                  <span>{hoveredPoint.combinedTotal.toFixed(2)} T</span>
                </div>
                <div className="text-green-400 font-semibold flex justify-between">
                  <span>Usable Stock:</span>
                  <span>{hoveredPoint.combinedUsable.toFixed(2)} T</span>
                </div>
                {hoveredPoint.combinedSuspended > 0 && (
                  <div className="text-amber-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                    <span>Suspended:</span>
                    <span>{hoveredPoint.combinedSuspended.toFixed(2)} T</span>
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
                        <span>{sData.total.toFixed(2)} T</span>
                      </div>
                      <div className="text-green-400 font-semibold flex justify-between">
                        <span>Usable:</span>
                        <span>{sData.usable.toFixed(2)} T</span>
                      </div>
                      {sData.suspended > 0 && (
                        <div className="text-amber-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                          <span>Suspended:</span>
                          <span>{sData.suspended.toFixed(2)} T</span>
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
    </div>
  )
}
