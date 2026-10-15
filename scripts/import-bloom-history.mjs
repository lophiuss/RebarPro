// Second pass of the Bloom import: archived headlines, long-term / solved issues, and the
// full content of every past-meeting summary (what was created, completed, solved and
// discussed around that meeting, reconstructed from the items' own timestamps).
//   node --env-file=.env.local scripts/import-bloom-history.mjs <bloom-export.json> <bloom-extra.json> [--dry]
// Safe to re-run: rows already imported (by external_id) are skipped, snapshots are rebuilt.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { sanitizeRich } from '../src/lib/richtext.ts'

const [mainFile, extraFile] = process.argv.slice(2)
const dry = process.argv.includes('--dry')
if (!mainFile || !extraFile) throw new Error('usage: import-bloom-history.mjs <bloom-export.json> <bloom-extra.json> [--dry]')
const main = JSON.parse(readFileSync(mainFile, 'utf8'))
const extra = JSON.parse(readFileSync(extraFile, 'utf8'))
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const must = async (p, what) => { const { data, error } = await p; if (error) throw new Error(`${what}: ${error.message}`); return data }
const iso = s => (s == null ? null : new Date(Number(s) * 1000).toISOString())
const ymd = s => (s == null ? null : new Date(Number(s) * 1000).toISOString().slice(0, 10))
const num = v => (v === '' || v == null ? null : Number(v))
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
async function insertAll(table, rows) { for (const c of chunk(rows, 400)) await must(db.from(table).insert(c), `insert ${table}`) }
async function selectAll(table, cols) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const d = await must(db.from(table).select(cols).range(from, from + 999), `select ${table}`)
    out.push(...d)
    if (d.length < 1000) break
  }
  return out
}

// ----------------------------------------------------------- people and ids
const contacts = await must(db.from('mtg_contacts').select('external_id, full_name, user_id'), 'contacts')
const personByBloomId = new Map(contacts.map(c => [Number(c.external_id.split(':')[2]), c]))
const ownerOf = a => {
  if (!a || a.id == null) return { owner_id: null, owner_name: null }
  const c = personByBloomId.get(a.id)
  if (c?.user_id) return { owner_id: c.user_id, owner_name: null }
  return { owner_id: null, owner_name: c?.full_name ?? a.fullName ?? null }
}
const meetings = await must(db.from('mtg_meetings').select('id, external_id'), 'meetings')
const meetingDb = new Map(meetings.map(m => [Number(m.external_id.split(':')[2]), m.id]))
const notesOf = (id, html) => {
  const h = html ?? (id ? (main.notes?.[id] ?? extra.notes?.[id]) : null)
  if (!h) return null
  const clean = sanitizeRich(h)
  return clean.replace(/<[^>]*>|&nbsp;|\s/g, '') ? clean : null
}

// -------------------------------------------------------------- new rows
const haveHeadlines = new Set((await selectAll('mtg_headlines', 'external_id')).map(r => r.external_id))
const haveIssues = new Set((await selectAll('mtg_issues', 'external_id')).map(r => r.external_id))
const headlineRows = [], issueRows = []
for (const [bid, m] of Object.entries(extra.meetings)) {
  const mid = meetingDb.get(Number(bid))
  if (!mid) continue
  for (const h of m.archivedHeadlines.nodes) {
    const ext = `bloom:headline:${h.id}`
    if (haveHeadlines.has(ext)) continue
    haveHeadlines.add(ext)
    headlineRows.push({ meeting_id: mid, title: h.title, ...ownerOf(h.assignee), details: notesOf(null, h.notesHtml), created_at: iso(h.dateCreated), archived_at: iso(h.archivedTimestamp ?? h.dateCreated), external_id: ext })
  }
  for (const [kind, list] of [['longTerm', m.longTermIssues.nodes], ['solved', m.solved.nodes], ['sent', m.sent.nodes]]) {
    for (const i of list) {
      const ext = `bloom:issue:${i.id}`
      if (haveIssues.has(ext)) continue
      haveIssues.add(ext)
      const status = i.completed ? 'solved' : i.sentToIssueMeetingName ? 'sent' : kind === 'longTerm' || i.addToDepartmentPlan ? 'parking_lot' : 'short_term'
      issueRows.push({
        meeting_id: mid, title: i.title, ...ownerOf(i.assignee), details: notesOf(i.notesId), status,
        solved_at: i.completed ? iso(i.completedTimestamp ?? i.dateCreated) : null, created_by: null,
        created_at: iso(i.dateCreated), external_id: ext,
      })
    }
  }
}
console.log(`New archived headlines: ${headlineRows.length}; new issues: ${issueRows.length}`)
if (!dry) { await insertAll('mtg_headlines', headlineRows); await insertAll('mtg_issues', issueRows) }

// ------------------------------------------------- past-meeting summaries
const UNIT = { PERCENT: 'percent', NONE: 'number', YESNO: 'yesno', DOLLAR: 'dollars' }
const RULE = { GREATER_THAN: 'gte', GREATER_THAN_NOT_EQUAL: 'gt', LESS_THAN: 'lt', LESS_THAN_OR_EQUAL: 'lte', EQUAL_TO: 'eq' }
function periodStart(freq, ts) {
  const d = new Date(Number(ts) * 1000)
  if (freq === 'MONTHLY') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString().slice(0, 10)
}
const slim = (o, extraFields = {}) => ({ id: o.id, title: o.title, details: o.details ?? null, owner_id: o.owner_id, owner_name: o.owner_name, ...extraFields })

const runs = await must(db.from('mtg_runs').select('id, external_id'), 'runs')
const runDb = new Map(runs.map(r => [r.external_id, r.id]))
const summaries = await selectAll('mtg_summaries', 'id, run_id, snapshot')
const summaryByRun = new Map(summaries.map(s => [s.run_id, s]))
const allIssuesBy = new Map()   // bloom meeting id -> merged issue list
const allHeadlinesBy = new Map()
for (const m of main.meetings) {
  const e = extra.meetings[m.id]
  const issues = new Map(m.issues.nodes.map(i => [i.id, i]))
  for (const i of [...(e?.longTermIssues.nodes ?? []), ...(e?.solved.nodes ?? []), ...(e?.sent.nodes ?? [])]) issues.set(i.id, i)
  allIssuesBy.set(m.id, [...issues.values()])
  const hl = new Map(m.headlines.nodes.map(h => [h.id, h]))
  for (const h of e?.archivedHeadlines.nodes ?? []) hl.set(h.id, { ...h, notesId: null })
  allHeadlinesBy.set(m.id, [...hl.values()])
}

let updated = 0
const sizes = []
for (const m of main.meetings) {
  const insts = m.instances.filter(i => i.meetingConcludedTime || i.meetingStartTime).sort((a, b) => (a.meetingConcludedTime ?? a.meetingStartTime) - (b.meetingConcludedTime ?? b.meetingStartTime))
  const kpiDefs = m.metrics.nodes.filter(k => !k.archived && k.metricType === 'METRIC')
  let prevEnd = 0
  for (const inst of insts) {
    const end = Number(inst.meetingConcludedTime ?? inst.meetingStartTime)
    const inWin = t => t != null && Number(t) > prevEnd && Number(t) <= end
    const todos = m.todos.nodes
    const created = todos.filter(t => inWin(t.dateCreated))
    const completed = todos.filter(t => t.completed && inWin(t.completedTimestamp))
    const open = todos.filter(t => Number(t.dateCreated) <= end && !(t.completed && Number(t.completedTimestamp) <= end) && !(t.archived && !t.completed))
    const issues = allIssuesBy.get(m.id)
    const solved = issues.filter(i => i.completed && inWin(i.completedTimestamp))
    const openIssues = issues.filter(i => Number(i.dateCreated) <= end && !(i.completed && Number(i.completedTimestamp) <= end) && !i.sentToIssueMeetingName)
    const headlines = allHeadlinesBy.get(m.id).filter(h => (h.archivedTimestamp != null && Number(h.archivedTimestamp) > prevEnd && Number(h.archivedTimestamp) <= end + 900) || (h.archivedTimestamp == null && Number(h.dateCreated) <= end && Number(h.dateCreated) > prevEnd))
    const toRow = t => { const o = ownerOf(t.assignee); return slim({ id: String(t.id), title: t.title, details: notesOf(t.notesId), ...o }, { due_date: ymd(t.dueDate), status: t.completed ? 'done' : 'todo' }) }
    const issueRow = i => { const o = ownerOf(i.assignee); return slim({ id: String(i.id), title: i.title, details: notesOf(i.notesId), ...o }, { status: i.completed ? 'solved' : i.addToDepartmentPlan ? 'parking_lot' : 'short_term' }) }
    const kpis = kpiDefs.map(k => {
      const byPeriod = new Map()
      for (const s of k.scores) { const v = num(s.value); if (v != null && Number(s.timestamp) <= end) byPeriod.set(periodStart(k.frequency, s.timestamp), v) }
      const values = [...byPeriod].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5).map(([period_start, value]) => ({ period_start, value }))
      return { id: String(k.id), name: k.title, cadence: k.frequency === 'MONTHLY' ? 'monthly' : 'weekly', unit_type: UNIT[k.units] ?? 'number', goal_rule: RULE[k.rule] ?? 'gte', goal_value: num(k.singleGoalValue), goal_value_max: null, ...ownerOf(k.assignee), values }
    }).filter(k => k.values.length)

    const runId = runDb.get(`bloom:instance:${inst.id}`)
    const s = runId ? summaryByRun.get(runId) : null
    if (s) {
      const snapshot = {
        ...s.snapshot,
        headlines: headlines.map(h => { const o = ownerOf(h.assignee); return slim({ id: String(h.id), title: h.title, details: notesOf(h.notesId, h.notesHtml), ...o }) }),
        todos_created: created.map(toRow), todos_completed: completed.map(toRow), todos_open: open.map(toRow),
        issues_solved: solved.map(issueRow), issues_open: openIssues.map(issueRow), kpis,
      }
      sizes.push(JSON.stringify(snapshot).length)
      if (!dry) await must(db.from('mtg_summaries').update({ snapshot }).eq('id', s.id), 'update summary')
      updated++
    }
    prevEnd = end
  }
}
console.log(`Past-meeting summaries rebuilt: ${updated}; average size ${Math.round(sizes.reduce((a, b) => a + b, 0) / Math.max(1, sizes.length) / 1024)} KB, largest ${Math.round(Math.max(...sizes) / 1024)} KB`)
