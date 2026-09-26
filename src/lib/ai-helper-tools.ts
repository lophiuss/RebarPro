import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// The AI Helper looks at the database itself via this one generic, read-only
// query tool rather than being handed a pre-built snapshot — every answer
// reflects a real query run at the moment it's asked. It runs on the
// CALLER's own Supabase session, so RLS (has_dept_access, etc.) applies
// exactly as it would if that person queried the table themselves: a table
// or row they don't have department access to just comes back empty.

const ALLOWED_TABLES: Record<string, string> = {
  transactions: 'Rebar inventory movements — quantity (tonnes, signed), type (incoming|usage|transfer|suspended|unsuspend|wastage), transaction_date, size_id, project_type_id, project_id, do_number, notes',
  rebar_sizes: 'id, size (e.g. H16), target_daily_usage (tonnes/day), unit',
  stock_takes: 'Rebar physical stock counts — size_id, stock_take_date, physical_count (tonnes), project_type_id',
  projects: 'id, name, project_type_id',
  project_types: 'id, name',
  cement_weight_in: 'Cement deliveries — weigh_date, lorry_no, do_number, material, plant_id, silo_id, material_id, do_weight, weight_in, weight_out, unload_start_time, unload_complete_time, archived_at (non-null = archived/hidden)',
  cement_daily_stock_take: 'take_date, silo_id, actual_stock, operator',
  cement_daily_usage: 'usage_date, silo_id, usage, operator',
  cement_silos: 'id, name, plant_id, is_active, display_order',
  cement_plants: 'id, name',
  cement_materials: 'id, name',
  cement_alert_log: 'alert_date, plant_name, material_name, variance_pct, alert_type (daily|monthly)',
  cement_transfers: 'transfer_date, from_silo_id, to_silo_id, quantity',
  security_entries: 'category (visitor|delivery|inhouse), person_name, company, purpose, vehicle_no, status (pending|in|out), time_in, time_out, created_by, abnormal_flag, abnormal_reason',
  security_post_logs: 'post_name, guard_name, time_in, time_out, created_by',
  security_gate_events: 'gate_name, action (open|locked), username, created_at',
  security_guard_posts: 'id, name',
  security_incidents: 'type, severity, description, created_at',
  security_panic_logs: 'triggered_by, remark, created_at',
  security_keys: 'key_name, key_no',
  security_key_logs: 'key_id, issued_to, issued_by, time_issued, time_returned, status',
  shoutouts: 'department, to_name, message, from_name, created_at',
  profiles: 'id, full_name — no emails or credentials are stored here',
  maintenance_equipment: 'equip_code, name, category, brand, location, condition (good|fair|poor|spoil), manager, supervisor, pic_day, pic_night, target_repair_hours, is_active',
  maintenance_inspections: 'equipment_id, inspected_by, inspection_date, condition, remarks, preventive_action_recommendation',
  maintenance_job_reports: 'equipment_id, category, report_date, reported_by, issue_description, downtime_hours, repair_time_hours, status (open|in_progress|completed|cancelled)',
  maintenance_critical_issues: 'equipment_id, equipment_label, issue, lead_time_note, status, created_at, resolved_at',
  maintenance_pm_schedule: 'equipment_id, year, week_number, planned, completed_at',
  maintenance_checklist_templates: 'name, scope (single_equipment|section_list), frequency, form_code',
  maintenance_checklist_submissions: 'template_id, equipment_id, submission_date, done_by, verified_by',
  maintenance_spare_parts_requests: 'part_name, equipment_id, quantity_requested, quantity_received, request_date, received_date',
  maintenance_work_requests: 'requester_name, location, equipment_id, issue_description, status (pending|assigned|completed|cancelled), assigned_to, assigned_at, completed_at, created_at',
  mould_assets: 'Moulds — id, mould_code, name, mould_type, status (fabricating|active|parked|eol), product_weight_kg (weight of the product cast, NOT the mould), steel_weight_kg (the mould\'s own steel, grows with each change job), owning_project_id, current_project_id (both -> plantpro_projects)',
  mould_jobs: 'Mould work orders — id, job_no, job_type (fabrication|change|maintenance|decommission), cost_center (project|factory), project_id (-> plantpro_projects), mould_id, status, started_on, completed_on, added_steel_kg, material_cost_snapshot, scrap_value_snapshot',
  mould_time_entries: 'Per-worker mould labour — worker_id (-> plantpro_workers), job_id, project_id, work_date, hours, activity_code, cost_target (mould|project|factory), labour_cost (provisional rate, not real wages)',
  mould_month_locks: 'period (YYYY-MM), status (open|locked) — locked months cannot be edited',
  plantpro_workers: 'HR worker roster (~156 factory workers, no logins) — worker_no, name, line (free-text department/task from timecard imports, not a clean category), designation, supervisor_id, status (Active|Inactive|On Leave), nationality, date_of_birth, date_joined',
  plantpro_projects: 'id, name, type_id, status (Active|Inactive) — the master project list, also used by the mould department',
  plantpro_supervisors: 'id, name, status, linked_user_id (-> the supervisor\'s real login account, when they have one)',
  plantpro_pay_columns: 'Pay/deduction column definitions — id, key, label, type (ADD|DEDUCT), include_in_gross, include_in_net_deduct, compute_mode (MANUAL|MULTIPLIER), multiplier_percent',
  plantpro_worker_pay_values: 'Wage amounts per worker per pay column — worker_id, pay_column_id, value. SALARY DATA — RLS-restricted to the PlantPro admin and hr roles only; everyone else (incl. managers and supervisors) gets no rows and the tool refuses',
  plantpro_timesheet_days: 'HR-recorded ACTUAL attendance — worker_id, month (YYYY-MM), day (DD), basic, ot (hours)',
  plantpro_ot_months: 'Supervisor OT planning header — worker_id, month (YYYY-MM), mode, remark. Join to plantpro_ot_days via its id',
  plantpro_ot_days: 'Supervisor-PLANNED daily hours — ot_month_id (-> plantpro_ot_months), day (DD), basic, ot. Deliberately a separate ledger from plantpro_timesheet_days; the two are not reconciled',
  plantpro_hostels: 'id, name, status, address, owner_name, owner_contact, rental_per_month, deposit_withheld',
  plantpro_hostel_stays: 'worker_id, hostel_id, move_in_date, move_out_date (null = still staying)',
  plantpro_documents: 'Worker/hostel document tracking — owner_type (WORKER|HOSTEL), worker_id, hostel_id, document_type_id, file_name, issue_date, expiry_date, remarks',
  plantpro_document_types: 'id, name (e.g. Passport, Permit, FOMEMA), scope (WORKER|HOSTEL|BOTH)',
  plantpro_monthly_targets: 'project_id, month (YYYY-MM), production_target, delivery_target, general_target (m³)',
  plantpro_claims: 'project_id, type (Production|Delivery|General), volume_or_trips (m³), amount (RM), date, remarks',
}

const ALLOWED_OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'])

// Models don't always stick to the named ops even when told to — normalize
// common symbolic aliases (=, !=, >=, etc.) to the Supabase method names.
const OP_ALIASES: Record<string, string> = {
  '=': 'eq', '==': 'eq', '!=': 'neq', '<>': 'neq',
  '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte',
}
function normalizeOp(op: string): string | null {
  const direct = op.toLowerCase()
  if (ALLOWED_OPS.has(direct)) return direct
  const alias = OP_ALIASES[op]
  return alias && ALLOWED_OPS.has(alias) ? alias : null
}

export function schemaReferenceText(): string {
  return Object.entries(ALLOWED_TABLES).map(([t, d]) => `- ${t}: ${d}`).join('\n')
}

export function queryDatabaseToolDeclaration() {
  return {
    name: 'query_database',
    description: 'Run a read-only query against one table in the system\'s live database and get back matching rows. Call this whenever you need real, current information — never guess at data. Table must be one from the schema reference you were given.',
    parameters: {
      type: 'OBJECT',
      properties: {
        table: { type: 'STRING', description: 'Exact table name from the schema reference.' },
        select: { type: 'STRING', description: 'Comma-separated column names to return. Defaults to all columns.' },
        filters: {
          type: 'ARRAY',
          description: 'Optional filters, all combined with AND.',
          items: {
            type: 'OBJECT',
            properties: {
              column: { type: 'STRING' },
              op: { type: 'STRING', description: 'One of: eq, neq, gt, gte, lt, lte, like, ilike, in, is' },
              value: { description: 'Value to compare against. For "in" pass an array; for date/time columns use ISO 8601 strings.' },
            },
            required: ['column', 'op', 'value'],
          },
        },
        order_by: { type: 'STRING', description: 'Optional column to sort by.' },
        ascending: { type: 'BOOLEAN', description: 'Sort ascending. Defaults to false (newest/largest first).' },
        limit: { type: 'NUMBER', description: 'Max rows to return. Defaults to 50, hard-capped at 200.' },
      },
      required: ['table'],
    },
  }
}

const WAGE_TABLES = ['plantpro_worker_pay_values']
const WAGE_DENIED = { error: 'Restricted: salary/wage data is only available to HR and admin users. This user does not have that access, so do not attempt to look it up or estimate it — tell them it is restricted.' }

export async function executeQueryDatabase(supabase: SupabaseClient, args: any, opts: { canSeeWages?: boolean } = {}) {
  const table = String(args?.table || '')
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TABLES, table)) {
    return { error: `Table "${table}" is not queryable. Allowed tables: ${Object.keys(ALLOWED_TABLES).join(', ')}` }
  }
  const select = typeof args?.select === 'string' && args.select.trim() ? args.select : '*'
  // Belt and braces on top of RLS: refuse outright (rather than return zero
  // rows the model might read as "no data") when a non-HR/admin user asks
  // for salary data directly or via an embedded select.
  if (!opts.canSeeWages && (WAGE_TABLES.includes(table) || WAGE_TABLES.some(t => select.includes(t)))) return WAGE_DENIED
  const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200)

  let query: any = supabase.from(table).select(select).limit(limit)

  if (Array.isArray(args?.filters)) {
    for (const f of args.filters) {
      if (!f || typeof f.column !== 'string' || typeof f.op !== 'string') continue
      const op = normalizeOp(f.op)
      if (!op) continue
      query = query[op](f.column, f.value)
    }
  }
  if (typeof args?.order_by === 'string' && args.order_by) {
    query = query.order(args.order_by, { ascending: !!args.ascending })
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { row_count: Array.isArray(data) ? data.length : 0, rows: data }
}
