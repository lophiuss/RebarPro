// One-off migration: migration_data.json (produced by extract.py from the
// user's ASSET OWNERSHIP.xlsx / INVENTORY.xlsx / 2026 PM SCHEDULE.xlsx) ->
// Supabase maintenance_equipment / maintenance_inspections /
// maintenance_pm_schedule tables.
//
// Run with:  node scripts/maintenance-migration/upload.mjs
//
// Idempotent: equipment is upserted on equip_code (unique). Inspections and
// pm_schedule are inserted fresh each run — re-running without first
// deleting them would duplicate those two, so this script deletes and
// re-inserts them in one pass (equipment rows are never deleted).
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

const data = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'maintenance-migration', 'migration_data.json'), 'utf8'))

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function main() {
  // --- 1. Equipment (upsert on equip_code) ---
  console.log(`Upserting ${data.equipment.length} equipment rows...`)
  for (const batch of chunk(data.equipment, 200)) {
    const { error } = await sb.from('maintenance_equipment').upsert(batch, { onConflict: 'equip_code' })
    if (error) throw new Error(`equipment upsert failed: ${error.message}`)
  }

  // Build equip_code -> id map for the two child tables.
  const { data: allEquip, error: fetchErr } = await sb.from('maintenance_equipment').select('id, equip_code')
  if (fetchErr) throw fetchErr
  const idByCode = new Map(allEquip.map(e => [e.equip_code, e.id]))

  // --- 2. Inspections (delete-then-insert, keyed indirectly via equipment_id) ---
  const inspectionRows = data.inspections
    .map(r => ({ ...r, equipment_id: idByCode.get(r.equip_code) }))
    .filter(r => r.equipment_id)
    .map(({ equip_code, ...rest }) => rest)

  const equipIdsWithInspections = [...new Set(inspectionRows.map(r => r.equipment_id))]
  console.log(`Clearing old maintenance_inspections for ${equipIdsWithInspections.length} equipment...`)
  for (const batch of chunk(equipIdsWithInspections, 200)) {
    const { error } = await sb.from('maintenance_inspections').delete().in('equipment_id', batch)
    if (error) throw new Error(`inspections delete failed: ${error.message}`)
  }
  console.log(`Inserting ${inspectionRows.length} inspection rows...`)
  for (const batch of chunk(inspectionRows, 200)) {
    const { error } = await sb.from('maintenance_inspections').insert(batch)
    if (error) throw new Error(`inspections insert failed: ${error.message}`)
  }

  // --- 3. PM schedule (delete-then-insert for year=2026) ---
  const pmRows = data.pm_schedule
    .map(r => ({ ...r, equipment_id: idByCode.get(r.equip_code) }))
    .filter(r => r.equipment_id)
    .map(({ equip_code, ...rest }) => rest)

  console.log('Clearing old maintenance_pm_schedule rows for year=2026...')
  const { error: delPmErr } = await sb.from('maintenance_pm_schedule').delete().eq('year', 2026)
  if (delPmErr) throw new Error(`pm_schedule delete failed: ${delPmErr.message}`)
  console.log(`Inserting ${pmRows.length} pm_schedule rows...`)
  for (const batch of chunk(pmRows, 500)) {
    const { error } = await sb.from('maintenance_pm_schedule').insert(batch)
    if (error) throw new Error(`pm_schedule insert failed: ${error.message}`)
  }

  console.log('\nDone.')
  console.log(`  equipment: ${data.equipment.length} upserted`)
  console.log(`  inspections: ${inspectionRows.length} inserted`)
  console.log(`  pm_schedule: ${pmRows.length} inserted`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
