'use client'

import React from 'react'

interface RebarStat {
  size: string
  unit: string
  balance: number
  suspended: number
  usableBalance: number
  targetDailyUsage: number
}

export default function RebarStockChart({ stats }: { stats: RebarStat[] }) {
  if (stats.length === 0) {
    return null
  }

  const maxVal = Math.max(...stats.map(s => s.balance), 1)

  return (
    <div className="bg-white border rounded-xl shadow-sm p-6 mb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Stock Balance by Rebar Size</h2>
          <p className="text-xs text-gray-500 mt-0.5">Physical stock levels across all rebar sizes</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-blue-700">
            <span className="w-3 h-3 bg-blue-600 rounded-xs inline-block" />
            Usable Stock
          </span>
          <span className="flex items-center gap-1.5 text-amber-700">
            <span className="w-3 h-3 bg-amber-400 rounded-xs inline-block" />
            Suspended Stock
          </span>
        </div>
      </div>

      {/* Bar Chart Container */}
      <div className="flex items-end gap-2 sm:gap-3 h-60 pt-8 pb-2 overflow-x-auto">
        {stats.map((s) => {
          const usableH = (s.usableBalance / maxVal) * 100
          const suspendedH = (s.suspended / maxVal) * 100
          const totalH = (s.balance / maxVal) * 100

          return (
            <div
              key={s.size}
              className="flex-1 min-w-[38px] flex flex-col justify-end items-center h-full group relative"
            >
              {/* Value Label on Top */}
              <div className="text-[11px] font-bold text-slate-700 mb-1 text-center whitespace-nowrap">
                {s.balance.toFixed(1)}T
              </div>

              {/* Tooltip on Hover */}
              <div className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg shadow-xl p-2.5 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 pointer-events-none border border-slate-700">
                <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200 text-sm">
                  {s.size} ({s.unit})
                </div>
                <div className="text-blue-300">✓ Usable: {s.usableBalance.toFixed(2)} {s.unit}</div>
                {s.suspended > 0 && <div className="text-amber-300">⚠ Suspended: {s.suspended.toFixed(2)} {s.unit}</div>}
                <div className="text-slate-300 font-bold border-t border-slate-800 pt-1 mt-1">Total: {s.balance.toFixed(2)} {s.unit}</div>
              </div>

              {/* Stacked Vertical Bar */}
              <div className="w-full max-w-[32px] flex flex-col justify-end bg-gray-100 rounded-t overflow-hidden h-full">
                {/* Suspended (amber on top) */}
                {s.suspended > 0 && (
                  <div
                    className="w-full bg-amber-400 transition-all hover:brightness-110"
                    style={{ height: `${Math.max(suspendedH, 2)}%` }}
                  />
                )}
                {/* Usable (blue at bottom) */}
                <div
                  className="w-full bg-blue-600 transition-all hover:brightness-110"
                  style={{ height: `${Math.max(usableH, s.usableBalance > 0 ? 2 : 0)}%` }}
                />
              </div>

              {/* X-axis Label (Rebar Size) */}
              <div className="mt-2 text-center">
                <span className="text-xs font-bold text-slate-800 block">
                  {s.size}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
