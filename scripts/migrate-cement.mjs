// One-off migration: cement-app/weighbridge.db (SQLite) -> Supabase cement_* tables.
//
// Run with:  node --experimental-sqlite scripts/migrate-cement.mjs
//
// Idempotent: every insert is an upsert on the original SQLite id, so re-running
// after fixing something just overwrites the same rows rather than duplicating.
//
// Needs (from .env.local, loaded manually below since this isn't a Next.js runtime):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY

import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

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

const db = new DatabaseSync(path.join(ROOT, 'cement-app', 'weighbridge.db'), { readOnly: true })
// SQLite is loosely typed — numeric columns can hold '' instead of NULL.
// Postgres numeric/date columns reject '' outright, so blank it out to null.
function clean(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) out[k] = v === '' ? null : v
  return out
}
const all = (sql) => db.prepare(sql).all().map(clean)
const bool = (v) => v === 1 || v === true

async function upsert(table, rows, { onConflict = 'id' } = {}) {
  if (rows.length === 0) return { table, count: 0 }
  const { error } = await sb.from(table).upsert(rows, { onConflict })
  if (error) throw new Error(`${table}: ${error.message}`)
  return { table, count: rows.length }
}

const summary = []

// 1. Lookup tables (no FKs)
summary.push(await upsert('cement_units', all('SELECT id, name FROM unit')))
summary.push(await upsert('cement_plants', all('SELECT id, name, is_active FROM plant').map(r => ({ ...r, is_active: bool(r.is_active) }))))
summary.push(await upsert('cement_suppliers', all('SELECT id, name, is_active FROM supplier').map(r => ({ ...r, is_active: bool(r.is_active) }))))

// 2. materials (-> units)
summary.push(await upsert('cement_materials', all('SELECT id, name, unit_id, is_active, batching_req FROM material').map(r => ({ ...r, is_active: bool(r.is_active) }))))

// 3. silos (-> plants)
summary.push(await upsert('cement_silos', all('SELECT id, plant_id, name, capacity, current_stock, is_active, display_order, bg_color FROM silo').map(r => ({ ...r, is_active: bool(r.is_active) }))))

// 4. silo <-> material assignment + history
summary.push(await upsert('cement_silo_materials', all('SELECT id, silo_id, material_id FROM silo_material')))
summary.push(await upsert('cement_silo_material_history', all('SELECT id, silo_id, material_id, effective_from, effective_to FROM silo_material_history')))

// 5. weighbridge transactions (-> plants, silos, materials)
summary.push(await upsert('cement_weight_in', all(`
  SELECT id, supplier, date AS weigh_date, do_number, lorry_no, trailer_no, material, discharge_to, seal_no,
         file1 AS file1_path, file2 AS file2_path, do_weight, weight_in, weight_out, difference, difference_pct,
         created_at, unload_start_time, unload_complete_time, target_weight_out, weight_out_operator, weight_out_time,
         plant_id, silo_id, material_id
  FROM weight_in
`)))

// 6. daily stock take / usage (-> silos)
summary.push(await upsert('cement_daily_stock_take', all('SELECT id, date AS take_date, silo_id, actual_stock, operator FROM daily_stock_take')))
summary.push(await upsert('cement_daily_usage', all('SELECT id, date AS usage_date, silo_id, usage, operator FROM daily_usage')))

// 7. transfers (-> silos, materials)
summary.push(await upsert('cement_transfers', all('SELECT id, date AS transfer_date, from_silo_id, to_silo_id, material_id, quantity, remarks, operator, created_at FROM transfer')))

// 8. alerts
const alertSettings = all('SELECT manager_email, variance_threshold_pct FROM alert_settings WHERE id = 1')[0]
if (alertSettings) {
  const { error } = await sb.from('cement_alert_settings').update(alertSettings).eq('id', 1)
  if (error) throw new Error(`cement_alert_settings: ${error.message}`)
  summary.push({ table: 'cement_alert_settings', count: 1 })
}
summary.push(await upsert('cement_alert_log', all('SELECT id, alert_date, plant_name, material_name, variance_pct, created_at FROM alert_log')))

console.log('\nMigrated:')
for (const s of summary) console.log(`  ${s.table.padEnd(28)} ${s.count}`)

// Files referenced by weight_in.file1_path/file2_path are NOT copied — cement-app/uploads/
// is empty in this checkout, so there are no actual image files to move into Storage.
const fileCount = all("SELECT COUNT(*) AS c FROM weight_in WHERE file1 IS NOT NULL OR file2 IS NOT NULL")[0].c
if (fileCount > 0) {
  console.log(`\n⚠ ${fileCount} weight_in rows reference DO/weighbridge photos that were not migrated`)
  console.log('  (cement-app/uploads/ is empty in this checkout). Filenames are preserved on the row.')
}

console.log('\nDone. Next: reset the identity sequences (see scripts/reset-cement-sequences.sql) so new')
console.log('rows created from the app don\'t collide with these migrated ids.')

db.close()
