import { NextResponse } from 'next/server'
import { gzipSync } from 'node:zlib'
import { timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive, listDriveSubfolder, deleteFromDrive } from '@/lib/google-drive'

// Daily database backup to Google Drive (Vercel Cron, see vercel.json: 19:00 UTC = 03:00 Malaysia time).
// Every public table plus the login accounts (without password hashes) goes into one gzipped JSON file,
// backup-YYYY-MM-DD.json.gz, in the Drive "backups" folder. Retention is applied on every run:
//   - the last 30 days: every daily file
//   - up to ~6 months: Sunday files only (weekly)
//   - older: files dated the 1st of a month only (monthly, kept)
export const maxDuration = 300

const NAME_RE = /^backup-(\d{4})-(\d{2})-(\d{2})\.json\.gz$/
const DAILY_DAYS = 30
const WEEKLY_DAYS = 183

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = req.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

// Which backups survive. Date is read from the file name (UTC calendar day of the run).
function shouldKeep(name: string, today: Date) {
  const m = NAME_RE.exec(name)
  if (!m) return true // never touch anything we didn't create
  const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const age = Math.floor((today.getTime() - day.getTime()) / 86400000)
  if (age <= DAILY_DAYS) return true
  if (age <= WEEKLY_DAYS && day.getUTCDay() === 0) return true
  return day.getUTCDate() === 1
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()
  const fileName = `backup-${now.toISOString().slice(0, 10)}.json.gz`

  try {
    const { data: tableNames, error: listErr } = await admin.rpc('backup_list_tables')
    if (listErr) throw new Error(`list tables: ${listErr.message}`)

    const tables: Record<string, unknown[]> = {}
    let rows = 0
    for (const t of (tableNames as string[]).filter(n => n !== 'backup_runs')) {
      const { data, error } = await admin.rpc('backup_dump_table', { p_table: t })
      if (error) throw new Error(`dump ${t}: ${error.message}`)
      tables[t] = (data as unknown[]) ?? []
      rows += tables[t].length
    }
    const { data: users, error: usersErr } = await admin.rpc('backup_auth_users')
    if (usersErr) throw new Error(`auth users: ${usersErr.message}`)

    const payload = JSON.stringify({ created_at: now.toISOString(), tables, auth_users: users })
    const gz = gzipSync(Buffer.from(payload))

    // Same-day re-run (manual retry) replaces that day's file instead of duplicating it.
    const existing = await listDriveSubfolder('backups')
    for (const f of existing.filter(f => f.name === fileName)) await deleteFromDrive(f.id)
    await uploadToDrive(gz, 'backups', fileName, 'application/gzip')

    let pruned = 0
    for (const f of existing) {
      if (f.name !== fileName && !shouldKeep(f.name, now)) { await deleteFromDrive(f.id); pruned++ }
    }

    await admin.from('backup_runs').insert({
      ok: true, file_name: fileName, size_bytes: gz.length, tables: Object.keys(tables).length, rows, pruned,
    })
    return NextResponse.json({ ok: true, file: fileName, bytes: gz.length, tables: Object.keys(tables).length, rows, pruned })
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500)
    console.error('[backup] failed:', message)
    await admin.from('backup_runs').insert({ ok: false, file_name: fileName, error: message })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
