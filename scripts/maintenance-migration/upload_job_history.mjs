// One-off: uploads job_history_data.json (built by build_job_history.py
// from the user's Google Sheet) into maintenance_work_requests, so it
// shows up in the new Job History page.
//
// Run with: node scripts/maintenance-migration/upload_job_history.mjs

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

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log(`Inserting ${rows.length} historical job rows...`)
  let inserted = 0
  for (const batch of chunk(rows, 500)) {
    const { error } = await sb.from('maintenance_work_requests').insert(batch)
    if (error) throw new Error(`insert failed at row ~${inserted}: ${error.message}`)
    inserted += batch.length
    console.log(`  ${inserted}/${rows.length}`)
  }
  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
