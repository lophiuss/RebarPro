'use client'

interface DayData {
  date: string
  usage: number
  incoming: number
  isToday: boolean
}

export default function DailyUsageChart({ data }: { data: DayData[] }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.usage, d.incoming)), 0.01)

  return (
    <div className="p-6">
      <div className="flex items-end gap-1 h-44">
        {data.map((day) => {
          const usageH = (day.usage / maxVal) * 100
          const incomingH = (day.incoming / maxVal) * 100
          return (
            <div
              key={day.date}
              className={`flex-1 flex flex-col justify-end gap-0.5 h-full group relative ${day.isToday ? 'bg-blue-50 rounded' : ''}`}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                <div className="font-bold">{day.date}</div>
                {day.incoming > 0 && <div className="text-green-300">↑ In: {day.incoming.toFixed(2)}T</div>}
                {day.usage > 0 && <div className="text-red-300">↓ Use: {day.usage.toFixed(2)}T</div>}
              </div>

              <div className="flex items-end gap-0.5 flex-1">
                {/* Incoming bar */}
                <div
                  className="flex-1 bg-green-400 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${incomingH}%` }}
                />
                {/* Usage bar */}
                <div
                  className="flex-1 bg-red-400 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${usageH}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1 mt-2 border-t pt-2">
        {data.map((day) => (
          <div key={day.date} className="flex-1 text-center">
            <span className={`text-[9px] ${day.isToday ? 'text-blue-600 font-bold' : 'text-gray-400'}`}>
              {day.date.slice(5)}
            </span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-6 mt-4 justify-center text-xs text-gray-600">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-green-400 rounded-sm inline-block" />
          Incoming
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 bg-red-400 rounded-sm inline-block" />
          Usage
        </span>
      </div>
    </div>
  )
}
