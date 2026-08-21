'use client'

import { useState, useMemo } from 'react'

interface TransactionItem {
  quantity: number
  type: string
  transaction_date: string
}

interface Props {
  transactions: TransactionItem[]
}

type Period = 'current_month' | '14_days' | 'monthly' | 'yearly' | 'custom'

export default function UsageTrendsChart({ transactions }: Props) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  
  // Default start date for custom range = start of current month
  const firstDayCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  const [period, setPeriod] = useState<Period>('current_month')
  const [customStart, setCustomStart] = useState<string>(firstDayCurrentMonth)
  const [customEnd, setCustomEnd] = useState<string>(todayStr)

  const [showIncoming, setShowIncoming] = useState(true)
  const [showUsage, setShowUsage] = useState(true)
  const [showWastage, setShowWastage] = useState(true)

  const chartData = useMemo(() => {
    if (period === 'current_month') {
      // Days from 1st of current month to end of current month
      const y = today.getFullYear()
      const m = today.getMonth()
      const lastDay = new Date(y, m + 1, 0).getDate()
      const days: { label: string; key: string; incoming: number; usage: number; wastage: number; isToday: boolean }[] = []

      for (let dayNum = 1; dayNum <= lastDay; dayNum++) {
        const dStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
        days.push({
          label: String(dayNum),
          key: dStr,
          incoming: 0,
          usage: 0,
          wastage: 0,
          isToday: dStr === todayStr
        })
      }

      transactions.forEach(tx => {
        const d = days.find(item => item.key === tx.transaction_date)
        if (d) {
          const q = Math.abs(Number(tx.quantity))
          if (tx.type === 'incoming') d.incoming += Number(tx.quantity)
          if (tx.type === 'usage') d.usage += q
          if (tx.type === 'wastage') d.wastage += q
        }
      })

      return days
    } else if (period === '14_days') {
      const days: { label: string; key: string; incoming: number; usage: number; wastage: number; isToday: boolean }[] = []
      for (let i = 13; i >= 0; i--) {
        const d = new Date()
        d.setDate(today.getDate() - i)
        const key = d.toISOString().split('T')[0]
        const label = key.slice(5) // MM-DD
        days.push({ label, key, incoming: 0, usage: 0, wastage: 0, isToday: i === 0 })
      }

      transactions.forEach(tx => {
        const d = days.find(item => item.key === tx.transaction_date)
        if (d) {
          const q = Math.abs(Number(tx.quantity))
          if (tx.type === 'incoming') d.incoming += Number(tx.quantity)
          if (tx.type === 'usage') d.usage += q
          if (tx.type === 'wastage') d.wastage += q
        }
      })

      return days
    } else if (period === 'custom') {
      if (!customStart || !customEnd || customStart > customEnd) return []
      
      const start = new Date(customStart)
      const end = new Date(customEnd)
      const days: { label: string; key: string; incoming: number; usage: number; wastage: number; isToday: boolean }[] = []

      const curr = new Date(start)
      while (curr <= end) {
        const key = curr.toISOString().split('T')[0]
        const label = key.slice(5) // MM-DD
        days.push({ label, key, incoming: 0, usage: 0, wastage: 0, isToday: key === todayStr })
        curr.setDate(curr.getDate() + 1)
      }

      transactions.forEach(tx => {
        const d = days.find(item => item.key === tx.transaction_date)
        if (d) {
          const q = Math.abs(Number(tx.quantity))
          if (tx.type === 'incoming') d.incoming += Number(tx.quantity)
          if (tx.type === 'usage') d.usage += q
          if (tx.type === 'wastage') d.wastage += q
        }
      })

      return days
    } else if (period === 'monthly') {
      // Past 12 months
      const months: { label: string; key: string; incoming: number; usage: number; wastage: number; isCurrent: boolean }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const key = `${y}-${m}`
        const label = d.toLocaleString('default', { month: 'short' }) + `'` + String(y).slice(2)
        months.push({ label, key, incoming: 0, usage: 0, wastage: 0, isCurrent: i === 0 })
      }

      transactions.forEach(tx => {
        if (!tx.transaction_date) return
        const txMonth = tx.transaction_date.slice(0, 7)
        const m = months.find(item => item.key === txMonth)
        if (m) {
          const q = Math.abs(Number(tx.quantity))
          if (tx.type === 'incoming') m.incoming += Number(tx.quantity)
          if (tx.type === 'usage') m.usage += q
          if (tx.type === 'wastage') m.wastage += q
        }
      })

      return months
    } else {
      // Yearly: Past 5 years
      const currentYear = today.getFullYear()
      const years: { label: string; key: string; incoming: number; usage: number; wastage: number; isCurrent: boolean }[] = []
      for (let y = currentYear - 4; y <= currentYear; y++) {
        years.push({ label: String(y), key: String(y), incoming: 0, usage: 0, wastage: 0, isCurrent: y === currentYear })
      }

      transactions.forEach(tx => {
        if (!tx.transaction_date) return
        const txYear = tx.transaction_date.slice(0, 4)
        const y = years.find(item => item.key === txYear)
        if (y) {
          const q = Math.abs(Number(tx.quantity))
          if (tx.type === 'incoming') y.incoming += Number(tx.quantity)
          if (tx.type === 'usage') y.usage += q
          if (tx.type === 'wastage') y.wastage += q
        }
      })

      return years
    }
  }, [transactions, period, customStart, customEnd])

  const totalIn = chartData.reduce((sum, d) => sum + d.incoming, 0)
  const totalUse = chartData.reduce((sum, d) => sum + d.usage, 0)
  const totalWaste = chartData.reduce((sum, d) => sum + d.wastage, 0)

  const maxVal = Math.max(
    ...chartData.map(d => Math.max(
      showIncoming ? d.incoming : 0,
      showUsage ? d.usage : 0,
      showWastage ? d.wastage : 0
    )),
    0.01
  )

  return (
    <div className="p-6">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b pb-4">
        {/* Period Switcher Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setPeriod('current_month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === 'current_month' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            This Month
          </button>
          <button
            onClick={() => setPeriod('14_days')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === '14_days' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            14 Days
          </button>
          <button
            onClick={() => setPeriod('monthly')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            12 Months
          </button>
          <button
            onClick={() => setPeriod('yearly')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === 'yearly' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Yearly
          </button>
          <button
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${period === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Custom Range
          </button>
        </div>

        {/* Custom Date Range Selector */}
        {period === 'custom' && (
          <div className="flex items-center gap-2 text-xs bg-gray-50 p-1.5 rounded-lg border">
            <span className="text-gray-500 font-medium">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="border rounded px-2 py-1 bg-white text-xs"
            />
            <span className="text-gray-500 font-medium">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="border rounded px-2 py-1 bg-white text-xs"
            />
          </div>
        )}

        {/* Metric Toggles / Legend */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={showIncoming}
              onChange={e => setShowIncoming(e.target.checked)}
              className="accent-green-500 rounded"
            />
            <span className="w-2.5 h-2.5 bg-green-500 rounded-sm inline-block" />
            Incoming ({totalIn.toFixed(1)}T)
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={showUsage}
              onChange={e => setShowUsage(e.target.checked)}
              className="accent-red-500 rounded"
            />
            <span className="w-2.5 h-2.5 bg-red-500 rounded-sm inline-block" />
            Usage ({totalUse.toFixed(1)}T)
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              checked={showWastage}
              onChange={e => setShowWastage(e.target.checked)}
              className="accent-orange-500 rounded"
            />
            <span className="w-2.5 h-2.5 bg-orange-500 rounded-sm inline-block" />
            Wastage ({totalWaste.toFixed(1)}T)
          </label>
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="flex items-end gap-1 sm:gap-1.5 h-52 pt-6 overflow-x-auto">
        {chartData.map((item: any) => {
          const inH = showIncoming ? (item.incoming / maxVal) * 100 : 0
          const useH = showUsage ? (item.usage / maxVal) * 100 : 0
          const wasteH = showWastage ? (item.wastage / maxVal) * 100 : 0

          return (
            <div
              key={item.key}
              className={`flex-1 min-w-[18px] flex flex-col justify-end h-full group relative ${item.isToday || item.isCurrent ? 'bg-blue-50/70 rounded-t' : ''}`}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs rounded-lg shadow-xl p-2.5 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-20 pointer-events-none border border-slate-700 min-w-[130px]">
                <div className="font-bold border-b border-slate-700 pb-1 mb-1 text-slate-200">{item.key}</div>
                {item.incoming > 0 && <div className="text-green-400">↑ Incoming: {item.incoming.toFixed(2)} T</div>}
                {item.usage > 0 && <div className="text-red-400">↓ Usage: {item.usage.toFixed(2)} T</div>}
                {item.wastage > 0 && <div className="text-orange-400">⚠ Wastage: {item.wastage.toFixed(2)} T</div>}
                {item.incoming === 0 && item.usage === 0 && item.wastage === 0 && (
                  <div className="text-gray-400 italic">No activity</div>
                )}
              </div>

              {/* Grouped Bars */}
              <div className="flex items-end justify-center gap-0.5 w-full h-full px-0.5">
                {showIncoming && (
                  <div
                    className="flex-1 bg-green-500 rounded-t-sm transition-all duration-300 hover:brightness-110 min-h-[2px]"
                    style={{ height: `${Math.max(inH, item.incoming > 0 ? 3 : 0)}%` }}
                  />
                )}
                {showUsage && (
                  <div
                    className="flex-1 bg-red-500 rounded-t-sm transition-all duration-300 hover:brightness-110 min-h-[2px]"
                    style={{ height: `${Math.max(useH, item.usage > 0 ? 3 : 0)}%` }}
                  />
                )}
                {showWastage && (
                  <div
                    className="flex-1 bg-orange-500 rounded-t-sm transition-all duration-300 hover:brightness-110 min-h-[2px]"
                    style={{ height: `${Math.max(wasteH, item.wastage > 0 ? 3 : 0)}%` }}
                  />
                )}
              </div>
            </div>
          )
        })}
        {chartData.length === 0 && (
          <div className="w-full text-center text-gray-400 py-10">No data for the selected range.</div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1 sm:gap-1.5 mt-2 border-t pt-2 overflow-x-auto">
        {chartData.map((item: any) => (
          <div key={item.key} className="flex-1 min-w-[18px] text-center">
            <span className={`text-[10px] block truncate ${item.isToday || item.isCurrent ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
