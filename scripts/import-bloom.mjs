// Imports a Bloom Growth export (bloom-export.json) into the Meetings module.
//   node --env-file=.env.local scripts/import-bloom.mjs <bloom-export.json> [--dry]
//
// People are matched to existing logins by name; anyone without a login is kept as a
// contact (mtg_contacts) and shown by name. Nothing is created in auth.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { sanitizeRich } from '../src/lib/richtext.ts'

const file = process.argv[2]
const dry = process.argv.includes('--dry')
if (!file) throw new Error('usage: import-bloom.mjs <bloom-export.json> [--dry]')
const data = JSON.parse(readFileSync(file, 'utf8'))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const log = (...a) => console.log(...a)
const must = async (p, what) => { const { data: d, error } = await p; if (error) throw new Error(`${what}: ${error.message}`); return d }
const iso = s => (s == null ? null : new Date(Number(s) * 1000).toISOString())
const ymd = s => (s == null ? null : new Date(Number(s) * 1000).toISOString().slice(0, 10))
const num = v => (v === '' || v == null ? null : Number(v))
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
async function insertAll(table, rows, select) {
  const out = []
  for (const c of chunk(rows, 400)) {
    const q = db.from(table).insert(c)
    const d = await must(select ? q.select(select) : q, `insert ${table}`)
    if (d) out.push(...d)
  }
  return out
}

// ------------------------------------------------------------------ people
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = s => norm(s).split(' ').filter(Boolean)

const profiles = await must(db.from('profiles').select('id, full_name').neq('is_active', false), 'profiles')
const david = profiles.find(p => norm(p.full_name) === 'david then')
if (!david) throw new Error('Could not find the David Then login to own the imported meetings')

// Everyone Bloom mentions, by Bloom id.
const bloomPeople = new Map()
const seen = p => { if (p && p.id != null && p.fullName) bloomPeople.set(p.id, p.fullName) }
for (const m of data.meetings) {
  m.attendees.nodes.forEach(seen)
  for (const f of ['headlines', 'issues', 'todos', 'goals', 'metrics']) m[f].nodes.forEach(n => seen(n.assignee))
  m.instances.forEach(i => i.attendeeInstances.nodes.forEach(a => seen(a.attendee)))
}
data.org.seats.nodes.forEach(s => s.users.nodes.forEach(u => bloomPeople.set(u.id, u.fullName)))

// A login matches when the names are identical, or when the login's name is contained in
// the Bloom name and no other login could be meant (so "Anim", with several logins, is left alone).
function matchLogin(name) {
  const exact = profiles.filter(p => norm(p.full_name) === norm(name))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const nt = new Set(tokens(name))
  const partial = profiles.filter(p => {
    const pt = tokens(p.full_name)
    return pt.length >= 1 && norm(p.full_name).length >= 4 && pt.every(t => nt.has(t))
  })
  return partial.length === 1 ? partial[0] : null
}
const loginByBloomId = new Map()
for (const [id, name] of bloomPeople) { const m = matchLogin(name); if (m) loginByBloomId.set(id, m) }
// One login may only stand for one Bloom person.
const used = new Map()
for (const [id, p] of [...loginByBloomId]) { if (used.has(p.id)) loginByBloomId.delete(id); else used.set(p.id, id) }

log(`People in Bloom: ${bloomPeople.size}. Matched to a login: ${loginByBloomId.size}`)
for (const [id, name] of bloomPeople) log('  ', String(name).padEnd(34), loginByBloomId.has(id) ? `-> ${loginByBloomId.get(id).full_name}` : '(no login: kept as a contact)')

const ownerOf = a => {
  if (!a || a.id == null) return { owner_id: null, owner_name: null }
  const l = loginByBloomId.get(a.id)
  return l ? { owner_id: l.id, owner_name: null } : { owner_id: null, owner_name: a.fullName ?? null }
}
const notesOf = id => {
  const html = id ? data.notes?.[id] : null
  if (!html) return null
  const clean = sanitizeRich(html)
  return clean.replace(/<[^>]*>|&nbsp;|\s/g, '') ? clean : null
}

// ----------------------------------------------------------- unit and rule maps
const UNIT = { PERCENT: 'percent', NONE: 'number', YESNO: 'yesno', DOLLAR: 'dollars' }
// Bloom names its operators loosely: GREATER_THAN is shown as "≥" in the app.
const RULE = { GREATER_THAN: 'gte', GREATER_THAN_NOT_EQUAL: 'gt', LESS_THAN: 'lt', LESS_THAN_OR_EQUAL: 'lte', EQUAL_TO: 'eq' }
const GOAL = { ON_TRACK: 'on', OFF_TRACK: 'off', COMPLETED: 'done' }

function periodStart(freq, ts) {
  const d = new Date(Number(ts) * 1000)
  if (freq === 'MONTHLY') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
  // Bloom weeks are keyed on their Sunday; this app's weeks start on Monday.
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  return x.toISOString().slice(0, 10)
}
function periodsBetween(freq, a, b) {
  const out = []
  let d = new Date(periodStart(freq, a) + 'T00:00:00Z')
  const end = new Date(Number(b) * 1000)
  for (let i = 0; i < 80 && d <= end; i++) {
    out.push(d.toISOString().slice(0, 10))
    d = freq === 'MONTHLY' ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) : new Date(d.getTime() + 7 * 86400000)
  }
  return out
}

// ----------------------------------------------------------------- counts
const stats = {}
const count = (k, n = 1) => { stats[k] = (stats[k] ?? 0) + n }

if (dry) {
  for (const m of data.meetings) {
    count('issues archived not completed', m.issues.nodes.filter(i => i.archived && !i.completed).length)
    count('issues total', m.issues.nodes.length)
    count('goals archived', m.goals.nodes.filter(g => g.archived).length)
    count('kpis archived (skipped)', m.metrics.nodes.filter(k => k.archived).length)
    count('kpi dividers (skipped)', m.metrics.nodes.filter(k => k.metricType !== 'METRIC').length)
  }
  log(stats)
  process.exit(0)
}

// ------------------------------------------------------------------ contacts
const contactRows = [...bloomPeople].map(([id, name]) => ({ full_name: name, email: null, user_id: loginByBloomId.get(id)?.id ?? null, external_id: `bloom:user:${id}` }))
const contacts = await insertAll('mtg_contacts', contactRows, 'id, external_id')
const contactByBloomId = new Map(contacts.map(c => [Number(c.external_id.split(':')[2]), c.id]))

// ------------------------------------------------------------------ settings
const coreValues = data.businessPlan.tiles.nodes.find(t => t.tileType === 'CORE_VALUES')?.listCollections.nodes[0]?.listItems.nodes.map(i => i.text.trim()).filter(Boolean) ?? []
if (coreValues.length) await must(db.from('mtg_settings').update({ core_values: coreValues }).eq('id', 1), 'core values')

const tile = t => data.businessPlan.tiles.nodes.find(x => x.tileType === t)?.listCollections.nodes.map(c => c.listItems.nodes.map(i => i.text.trim()).filter(Boolean)) ?? []
const focus = tile('CORE_FOCUS')[0] ?? []
const strat = tile('STRATEGY')
const three = tile('VISION_THREE_YEAR'), one = tile('VISION_ONE_YEAR'), qtr = tile('VISION_QUARTERLY')
const plan = {
  what: focus[0] ?? '', how: focus[1] ?? '', why: focus[2] ?? '',
  five_year_vision: tile('BHAG')[0]?.[0] ?? '',
  marketing: { ideal_client: strat[0]?.[0] ?? '', differentiators: strat[1] ?? [], proven_process: strat[2]?.[0] ?? '', guarantee: strat[3]?.[0] ?? '' },
  three_year: { date: '', goals: three[0] ?? [], possibilities: three[1] ?? [] },
  one_year: { date: '', goals: one[0] ?? [], annual_goals: one[1] ?? [] },
  ninety_day: { date: '', goals: qtr[0] ?? [] },
}
await must(db.from('mtg_growth_plan').update({ content: plan, updated_by: david.id, updated_at: new Date().toISOString() }).eq('id', 1), 'growth plan')

// ------------------------------------------------------------------ org chart
const seatNodes = data.org.seats.nodes
const seatIndex = new Map(seatNodes.map((s, i) => [s.id, i]))
const childIds = new Set(seatNodes.flatMap(s => s.directReports.nodes.map(c => c.id)))
const seatRows = seatNodes.map(s => {
  const dept = s.departmentTitle?.trim() || null
  const title = s.position?.title?.trim() || dept || (s.users.nodes[0]?.fullName ?? 'Seat')
  return {
    title,
    subtitle: dept && dept !== title ? dept : null,
    roles: (s.position?.roles ?? []).map(r => r.name.trim()).filter(Boolean),
    position: seatIndex.get(s.id),
    external_id: `bloom:seat:${s.id}`,
  }
})
const seats = await insertAll('mtg_seats', seatRows, 'id, external_id')
const seatDb = new Map(seats.map(s => [Number(s.external_id.split(':')[2]), s.id]))
for (const s of seatNodes) {
  s.directReports.nodes.forEach((c, i) => { c._order = i })
}
for (const s of seatNodes) {
  for (const [i, c] of s.directReports.nodes.entries()) {
    await must(db.from('mtg_seats').update({ parent_id: seatDb.get(s.id), position: i }).eq('id', seatDb.get(c.id)), 'seat parent')
  }
}
let rootPos = 0
for (const s of seatNodes) if (!childIds.has(s.id)) await must(db.from('mtg_seats').update({ position: rootPos++ }).eq('id', seatDb.get(s.id)), 'root position')
const seatPeople = [], seatContacts = []
for (const s of seatNodes) for (const u of s.users.nodes) {
  const login = loginByBloomId.get(u.id)
  if (login) seatPeople.push({ seat_id: seatDb.get(s.id), user_id: login.id })
  else seatContacts.push({ seat_id: seatDb.get(s.id), contact_id: contactByBloomId.get(u.id) })
}
await insertAll('mtg_seat_people', seatPeople)
await insertAll('mtg_seat_contacts', seatContacts)
log(`Org chart: ${seats.length} seats, ${seatPeople.length} seated logins, ${seatContacts.length} seated contacts`)

// ------------------------------------------------------------------ meetings
const settings = await must(db.from('mtg_settings').select('default_agenda').eq('id', 1).maybeSingle(), 'settings')
const agenda = Array.isArray(settings?.default_agenda) ? settings.default_agenda : []
const totals = { meetings: 0, headlines: 0, todos: 0, issues: 0, goals: 0, kpis: 0, values: 0, customGoals: 0, runs: 0 }

for (const m of data.meetings) {
  const [meeting] = await insertAll('mtg_meetings', [{
    name: m.name, leader_id: david.id, created_by: david.id, external_id: `bloom:meeting:${m.id}`,
  }], 'id')
  const mid = meeting.id
  totals.meetings++
  await insertAll('mtg_agenda_items', agenda.map((a, i) => ({ meeting_id: mid, page_type: a.page_type, title: a.title, minutes: a.minutes, position: i })))

  const attLogins = new Set([david.id]), attContacts = []
  for (const a of m.attendees.nodes) {
    const l = loginByBloomId.get(a.id)
    if (l) attLogins.add(l.id); else attContacts.push({ meeting_id: mid, contact_id: contactByBloomId.get(a.id) })
  }
  await insertAll('mtg_attendees', [...attLogins].map(user_id => ({ meeting_id: mid, user_id })))
  await insertAll('mtg_meeting_contacts', attContacts)

  // Headlines
  await insertAll('mtg_headlines', m.headlines.nodes.map(h => ({
    meeting_id: mid, title: h.title, ...ownerOf(h.assignee), details: notesOf(h.notesId),
    created_at: iso(h.dateCreated), archived_at: h.archived ? iso(h.archivedTimestamp ?? h.dateCreated) : null, external_id: `bloom:headline:${h.id}`,
  })))
  totals.headlines += m.headlines.nodes.length

  // To-dos
  await insertAll('mtg_todos', m.todos.nodes.map(t => ({
    meeting_id: mid, title: t.title, ...ownerOf(t.assignee), details: notesOf(t.notesId),
    due_date: ymd(t.dueDate), done_at: t.completed ? iso(t.completedTimestamp ?? t.dateCreated) : null,
    status: t.completed ? 'done' : 'todo', archived_at: t.archived ? iso(t.completedTimestamp ?? t.dateCreated) : null,
    created_by: david.id, created_at: iso(t.dateCreated), external_id: `bloom:todo:${t.id}`,
  })))
  totals.todos += m.todos.nodes.length

  // Issues
  const issueRows = []
  for (const i of m.issues.nodes) {
    if (i.archived && !i.completed) count('issues skipped (archived, never solved)')
    if (i.archived && !i.completed) continue
    const status = i.completed ? 'solved' : i.sentToIssueMeetingName ? 'sent' : i.addToDepartmentPlan ? 'parking_lot' : 'short_term'
    issueRows.push({
      meeting_id: mid, title: i.title, ...ownerOf(i.assignee), details: notesOf(i.notesId), status,
      solved_at: i.completed ? iso(i.completedTimestamp ?? i.dateCreated) : null,
      created_by: david.id, created_at: iso(i.dateCreated), external_id: `bloom:issue:${i.id}`,
    })
  }
  await insertAll('mtg_issues', issueRows)
  totals.issues += issueRows.length

  // Quarterly priorities
  await insertAll('mtg_goals', m.goals.nodes.map(g => ({
    meeting_id: mid, title: g.title, ...ownerOf(g.assignee), details: notesOf(g.notesId),
    status: GOAL[g.status] ?? 'on', due_date: ymd(g.dueDate),
    milestones: (g.milestones?.nodes ?? []).map(x => ({ title: x.title, done: !!x.completed, done_at: null })),
    completed_at: g.status === 'COMPLETED' ? iso(g.dateLastModified ?? g.dateCreated) : null,
    created_at: iso(g.dateCreated), external_id: `bloom:goal:${g.id}`,
  })))
  totals.goals += m.goals.nodes.length

  // KPIs and their whole history
  for (const k of m.metrics.nodes) {
    if (k.archived || k.metricType !== 'METRIC') { count(k.archived ? 'kpis archived (skipped)' : 'kpi dividers (skipped)'); continue }
    const cadence = k.frequency === 'MONTHLY' ? 'monthly' : 'weekly'
    const [kpi] = await insertAll('mtg_kpis', [{
      meeting_id: mid, name: k.title, ...ownerOf(k.assignee), cadence, unit_type: UNIT[k.units] ?? 'number',
      goal_rule: RULE[k.rule] ?? 'gte', goal_value: num(k.singleGoalValue), goal_value_max: null,
      position: k.indexInTable ?? 0, details: notesOf(k.notesId), external_id: `bloom:kpi:${k.id}`,
    }], 'id')
    await insertAll('mtg_kpi_meetings', [{ kpi_id: kpi.id, meeting_id: mid }])
    const byPeriod = new Map()
    for (const s of k.scores) { const v = num(s.value); if (v != null) byPeriod.set(periodStart(k.frequency, s.timestamp), v) }
    await insertAll('mtg_kpi_values', [...byPeriod].map(([period_start, value]) => ({ kpi_id: kpi.id, period_start, value })))
    totals.kpis++; totals.values += byPeriod.size
    const custom = new Map()
    for (const c of k.customGoals?.nodes ?? []) for (const p of periodsBetween(k.frequency, c.startDate, c.endDate ?? c.startDate)) {
      custom.set(p, { kpi_id: kpi.id, period_start: p, goal_rule: RULE[c.rule] ?? RULE[k.rule] ?? 'gte', goal_value: num(c.singleGoalValue), goal_value_max: null })
    }
    await insertAll('mtg_kpi_goals', [...custom.values()])
    totals.customGoals += custom.size
  }

  // Past meetings: one concluded run + summary each
  for (const inst of m.instances) {
    const started = iso(inst.meetingStartTime ?? inst.dateCreated)
    const ended = iso(inst.meetingConcludedTime ?? inst.meetingStartTime ?? inst.dateCreated)
    const [run] = await insertAll('mtg_runs', [{
      meeting_id: mid, leader_id: david.id, started_at: started, ended_at: ended, current_page: 'WRAP_UP',
      page_seconds: {}, notes: '', ratings_revealed: true, attendance: {}, external_id: `bloom:instance:${inst.id}`,
    }], 'id')
    const att = inst.attendeeInstances.nodes
    const noteText = att.filter(a => a.notesText).map(a => `${a.attendee?.fullName ?? ''}: ${a.notesText}`).join('\n')
    await insertAll('mtg_summaries', [{
      run_id: run.id, meeting_id: mid, average_rating: inst.averageMeetingRating, created_at: ended,
      snapshot: {
        run_id: run.id, started_at: started, ended_at: ended, notes: noteText || inst.selectedNotes || '',
        attendance: att.map(a => ({ user_id: loginByBloomId.get(a.attendee?.id)?.id ?? `bloom:${a.attendee?.id}`, name: a.attendee?.fullName ?? null, present: true })),
        ratings: att.filter(a => a.rating != null).map(a => ({ user_id: loginByBloomId.get(a.attendee?.id)?.id ?? `bloom:${a.attendee?.id}`, name: a.attendee?.fullName ?? null, rating: a.rating, feedback: null })),
        kpis: [], goals: [], headlines: [], todos_created: [], todos_completed: [], todos_open: [], issues_solved: [], issues_open: [], page_seconds: {},
        counts: { issues_solved: inst.issuesSolvedCount ?? 0, todos_completed_pct: inst.todosCompletedPercentage ?? null, duration_seconds: inst.meetingDurationInSeconds ?? null },
        imported_from: 'bloom',
      },
    }])
    totals.runs++
  }
  log(`  ${m.name}: ${m.todos.nodes.length} to-dos, ${issueRows.length} issues, ${m.headlines.nodes.length} headlines, ${m.goals.nodes.length} priorities, ${m.metrics.nodes.filter(k => !k.archived && k.metricType === 'METRIC').length} KPIs, ${m.instances.length} past meetings`)
}
log('Totals:', totals)
log('Skipped / notes:', stats)
