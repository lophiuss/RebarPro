// Shared "Activity Log" builder for the Security Dashboard (today) and Audit
// page (any selected date) — merges every relevant event type into one
// chronological feed: guard clock in/out, visitor/delivery/in-house in/out,
// gate open/close, and alerts (panic + incidents).

export type ActivityEvent = {
  id: string
  time: string
  icon: string
  label: string
  detail: string
  tone: 'default' | 'good' | 'warn' | 'danger'
}

type EntryRow = {
  id: number; category: 'visitor' | 'delivery' | 'inhouse'; person_name: string
  company: string | null; vehicle_no: string | null; time_in: string; time_out: string | null
}
type PostLogRow = { id: number; guard_name: string; post_name: string; time_in: string; time_out: string | null }
type GateEventRow = { id: number; gate_name: string; action: string; username: string | null; created_at: string }
type PanicLogRow = { id: number; triggered_by: string; remark: string | null; created_at: string }
type IncidentRow = { id: number; type: string; description: string; severity: string; reported_by: string; created_at: string }

const CATEGORY_LABEL: Record<EntryRow['category'], string> = { visitor: 'Visitor', delivery: 'Delivery', inhouse: 'In-House' }
const CATEGORY_ICON: Record<EntryRow['category'], string> = { visitor: '🧑', delivery: '🚚', inhouse: '🏭' }

export function buildActivityLog(data: {
  entries?: EntryRow[]
  postLogs?: PostLogRow[]
  gateEvents?: GateEventRow[]
  panicLogs?: PanicLogRow[]
  incidents?: IncidentRow[]
}): ActivityEvent[] {
  const events: ActivityEvent[] = []

  ;(data.entries || []).forEach(e => {
    const label = CATEGORY_LABEL[e.category]
    const icon = CATEGORY_ICON[e.category]
    const detail = e.company || e.vehicle_no || ''
    events.push({ id: `entry-in-${e.id}`, time: e.time_in, icon, label: `${label} In: ${e.person_name}`, detail, tone: 'default' })
    if (e.time_out) {
      events.push({ id: `entry-out-${e.id}`, time: e.time_out, icon, label: `${label} Out: ${e.person_name}`, detail, tone: 'default' })
    }
  })

  ;(data.postLogs || []).forEach(s => {
    events.push({ id: `shift-in-${s.id}`, time: s.time_in, icon: '🟢', label: `Clock In: ${s.guard_name}`, detail: s.post_name, tone: 'good' })
    if (s.time_out) {
      events.push({ id: `shift-out-${s.id}`, time: s.time_out, icon: '🔴', label: `Clock Out: ${s.guard_name}`, detail: s.post_name, tone: 'default' })
    }
  })

  ;(data.gateEvents || []).forEach(g => {
    const closed = g.action === 'locked'
    events.push({
      id: `gate-${g.id}`, time: g.created_at,
      icon: closed ? '🔒' : '🔓',
      label: `Gate ${closed ? 'Closed' : 'Opened'}: ${g.gate_name}`,
      detail: g.username || '',
      tone: closed ? 'default' : 'warn',
    })
  })

  ;(data.panicLogs || []).forEach(p => {
    events.push({ id: `panic-${p.id}`, time: p.created_at, icon: '🚨', label: `PANIC ALARM: ${p.triggered_by}`, detail: p.remark || '', tone: 'danger' })
  })

  ;(data.incidents || []).forEach(i => {
    events.push({
      id: `incident-${i.id}`, time: i.created_at, icon: '⚠️',
      label: `Incident (${i.type}): ${i.description}`,
      detail: `Reported by ${i.reported_by}`,
      tone: i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warn' : 'default',
    })
  })

  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
}

export const ACTIVITY_TONE_CLASS: Record<ActivityEvent['tone'], string> = {
  default: 'bg-gray-100 text-gray-500',
  good: 'bg-green-100 text-green-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
}
