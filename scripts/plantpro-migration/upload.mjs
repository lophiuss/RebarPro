// One-off migration: migration_data.json (produced by
// plant-management-system's scripts/extract-for-plantpro-merge.mjs) ->
// all 27 plantpro_* Supabase tables. See supabase_migration_v39_
// plantpro_department.sql for schema and the PFMMS plan doc for the full
// design.
//
// Run with:  node scripts/plantpro-migration/upload.mjs
//
// This is a ONE-TIME real data migration (unlike mould-migration/upload.mjs,
// which re-syncs an ongoing snapshot) — safe to re-run (every insert is
// upsert-on-natural-key or source_pms_id), but it is not meant to be run
// repeatedly against a changing PMS database once this merge is done.
//
// New Postgres ids differ from the old SQLite ids, so every level builds an
// id-remap Map<source_pms_id, new_id> from what it just wrote, and child
// levels use those maps to translate their FK columns before inserting.
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

const data = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'plantpro-migration', 'migration_data.json'), 'utf8'))

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Upserts `rows` into `table` keyed on `onConflict`, then returns a
// Map<source_pms_id, new_id> by reading the table back — used to translate
// this level's ids for whatever child table references it next.
async function upsertAndMap(table, rows, onConflict = 'source_pms_id') {
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows, skipping`)
    return new Map()
  }
  for (const batch of chunk(rows, 200)) {
    const { error } = onConflict
      ? await sb.from(table).upsert(batch, { onConflict })
      : await sb.from(table).insert(batch) // no natural unique key to upsert on (real data has 0 rows here anyway)
    if (error) throw new Error(`${table} upsert failed: ${error.message}`)
  }
  console.log(`  ${table}: ${rows.length} rows upserted`)

  if (onConflict !== 'source_pms_id') return new Map() // pure join table, no map needed
  const { data: written, error: fetchErr } = await sb.from(table).select('id, source_pms_id').not('source_pms_id', 'is', null)
  if (fetchErr) throw fetchErr
  return new Map(written.map(r => [r.source_pms_id, r.id]))
}

async function main() {
  console.log('Level 1: independent lookups')
  const projectTypeMap = await upsertAndMap('plantpro_project_types', data.project_types)
  const supervisorMap = await upsertAndMap('plantpro_supervisors', data.supervisors)
  const payColumnMap = await upsertAndMap('plantpro_pay_columns', data.pay_columns)
  const documentTypeMap = await upsertAndMap('plantpro_document_types', data.document_types)
  const hostelItemTypeMap = await upsertAndMap('plantpro_hostel_bill_item_types', data.hostel_bill_item_types)

  await upsertAndMap(
    'plantpro_pay_column_bases',
    data.pay_column_bases.map(r => ({
      column_id: payColumnMap.get(r.source_column_id),
      base_column_id: payColumnMap.get(r.source_base_column_id),
    })).filter(r => r.column_id && r.base_column_id),
    'column_id,base_column_id',
  )

  if (data.timesheet_multiplier) {
    const m = data.timesheet_multiplier
    const { error } = await sb.from('plantpro_timesheet_multiplier').update({
      normal_ot: m.normal_ot, sunday_basic: m.sunday_basic, sunday_ot: m.sunday_ot,
      holiday_basic: m.holiday_basic, holiday_ot: m.holiday_ot,
    }).eq('id', 1)
    if (error) throw error
    console.log('  plantpro_timesheet_multiplier: updated singleton')
  }

  const holidayMap = await upsertAndMap('plantpro_holidays', data.holidays)
  const hostelMap = await upsertAndMap('plantpro_hostels', data.hostels)

  if (data.app_settings.hrColumnsOrder || data.app_settings.currentSupervisor) {
    const { error } = await sb.from('plantpro_settings').update({
      hr_columns_order: data.app_settings.hrColumnsOrder ? JSON.parse(data.app_settings.hrColumnsOrder) : null,
      current_supervisor_id: data.app_settings.currentSupervisor
        ? supervisorMap.get(Number(data.app_settings.currentSupervisor)) ?? null
        : null,
    }).eq('id', 1)
    if (error) throw error
    console.log('  plantpro_settings: updated singleton')
  }

  console.log('\nLevel 2: projects')
  const projectMap = await upsertAndMap('plantpro_projects', data.projects.map(r => ({
    source_pms_id: r.source_pms_id, name: r.name,
    type_id: r.source_type_id ? projectTypeMap.get(r.source_type_id) ?? null : null,
    status: r.status, archived: r.archived,
  })))

  console.log('\nLevel 3: workers')
  const workerMap = await upsertAndMap('plantpro_workers', data.workers.map(r => ({
    source_pms_id: r.source_pms_id, worker_no: r.worker_no, name: r.name, line: r.line,
    designation: r.designation,
    supervisor_id: r.source_supervisor_id ? supervisorMap.get(r.source_supervisor_id) ?? null : null,
    status: r.status, remarks: r.remarks, nationality: r.nationality,
    date_of_birth: r.date_of_birth, date_joined: r.date_joined,
  })))

  console.log('\nLevel 4: worker/project-dependent tables')
  await upsertAndMap(
    'plantpro_worker_pay_values',
    data.worker_pay_values.map(r => ({
      worker_id: workerMap.get(r.source_worker_id),
      pay_column_id: payColumnMap.get(r.source_pay_column_id),
      value: r.value,
    })).filter(r => r.worker_id && r.pay_column_id),
    'worker_id,pay_column_id',
  )

  await upsertAndMap(
    'plantpro_worker_allocations',
    data.worker_allocations.map(r => ({
      worker_id: workerMap.get(r.source_worker_id),
      project_id: projectMap.get(r.source_project_id),
      percentage: r.percentage,
    })).filter(r => r.worker_id && r.project_id),
    'worker_id,project_id',
  )

  const snapshotMap = await upsertAndMap('plantpro_allocation_snapshots', data.allocation_snapshots.map(r => ({
    source_pms_id: r.source_pms_id,
    worker_id: workerMap.get(r.source_worker_id),
    month: r.month,
    supervisor_id: r.source_supervisor_id ? supervisorMap.get(r.source_supervisor_id) ?? null : null,
  })).filter(r => r.worker_id))

  const otMonthMap = await upsertAndMap('plantpro_ot_months', data.ot_months.map(r => ({
    source_pms_id: r.source_pms_id, worker_id: workerMap.get(r.source_worker_id),
    month: r.month, mode: r.mode, remark: r.remark,
  })).filter(r => r.worker_id))

  await upsertAndMap('plantpro_timesheet_days', data.timesheet_days.map(r => ({
    source_pms_id: r.source_pms_id, worker_id: workerMap.get(r.source_worker_id),
    month: r.month, day: r.day, basic: r.basic, ot: r.ot,
  })).filter(r => r.worker_id))

  const hostelStayMap = await upsertAndMap('plantpro_hostel_stays', data.hostel_stays.map(r => ({
    source_pms_id: r.source_pms_id, worker_id: workerMap.get(r.source_worker_id),
    hostel_id: hostelMap.get(r.source_hostel_id), move_in_date: r.move_in_date, move_out_date: r.move_out_date,
  })).filter(r => r.worker_id && r.hostel_id))

  // Documents: metadata only here. local_stored_name still points at a PMS
  // filesystem path — upload-documents.mjs (a separate script, run after
  // this one from a machine with PMS's uploads/documents/ folder available)
  // rewrites stored_name to the real Drive file id.
  await upsertAndMap('plantpro_documents', data.documents.map(r => ({
    source_pms_id: r.source_pms_id, owner_type: r.owner_type,
    worker_id: r.source_worker_id ? workerMap.get(r.source_worker_id) ?? null : null,
    hostel_id: r.source_hostel_id ? hostelMap.get(r.source_hostel_id) ?? null : null,
    document_type_id: documentTypeMap.get(r.source_document_type_id),
    file_name: r.file_name, stored_name: r.local_stored_name, mime_type: r.mime_type,
    issue_date: r.issue_date, expiry_date: r.expiry_date, remarks: r.remarks,
    uploaded_at: r.uploaded_at,
  })).filter(r => r.document_type_id && (r.worker_id || r.hostel_id)))

  console.log('\nLevel 5: depend on level-4 tables')
  await upsertAndMap(
    'plantpro_allocation_snapshot_items',
    data.allocation_snapshot_items.map(r => ({
      snapshot_id: snapshotMap.get(r.source_snapshot_id),
      project_id: projectMap.get(r.source_project_id),
      percentage: r.percentage,
    })).filter(r => r.snapshot_id && r.project_id),
    null, // no natural unique key on this table; 0 rows in real data today
  )

  const otDayMap = await upsertAndMap('plantpro_ot_days', data.ot_days.map(r => ({
    source_pms_id: r.source_pms_id, ot_month_id: otMonthMap.get(r.source_ot_month_id),
    day: r.day, basic: r.basic, ot: r.ot,
  })).filter(r => r.ot_month_id))

  await upsertAndMap('plantpro_worker_transfers', data.worker_transfers.map(r => ({
    source_pms_id: r.source_pms_id, worker_id: workerMap.get(r.source_worker_id),
    month: r.month, day: r.day,
    to_supervisor_id: supervisorMap.get(r.source_to_supervisor_id), created_at: r.created_at,
  })).filter(r => r.worker_id && r.to_supervisor_id))

  // OT approvals: *_by fields are left NULL here (real identity resolution
  // is a manual step — see the plan's "2 real historical rows, hand-map or
  // leave null" instruction). *_by_text is preserved nowhere in the new
  // schema by design (plantpro_ot_approvals has no text fallback column) —
  // print them so a human can act on it instead.
  for (const r of data.ot_approvals) {
    if (r.submitted_by_text || r.approved_by_text || r.rejected_by_text) {
      console.log(`  [manual review] ot_approval month=${r.month} supervisor_source_id=${r.source_supervisor_id}: submitted_by="${r.submitted_by_text}" approved_by="${r.approved_by_text}" rejected_by="${r.rejected_by_text}"`)
    }
  }
  await upsertAndMap('plantpro_ot_approvals', data.ot_approvals.map(r => ({
    source_pms_id: r.source_pms_id, month: r.month,
    supervisor_id: supervisorMap.get(r.source_supervisor_id),
    status: r.status,
    submitted_at: r.submitted_at, approved_at: r.approved_at, rejected_at: r.rejected_at,
  })).filter(r => r.supervisor_id))

  await upsertAndMap('plantpro_monthly_targets', data.monthly_targets.map(r => ({
    source_pms_id: r.source_pms_id, project_id: projectMap.get(r.source_project_id),
    month: r.month, production_target: r.production_target,
    delivery_target: r.delivery_target, general_target: r.general_target,
  })).filter(r => r.project_id))

  await upsertAndMap('plantpro_claims', data.claims.map(r => ({
    source_pms_id: r.source_pms_id, project_id: projectMap.get(r.source_project_id),
    type: r.type, volume_or_trips: r.volume_or_trips, amount: r.amount,
    remarks: r.remarks, date: r.date, created_at: r.created_at,
  })).filter(r => r.project_id))

  const hostelBillMap = await upsertAndMap('plantpro_hostel_utility_bills', data.hostel_utility_bills.map(r => ({
    source_pms_id: r.source_pms_id, hostel_id: hostelMap.get(r.source_hostel_id),
    month: r.month, applied_at: r.applied_at,
  })).filter(r => r.hostel_id))

  console.log('\nLevel 6: depend on level-5 tables')
  await upsertAndMap(
    'plantpro_ot_day_allocations',
    data.ot_day_allocations.map(r => ({
      ot_day_id: otDayMap.get(r.source_ot_day_id),
      project_id: projectMap.get(r.source_project_id),
      percentage: r.percentage,
    })).filter(r => r.ot_day_id && r.project_id),
    'ot_day_id,project_id',
  )

  await upsertAndMap('plantpro_hostel_bill_line_items', data.hostel_bill_line_items.map(r => ({
    source_pms_id: r.source_pms_id, bill_id: hostelBillMap.get(r.source_bill_id),
    item_type_id: hostelItemTypeMap.get(r.source_item_type_id), amount: r.amount,
  })).filter(r => r.bill_id && r.item_type_id))

  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
