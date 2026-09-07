// One-off: back-fills resolution_photo_drive_id on the already-imported
// historical maintenance_work_requests rows (see upload_job_history.mjs).
// Those rows were inserted without a photo the first time; this matches
// each job_history_data.json row back to its DB row via the combination of
// requester_name + issue_description + created_at (effectively unique —
// issue_description is full free text, created_at is a specific
// timestamp) and updates only resolution_photo_drive_id, never touching
// anything else. Skips (and reports) any row whose key doesn't resolve to
// exactly one DB row, rather than guessing.
//
// Confirmed safe to link directly: the Drive file ids in the sheet's
// Evidence column are owned by this app's own Google Drive account
// (davidthen4285@gmail.com, the same account GOOGLE_REFRESH_TOKEN
// authenticates as — see test_drive_access.mjs), so no re-upload/copy is
// needed; /api/maintenance/file/[fileId] can already serve them.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
function loadEnv(file) {
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const env = loadEnv(path.join(ROOT, '.env.local'))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const rows = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'maintenance-migration', 'job_history_data.json'), 'utf8'))
const withPhoto = rows.filter(r => r.resolution_photo_drive_id)
console.log(`${withPhoto.length} rows have a photo to link`)

let linked = 0, notFound = 0, ambiguous = 0, alreadySet = 0

for (const row of withPhoto) {
  const { data, error } = await sb
    .from('maintenance_work_requests')
    .select('id, resolution_photo_drive_id')
    .eq('requester_name', row.requester_name)
    .eq('issue_description', row.issue_description)
    .eq('created_at', row.created_at)
  if (error) { console.error('query error:', error.message); continue }

  if (!data || data.length === 0) { notFound++; continue }
  if (data.length > 1) { ambiguous++; continue }

  const target = data[0]
  if (target.resolution_photo_drive_id) { alreadySet++; continue }

  const { error: upErr } = await sb.from('maintenance_work_requests')
    .update({ resolution_photo_drive_id: row.resolution_photo_drive_id })
    .eq('id', target.id)
  if (upErr) { console.error('update error:', upErr.message); continue }
  linked++
  if (linked % 500 === 0) console.log(`  linked ${linked}...`)
}

console.log(`\nDone. linked=${linked} alreadySet=${alreadySet} notFound=${notFound} ambiguous=${ambiguous}`)
