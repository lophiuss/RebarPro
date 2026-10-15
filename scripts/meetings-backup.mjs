// Dumps every mtg_* table to a JSON file (a safety copy before clearing Meetings data).
//   node --env-file=.env.local scripts/meetings-backup.mjs <output.json>
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) throw new Error('usage: meetings-backup.mjs <output.json>')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const tables = [
  'mtg_agenda_items', 'mtg_attendees', 'mtg_contacts', 'mtg_documents', 'mtg_goals', 'mtg_growth_plan', 'mtg_gwc_criteria',
  'mtg_headlines', 'mtg_issues', 'mtg_kpi_goals', 'mtg_kpi_meetings', 'mtg_kpi_values', 'mtg_kpis', 'mtg_meeting_contacts',
  'mtg_meetings', 'mtg_one_on_ones', 'mtg_prep_docs', 'mtg_prep_responses', 'mtg_prep_sessions', 'mtg_private_notes',
  'mtg_ratings', 'mtg_rprs', 'mtg_runs', 'mtg_seat_contacts', 'mtg_seat_people', 'mtg_seats', 'mtg_settings', 'mtg_summaries',
  'mtg_todos', 'mtg_user_prefs', 'mtg_whiteboards',
]
const dump = { takenAt: new Date().toISOString() }
for (const t of tables) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(t).select('*').range(from, from + 999)
    if (error) throw new Error(`${t}: ${error.message}`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  dump[t] = rows
  console.log(t.padEnd(24), rows.length)
}
writeFileSync(out, JSON.stringify(dump))
console.log('saved', out)
