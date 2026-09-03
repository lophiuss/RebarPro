import { ActivityEvent, ACTIVITY_TONE_CLASS } from '@/lib/security/activityLog'

export default function ActivityLogFeed({ events, emptyLabel = 'No activity recorded.' }: { events: ActivityEvent[]; emptyLabel?: string }) {
  if (events.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">{emptyLabel}</p>
  }
  return (
    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
      {events.map(ev => (
        <div key={ev.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${ACTIVITY_TONE_CLASS[ev.tone]}`}>{ev.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-800 truncate">{ev.label}</div>
            {ev.detail && <div className="text-xs text-gray-500 truncate">{ev.detail}</div>}
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">
            {new Date(ev.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  )
}
