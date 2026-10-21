// Restores data from a daily backup (see src/app/api/cron/backup/route.ts) into the Supabase project in .env.local.
//
//   node --env-file=.env.local scripts/restore-backup.mjs --drive list
//   node --env-file=.env.local scripts/restore-backup.mjs --drive latest               # dry run (default)
//   node --env-file=.env.local scripts/restore-backup.mjs --file backup-2026-10-21.json.gz --table plantpro_workers
//   node --env-file=.env.local scripts/restore-backup.mjs --drive 2026-10-21 --apply --confirm-project <project-ref>
//
// Options
//   --file <path>          a backup file already downloaded from Drive
//   --drive <latest|date|list>  fetch from the Drive "backups" folder (needs the GOOGLE_* values in .env.local to be current)
//   --table a,b            only these tables (default: all)
//   --mode missing|overwrite   missing (default): add rows that are gone, never touch existing rows
//                          overwrite: also put existing rows back to their backed-up values
//   --users                re-create login accounts that no longer exist (done automatically when --table is not given)
//   --apply                actually write. Without it nothing is changed.
//   --confirm-project <ref>  must equal the project ref of NEXT_PUBLIC_SUPABASE_URL when using --apply
//
// Restored login accounts get a random password: use "Forgot password" / an admin reset afterwards.
// The database structure is not part of a backup; apply the supabase_migration_*.sql files first on an empty project.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]) }
const fail = msg => { console.error(`\nERROR: ${msg}`); process.exit(1) }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY missing. Run with: node --env-file=.env.local scripts/restore-backup.mjs ...')
const projectRef = new URL(url).hostname.split('.')[0]

const mode = opt('mode') || 'missing'
if (!['missing', 'overwrite'].includes(mode)) fail('--mode must be "missing" or "overwrite"')
const apply = args.includes('--apply')
const onlyTables = typeof opt('table') === 'string' ? opt('table').split(',').map(s => s.trim()).filter(Boolean) : null
const withUsers = args.includes('--users') || !onlyTables

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// ---------- Drive (optional) ----------
async function driveFolder() {
  const { google } = await import('googleapis')
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !GOOGLE_DRIVE_FOLDER_ID) fail('GOOGLE_* values missing in .env.local (or download the file by hand and use --file)')
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth })
  const sub = await drive.files.list({
    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name = 'backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
  })
  const folderId = sub.data.files?.[0]?.id
  if (!folderId) fail('No "backups" folder found in Drive yet.')
  const list = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: 'files(id, name)', pageSize: 1000 })
  const files = (list.data.files || []).filter(f => /^backup-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
  return { drive, files }
}

async function loadBackup() {
  const file = opt('file')
  if (typeof file === 'string') return { name: file, data: JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) }
  const which = opt('drive')
  if (typeof which !== 'string') fail('Give --file <path> or --drive <latest|YYYY-MM-DD|list>')
  const { drive, files } = await driveFolder()
  if (which === 'list') { console.log(files.map(f => f.name).join('\n') || '(no backups yet)'); process.exit(0) }
  const pick = which === 'latest' ? files.at(-1) : files.find(f => f.name === `backup-${which}.json.gz`)
  if (!pick) fail(`Backup not found. Available:\n${files.map(f => '  ' + f.name).join('\n')}`)
  const res = await drive.files.get({ fileId: pick.id, alt: 'media' }, { responseType: 'arraybuffer' })
  return { name: pick.name, data: JSON.parse(gunzipSync(Buffer.from(res.data)).toString('utf8')) }
}

// ---------- main ----------
const { name, data } = await loadBackup()
if (!data?.tables || typeof data.tables !== 'object') fail('This does not look like a backup file (no "tables").')

const { data: liveTables, error: ltErr } = await admin.rpc('backup_list_tables')
if (ltErr) fail(`Cannot read table list (is migration v46/v47 applied on this project?): ${ltErr.message}`)
const live = new Set(liveTables)

const wanted = Object.keys(data.tables).filter(t => !onlyTables || onlyTables.includes(t))
if (onlyTables) for (const t of onlyTables) if (!(t in data.tables)) fail(`Table "${t}" is not in this backup.`)

console.log(`Backup:  ${name}  (taken ${data.created_at})`)
console.log(`Target:  ${url}  [project ${projectRef}]`)
console.log(`Mode:    ${mode}${apply ? '  — WRITING' : '  — dry run, nothing will be changed'}\n`)

const plan = []
for (const t of wanted) {
  const rows = data.tables[t]
  if (!live.has(t)) { console.log(`  skip  ${t.padEnd(36)} not in the target database (apply migrations first)`); continue }
  const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
  plan.push({ table: t, rows, current: count ?? 0 })
  const note = rows.length > (count ?? 0) ? `  (+${rows.length - (count ?? 0)} more than now)` : ''
  console.log(`  ${t.padEnd(38)} backup ${String(rows.length).padStart(7)}   now ${String(count ?? 0).padStart(7)}${note}`)
}

// Login accounts
let missingUsers = []
if (withUsers && Array.isArray(data.auth_users)) {
  const existing = new Set()
  for (let page = 1; ; page++) {
    const { data: res, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) fail(`Cannot list users: ${error.message}`)
    res.users.forEach(u => existing.add(u.id))
    if (res.users.length < 1000) break
  }
  missingUsers = data.auth_users.filter(u => !existing.has(u.id))
  console.log(`\n  login accounts: ${data.auth_users.length} in backup, ${missingUsers.length} missing from the target`)
}

if (!apply) {
  console.log('\nDry run only. Add --apply (and --confirm-project ' + projectRef + ') to write.')
  process.exit(0)
}
if (opt('confirm-project') !== projectRef) fail(`--apply needs --confirm-project ${projectRef} (a safety check so you cannot restore into the wrong project).`)

// 1) accounts first, so rows that refer to them have something to point at
const createdIds = new Set()
for (const u of missingUsers) {
  if (!u.email) { console.log(`  skip account ${u.id}: no email`); continue }
  const { error } = await admin.auth.admin.createUser({
    id: u.id, email: u.email, email_confirm: true, password: randomBytes(24).toString('base64url'),
    app_metadata: u.app_metadata ?? {}, user_metadata: u.user_metadata ?? {},
  })
  if (error) console.log(`  FAILED account ${u.email}: ${error.message}`)
  else { createdIds.add(u.id); console.log(`  created account ${u.email}`) }
}

// 2) tables, in chunks
const CHUNK = 500
async function load(table, rows, m) {
  let total = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data: res, error } = await admin.rpc('backup_restore_table', { p_table: table, p_rows: rows.slice(i, i + CHUNK), p_mode: m })
    if (error) throw new Error(error.message)
    total += res?.rows ?? 0
  }
  return total
}

let failed = 0
for (const { table, rows } of plan) {
  try {
    let n = 0
    if (table === 'profiles' && createdIds.size && mode === 'missing') {
      // a sign-up trigger may already have made an empty profile for a re-created account: take the backed-up one
      n += await load(table, rows.filter(r => createdIds.has(r.id)), 'overwrite')
      n += await load(table, rows.filter(r => !createdIds.has(r.id)), 'missing')
    } else {
      n = await load(table, rows, mode)
    }
    console.log(`  restored ${table.padEnd(36)} ${n} row(s) written`)
  } catch (e) {
    failed++
    console.log(`  FAILED   ${table.padEnd(36)} ${e.message}`)
  }
}

console.log(failed ? `\nFinished with ${failed} failed table(s) — see above.` : '\nDone.')
if (createdIds.size) console.log(`${createdIds.size} account(s) were re-created with a random password: use "Forgot password" or an admin reset.`)
process.exit(failed ? 1 : 0)
