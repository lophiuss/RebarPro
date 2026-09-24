// One-off migration: migration_data.json (produced by
// plant-management-system's scripts/extract-for-mould-module.mjs) ->
// Supabase mould_projects / mould_workers tables.
//
// Run with:  node scripts/mould-migration/upload.mjs
//
// Idempotent: both tables are upserted on source_pms_id (unique). Safe to
// re-run after PMS data changes -- existing rows are updated in place, never
// duplicated. This only ever touches mould_projects / mould_workers; nothing
// else in the mould schema depends on rerunning it.
//
// Needs (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

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
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local')
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const data = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'mould-migration', 'migration_data.json'), 'utf8'))

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  console.log(`Upserting ${data.projects.length} project rows...`)
  for (const batch of chunk(data.projects, 200)) {
    const { error } = await sb.from('mould_projects').upsert(batch, { onConflict: 'source_pms_id' })
    if (error) throw new Error(`mould_projects upsert failed: ${error.message}`)
  }

  console.log(`Upserting ${data.workers.length} worker rows...`)
  for (const batch of chunk(data.workers, 200)) {
    const { error } = await sb.from('mould_workers').upsert(batch, { onConflict: 'source_pms_id' })
    if (error) throw new Error(`mould_workers upsert failed: ${error.message}`)
  }

  console.log('\nDone.')
  console.log(`  mould_projects: ${data.projects.length} upserted`)
  console.log(`  mould_workers: ${data.workers.length} upserted`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
