// ARCHIVED, DOES NOT RUN ANYMORE: this one-off migration synced
// migration_data.json (produced by plant-management-system's
// scripts/extract-for-mould-module.mjs) into Supabase mould_projects /
// mould_workers -- two sync-snapshot tables the mould module used before
// the full PlantPro merge. The v40 migration
// (supabase_migration_v40_mould_plantpro_repoint.sql) repointed
// mould_assets/mould_jobs/mould_time_entries onto the real
// plantpro_projects/plantpro_workers tables and DROPPED mould_projects/
// mould_workers, so running this script now would fail (tables no longer
// exist). Kept purely as a historical record of how that data first got
// into Supabase.
//
// Needs (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))))

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

const data = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'archive', 'mould-migration', 'migration_data.json'), 'utf8'))

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
