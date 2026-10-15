// GENERATED from src/lib/minutesHtml.ts by scripts/sync-minutes-to-edge.mjs. Do not edit here.
// Meeting minutes as a standalone, email-safe HTML document.
//
// ONE builder serves three places so they can never drift apart:
//   * the Preview on the Summary tab
//   * Print / Save as PDF (printed from a hidden frame, so no website chrome)
//   * the e-mail sent by the `send-meeting-summary` edge function
// (`scripts/sync-minutes-to-edge.mjs` copies this file, meetings.ts and
// richtext.ts next to the edge function before it is deployed.)
//
// Pure functions only: no React, no browser or Node APIs.

import { PAGE_LABEL, PAGE_TYPES, TODO_COLUMNS, evaluateGoal, formatGoal, formatKpiValue, formatSeconds, type GoalRule, type UnitType } from './meetings.ts'
import { richFromStored } from './richtext.ts'

export type MinutesInput = {
  meetingName: string
  createdAt: string
  averageRating: number | null
  snapshot: any
  // user id -> display name
  names: Record<string, string>
  includeDetails?: boolean
  includeNotes?: boolean
  // Optional short note from the sender, shown above the report.
  message?: string
  // Short report reference (the summary id).
  ref?: string
}

const TZ = 'Asia/Kuala_Lumpur'
const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const BLUE = '#2563eb'

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
}
function time(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeStyle: 'short', timeZone: TZ })
}

const th = (t: string, right = false) =>
  `<th style="text-align:${right ? 'right' : 'left'};padding:8px 10px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};background:#f8fafc;border-bottom:1px solid ${LINE}">${esc(t)}</th>`
const td = (html: string, extra = '') => `<td style="padding:8px 10px;border-bottom:1px solid ${LINE};font-size:13px;vertical-align:top;${extra}">${html}</td>`
const table = (head: string, rows: string) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid ${LINE};border-radius:8px;border-collapse:separate;overflow:hidden;margin:0 0 6px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`

function section(n: number, title: string, body: string) {
  return `<div style="margin:26px 0 0;page-break-inside:avoid">
    <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${INK};border-bottom:2px solid ${INK};padding-bottom:5px;margin-bottom:12px"><span style="color:${BLUE}">${n}.</span> ${esc(title)}</div>${body}</div>`
}

const none = `<p style="margin:0;font-size:13px;color:#94a3b8;font-style:italic">None</p>`
const sub = (t: string) => `<div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin:12px 0 6px">${esc(t)}</div>`

function pill(text: string, bg: string, fg: string) {
  return `<span style="display:inline-block;background:${bg};color:${fg};border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">${esc(text)}</span>`
}

function tile(label: string, value: string | number, colour = INK) {
  return `<td width="20%" style="padding:0 5px 0 0"><div style="border:1px solid ${LINE};border-radius:8px;padding:10px 12px"><div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">${esc(label)}</div><div style="font-size:22px;font-weight:700;color:${colour};margin-top:2px">${esc(value)}</div></div></td>`
}

export function buildMinutesHtml(input: MinutesInput): string {
  const s = input.snapshot ?? {}
  const name = (id: string | null | undefined) => (id ? input.names[id] ?? '—' : '—')
  const details = (h: string | null | undefined) => {
    if (!input.includeDetails) return ''
    const html = richFromStored(h)
    return html ? `<div style="font-size:12px;color:#475569;margin-top:3px;font-weight:400">${html}</div>` : ''
  }

  const started = s.started_at ? new Date(s.started_at).getTime() : null
  const ended = s.ended_at ? new Date(s.ended_at).getTime() : null
  const duration = started && ended ? Math.round((ended - started) / 1000) : (s.counts?.duration_seconds ?? null)
  const attendance: { user_id: string; name: string | null; present: boolean }[] = s.attendance ?? []
  const present = attendance.filter(a => a.present)
  const ratings: { user_id: string; name?: string | null; rating: number | null; feedback: string | null }[] = (s.ratings ?? []).filter((r: any) => r.rating != null)
  const kpis: any[] = s.kpis ?? []
  const goals: any[] = s.goals ?? []
  const headlines: any[] = s.headlines ?? []
  const created: any[] = s.todos_created ?? []
  const completed: any[] = s.todos_completed ?? []
  const open: any[] = s.todos_open ?? []
  const solved: any[] = s.issues_solved ?? []
  const openIssues: any[] = s.issues_open ?? []
  const times: Record<string, number> = s.page_seconds ?? {}
  const maxTime = Math.max(1, ...PAGE_TYPES.map(p => times[p] ?? 0))
  const when = s.ended_at ?? input.createdAt
  let n = 0
  const out: string[] = []

  if (attendance.length) {
    out.push(section(++n, 'Attendance', attendance
      .map(a => `<span style="display:inline-block;margin:0 6px 6px 0;border-radius:999px;padding:4px 11px;font-size:13px;border:1px solid ${a.present ? '#bbf7d0' : LINE};background:${a.present ? '#f0fdf4' : '#f8fafc'};color:${a.present ? '#166534' : '#64748b'}">${a.present ? '✓' : '✗'} ${esc(a.name ?? name(a.user_id))}</span>`)
      .join('')))
  }

  if (kpis.length) {
    const rows = kpis.map(k => {
      const goal = { rule: k.goal_rule as GoalRule, value: k.goal_value as number | null, max: k.goal_value_max as number | null }
      const unit = (k.unit_type ?? 'number') as UnitType
      const vals: { value: number | null }[] = k.values ?? []
      const latest = vals[0]?.value
      const hit = evaluateGoal(goal, latest)
      const result = hit === null ? pill('No data', '#f1f5f9', '#64748b') : hit ? pill('Goal met', '#dcfce7', '#15803d') : pill('Missed', '#fee2e2', '#b91c1c')
      return `<tr>${td(`<b>${esc(k.name)}</b><div style="font-size:11px;color:#94a3b8;text-transform:capitalize">${esc(k.cadence)} · ${esc(name(k.owner_id))}</div>`)}${td(esc(formatGoal(goal, unit)), 'white-space:nowrap')}${td(`<b>${esc(formatKpiValue(latest, unit))}</b>`, 'text-align:right')}${td(esc(vals.slice(1, 5).map(v => formatKpiValue(v.value, unit)).join(' · ') || '—'), 'text-align:right;color:#64748b')}${td(result)}</tr>`
    }).join('')
    out.push(section(++n, 'KPI scorecard', table(th('KPI') + th('Goal') + th('Latest', true) + th('Previous', true) + th('Result'), rows)))
  }

  out.push(section(++n, 'Quarterly priorities', goals.length === 0 ? none : table(th('Priority') + th('Owner') + th('Due') + th('Milestones') + th('Status'), goals.map(g => {
    const ms: { done: boolean }[] = Array.isArray(g.milestones) ? g.milestones : []
    const status = g.status === 'off' ? pill('Off track', '#fee2e2', '#b91c1c') : g.status === 'done' ? pill('Done', '#dbeafe', '#1d4ed8') : pill('On track', '#dcfce7', '#15803d')
    return `<tr>${td(`<b>${esc(g.title)}</b>${details(g.details)}`)}${td(esc(name(g.owner_id)))}${td(esc(g.due_date ?? '—'), 'white-space:nowrap')}${td(ms.length ? `${ms.filter(m => m.done).length}/${ms.length}` : '—')}${td(status)}</tr>`
  }).join(''))))

  out.push(section(++n, 'Headlines', headlines.length === 0 ? none
    : `<ul style="margin:0;padding-left:18px">${headlines.map(h => `<li style="margin:0 0 7px;font-size:13px"><b>${esc(h.title)}</b> <span style="color:#64748b">— ${esc(name(h.owner_id))}</span>${details(h.details)}</li>`).join('')}</ul>`))

  const todoRows = (list: any[], withStatus = false) => table(
    th('To-do') + th('Owner') + th('Due') + (withStatus ? th('Board status') : ''),
    list.map(t => `<tr>${td(`<b>${esc(t.title)}</b>${details(t.details)}`)}${td(esc(name(t.owner_id)))}${td(esc(t.due_date ?? '—'), 'white-space:nowrap')}${withStatus ? td(esc(TODO_COLUMNS.find(c => c.key === (t.status ?? 'todo'))?.label ?? 'To do')) : ''}</tr>`).join(''),
  )
  out.push(section(++n, 'Action items (to-dos)',
    sub(`Created in this meeting (${created.length})`) + (created.length ? todoRows(created) : none) +
    sub(`Completed (${completed.length})`) + (completed.length ? `<ul style="margin:0;padding-left:18px">${completed.map(t => `<li style="margin:0 0 4px;font-size:13px">${esc(t.title)} <span style="color:#64748b">— ${esc(name(t.owner_id))}</span></li>`).join('')}</ul>` : none) +
    sub(`Still open (${open.length})`) + (open.length ? todoRows(open, true) : none)))

  out.push(section(++n, 'Issues',
    sub(`Solved (${solved.length})`) + (solved.length ? `<ul style="margin:0;padding-left:18px">${solved.map(i => `<li style="margin:0 0 4px;font-size:13px">${esc(i.title)}${details(i.details)}</li>`).join('')}</ul>` : none) +
    sub(`Carried forward (${openIssues.length})`) + (openIssues.length ? `<ul style="margin:0;padding-left:18px">${openIssues.map(i => `<li style="margin:0 0 4px;font-size:13px">${esc(i.title)} <span style="color:#94a3b8">(${i.status === 'parking_lot' ? 'parking lot' : 'short term'})</span></li>`).join('')}</ul>` : none)))

  out.push(section(++n, 'Time per agenda item', `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${PAGE_TYPES.map(p => {
    const sec = Math.round(times[p] ?? 0)
    return `<tr><td style="width:150px;font-size:13px;padding:3px 0">${esc(PAGE_LABEL[p])}</td><td style="padding:3px 8px"><div style="background:#f1f5f9;border-radius:99px;height:8px"><div style="background:${BLUE};border-radius:99px;height:8px;width:${Math.round((sec / maxTime) * 100)}%"></div></div></td><td style="width:56px;text-align:right;font-size:13px;color:#475569;font-variant-numeric:tabular-nums">${formatSeconds(sec)}</td></tr>`
  }).join('')}</table>`))

  out.push(section(++n, 'Meeting rating and feedback', ratings.length === 0 ? none
    : table(th('Attendee') + th('Rating', true) + th('Feedback'), ratings.map(r => `<tr>${td(esc(r.name ?? name(r.user_id)))}${td(`<b>${r.rating}</b> / 10`, 'text-align:right;white-space:nowrap')}${td(esc(r.feedback ?? ''), 'color:#475569')}</tr>`).join(''))))

  if (input.includeNotes && s.notes) {
    out.push(section(++n, 'Meeting notes', `<div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(s.notes)}</div>`))
  }

  const rating = input.averageRating != null ? `${Number(input.averageRating).toFixed(1)} / 10` : '—'
  const message = input.message?.trim()
    ? `<div style="margin:0 0 20px;padding:12px 14px;background:#eff6ff;border-left:4px solid ${BLUE};border-radius:4px;font-size:14px;white-space:pre-wrap">${esc(input.message.trim().slice(0, 2000))}</div>`
    : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(input.meetingName)} - meeting minutes</title>
<style>@page{size:A4;margin:14mm}body{margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:${INK}}@media print{body{background:#fff}.sheet{box-shadow:none!important;border:0!important;margin:0!important;max-width:none!important}}</style></head>
<body><div class="sheet" style="max-width:780px;margin:24px auto;background:#fff;border:1px solid ${LINE};border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${INK};color:#fff"><tr>
<td style="padding:22px 28px"><div style="font-size:24px;font-weight:700;letter-spacing:-.01em">AlphaVision</div><div style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#94a3b8;margin-top:4px">Meeting minutes</div></td>
<td style="padding:22px 28px;text-align:right;font-size:13px;color:#cbd5e1"><div>${esc(longDate(when))}</div><div style="color:#94a3b8">Ref. ${esc(String(input.ref ?? '').slice(0, 8).toUpperCase() || '—')}</div></td></tr></table>
<div style="padding:26px 28px">${message}
<div style="font-size:28px;font-weight:700">${esc(input.meetingName)}</div>
<div style="font-size:13px;color:#475569;margin-top:6px">${duration != null ? `Duration <b>${formatSeconds(duration)}</b> &nbsp;·&nbsp; ` : ''}${s.started_at ? `Started <b>${esc(time(s.started_at))}</b> &nbsp;·&nbsp; ` : ''}${attendance.length ? `Attendance <b>${present.length} of ${attendance.length}</b>` : ''}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0"><tr>${tile('Headlines', headlines.length)}${tile('To-dos created', created.length, BLUE)}${tile('To-dos completed', completed.length === 0 && s.counts?.todos_completed_pct != null ? `${s.counts.todos_completed_pct}%` : completed.length, '#15803d')}${tile('Issues solved', s.counts?.issues_solved ?? solved.length, '#15803d')}${tile('Rating', rating, '#d97706')}</tr></table>
${out.join('')}
</div>
<div style="padding:14px 28px;border-top:1px solid ${LINE};background:#f8fafc;font-size:11px;color:#64748b">Generated by AlphaVision · ${esc(input.meetingName)}</div>
</div></body></html>`
}
