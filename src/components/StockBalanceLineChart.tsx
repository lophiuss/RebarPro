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

export default function StockBalanceLineChart({
  transactions,
  stockTakes,
  sizes,
  projectTypes,
  projects
}: Props) {
  const [selectedSizeId, setSelectedSizeId] = useState<string>('all')
  const [range, setRange] = useState<RangeOption>('30_days')
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null)

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

  // Calculate daily progression of Total Balance and Usable Balance
  const dailyData = useMemo(() => {
    const targetSizes = selectedSizeId === 'all' ? sizes : sizes.filter(s => s.id === selectedSizeId)
    const knownProjectIds = projects.map(p => p.id)

    return dateList.map(dateStr => {
      let dayTotalBalance = 0
      let daySuspended = 0

      targetSizes.forEach(size => {
        // 1. Total balance for this size across project types as of dateStr
        for (const pt of projectTypes) {
          const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)
          const ptTxs = transactions.filter(t => 
            t.size_id === size.id && 
            (t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id))) &&
            t.transaction_date <= dateStr
          )

          // Find latest stock take on or before dateStr for this project type
          const priorSTs = stockTakes.filter(st => 
            st.size_id === size.id && 
            st.project_type_id === pt.id && 
            st.stock_take_date <= dateStr
          ).sort((a, b) => b.stock_take_date.localeCompare(a.stock_take_date))

          const latestST = priorSTs[0]

          if (latestST) {
            const txsAfter = ptTxs.filter(t => t.transaction_date > latestST.stock_take_date)
            const txSum = txsAfter.reduce((sum, t) => sum + Number(t.quantity), 0)
            dayTotalBalance += Number(latestST.physical_count) + txSum
          } else {
            const txSum = ptTxs.reduce((sum, t) => sum + Number(t.quantity), 0)
            dayTotalBalance += txSum
          }
        }

        // Unassigned transactions for this size
        const unassignedTxs = transactions.filter(t => 
          t.size_id === size.id && 
          !t.project_type_id && 
          (!t.project_id || !knownProjectIds.includes(t.project_id)) &&
          t.transaction_date <= dateStr
        )
        dayTotalBalance += unassignedTxs.reduce((sum, t) => sum + Number(t.quantity), 0)

        // 2. Suspended for this size as of dateStr
        const sizeTxs = transactions.filter(t => t.size_id === size.id && t.transaction_date <= dateStr)
        let sCount = 0
        sizeTxs.forEach(t => {
          const q = Math.abs(Number(t.quantity))
          if (t.type === 'suspended') sCount += q
          if (t.type === 'unsuspend') sCount -= q
        })
        daySuspended += Math.max(sCount, 0)
      })

      const dayUsableBalance = Math.max(dayTotalBalance - daySuspended, 0)

      return {
        date: dateStr,
        label: dateStr.slice(5), // MM-DD
        totalBalance: Math.max(dayTotalBalance, 0),
        usableBalance: dayUsableBalance,
        suspended: daySuspended,
        isToday: dateStr === todayStr
      }
    })
  }, [dateList, selectedSizeId, sizes, transactions, stockTakes, projectTypes, projects])

  // Coordinate math for SVG
  const maxVal = Math.max(...dailyData.map(d => Math.max(d.totalBalance, d.usableBalance)), 1) * 1.15
  const minVal = 0

  const width = 900
  const height = 260
  const paddingLeft = 60
  const paddingRight = 30
  const paddingTop = 30
  const paddingBottom = 40

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  const points = dailyData.map((d, index) => {
    const x = paddingLeft + (index / Math.max(dailyData.length - 1, 1)) * plotWidth
    const yTotal = paddingTop + plotHeight - ((d.totalBalance - minVal) / (maxVal - minVal)) * plotHeight
    const yUsable = paddingTop + plotHeight - ((d.usableBalance - minVal) / (maxVal - minVal)) * plotHeight
    return { ...d, x, yTotal, yUsable }
  })

  // SVG paths
  const totalPath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yTotal.toFixed(1)}`, '')
    : ''

  const usablePath = points.length > 0
    ? points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yUsable.toFixed(1)}`, '')
    : ''

  // Usable area fill
  const usableArea = points.length > 0
    ? `${usablePath} L ${points[points.length - 1].x.toFixed(1)} ${(paddingTop + plotHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(paddingTop + plotHeight).toFixed(1)} Z`
    : ''

  // Y-axis ticks
  const yTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal]

  const currentSizeName = selectedSizeId === 'all' ? 'All Sizes (Total Factory)' : sizes.find(s => s.id === selectedSizeId)?.size || 'Selected Size'

  return (
    <div className="bg-white border rounded-xl shadow-sm p-6 mb-10">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock Balance Over Time</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Total Physical Balance vs Usable Balance progression for <strong>{currentSizeName}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Rebar Size Selector */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-500 font-medium">Rebar Size:</span>
            <select
              value={selectedSizeId}
              onChange={e => setSelectedSizeId(e.target.value)}
              className="border rounded-lg px-2.5 py-1.5 bg-white font-semibold text-slate-800 text-xs shadow-xs"
            >
              <option value="all">All Sizes (Combined)</option>
              {sizes.map(s => (
                <option key={s.id} value={s.id}>{s.size}</option>
              ))}
            </select>
          </div>

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

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs font-medium pl-2">
            <span className="flex items-center gap-1.5 text-blue-700">
              <span className="w-3.5 h-1 bg-blue-600 rounded-full inline-block" />
              Total Balance
            </span>
            <span className="flex items-center gap-1.5 text-green-700">
              <span className="w-3.5 h-1 bg-green-500 rounded-full inline-block" />
              Usable Balance
            </span>
          </div>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-64 select-none min-w-[650px]"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Y-axis Grid Lines */}
          {yTicks.map((tick, i) => {
            const y = paddingTop + plotHeight - ((tick - minVal) / (maxVal - minVal)) * plotHeight
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
                  x={paddingLeft - 10}
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

          {/* Usable Stock Area Fill */}
          {usableArea && (
            <path
              d={usableArea}
              fill="url(#usableGradient)"
              opacity="0.25"
            />
          )}

          <defs>
            <linearGradient id="usableGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Total Balance Line (Blue) */}
          <path
            d={totalPath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Usable Balance Line (Green) */}
          <path
            d={usablePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Hover Vertical Bar & Points */}
          {points.map((p, idx) => (
            <g
              key={p.date}
              onMouseEnter={() => setHoveredPoint(p)}
              className="cursor-pointer"
            >
              {/* Invisible wide hover trigger */}
              <rect
                x={p.x - (plotWidth / points.length) / 2}
                y={paddingTop}
                width={plotWidth / points.length}
                height={plotHeight}
                fill="transparent"
              />

              {/* Dot on Today */}
              {p.isToday && (
                <>
                  <circle cx={p.x} cy={p.yTotal} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
                  <circle cx={p.x} cy={p.yUsable} r="4" fill="#10b981" stroke="#fff" strokeWidth="2" />
                </>
              )}
            </g>
          ))}

          {/* Active Hover Indicator Line */}
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
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.yTotal}
                r="6"
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.yUsable}
                r="5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          {/* X-axis Date Labels */}
          {points.map((p, idx) => {
            // Show label every few points to avoid crowding
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
            className="absolute bg-slate-900 text-white text-xs rounded-xl shadow-2xl p-3 z-30 pointer-events-none border border-slate-700 min-w-[170px]"
            style={{
              left: `${Math.min(Math.max((hoveredPoint.x / width) * 100, 15), 85)}%`,
              top: '10px',
              transform: 'translateX(-50%)'
            }}
          >
            <div className="font-bold border-b border-slate-700 pb-1 mb-1.5 text-slate-200 flex items-center justify-between">
              <span>{hoveredPoint.date}</span>
              {hoveredPoint.isToday && <span className="bg-blue-600 text-[10px] px-1.5 py-0.5 rounded">Today</span>}
            </div>
            <div className="text-blue-400 font-semibold mb-0.5 flex justify-between">
              <span>Total Stock:</span>
              <span>{hoveredPoint.totalBalance.toFixed(2)} T</span>
            </div>
            <div className="text-green-400 font-semibold mb-0.5 flex justify-between">
              <span>Usable Stock:</span>
              <span>{hoveredPoint.usableBalance.toFixed(2)} T</span>
            </div>
            {hoveredPoint.suspended > 0 && (
              <div className="text-amber-400 text-[11px] pt-1 border-t border-slate-800 flex justify-between">
                <span>Suspended:</span>
                <span>{hoveredPoint.suspended.toFixed(2)} T</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
