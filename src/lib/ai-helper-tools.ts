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

export async function executeQueryDatabase(supabase: SupabaseClient, args: any) {
  const table = String(args?.table || '')
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_TABLES, table)) {
    return { error: `Table "${table}" is not queryable. Allowed tables: ${Object.keys(ALLOWED_TABLES).join(', ')}` }
  }
  const select = typeof args?.select === 'string' && args.select.trim() ? args.select : '*'
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
