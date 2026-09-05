// One-off migration: the legacy Security Gate app's security.db (SQLite) ->
// Supabase security_* tables, plus its 29 users -> Supabase Auth + security
// department access, plus its 3,334 local photo files -> Google Drive.
//
// Run with:  node scripts/migrate-security.mjs
//
// Idempotent for the table data (upsert on the original SQLite id) and for
// user accounts (skips usernames that already have a <username>@security.local
// account). The photo-upload pass is NOT re-run for a row that already has a
// photo_drive_id — safe to re-run this whole script after an interrupted run.
//
// Needs, from .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY               (always)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//   GOOGLE_DRIVE_FOLDER_ID                                       (for the photo pass —
//     if these aren't set yet, table/user data still migrates; re-run this
//     script later once Google Drive is set up to backfill photos.)
//
// SECURITY_APP_DIR below points at the backup copy of the legacy app on this
// machine — update it if that folder moves.

import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SECURITY_APP_DIR = 'C:\\Users\\hp\\Downloads\\my_backup_2026-09-02\\security'

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = env.SUPABASE_SECRET_KEY

const sb = createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const db = new DatabaseSync(path.join(SECURITY_APP_DIR, 'security.db'), { readOnly: true })
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

// ───────────────────────── Part A: table data ─────────────────────────
const summary = []

summary.push(await upsert('security_guard_posts', all('SELECT id, name, created_at FROM guard_posts')))
summary.push(await upsert('security_gates', all('SELECT id, name, pos_x, pos_y, status, updated_at FROM gates')))
summary.push(await upsert('security_gate_events', all('SELECT id, gate_id, gate_name, action, username, created_at FROM gate_events')))
summary.push(await upsert('security_keys', all('SELECT id, key_name, key_no, description, created_at FROM keys')))
summary.push(await upsert('security_key_logs', all('SELECT id, key_id, key_name, issued_to, issued_by, purpose, time_issued, time_returned, status, notes, returned_by FROM key_logs')))
summary.push(await upsert('security_post_logs', all('SELECT id, post_name, guard_name, time_in, time_out, notes, created_at, created_by FROM post_logs')))
summary.push(await upsert('security_panic_logs', all('SELECT id, triggered_by, remark, created_at FROM panic_logs')))
summary.push(await upsert('security_entries', all(`
  SELECT id, category, person_name, company, purpose, vehicle_no, badge_no, reference_no, notes,
         status, time_in, time_out, created_at, created_by,
         abnormal_flag, abnormal_reason, abnormal_type, abnormal_at
  FROM entries
`).map(r => ({ ...r, abnormal_flag: bool(r.abnormal_flag) }))))
summary.push(await upsert('security_incidents', all('SELECT id, type, description, location, reported_by, severity, status, created_at FROM incidents')))
summary.push(await upsert('security_layout', all('SELECT id, uploaded_at, uploaded_by FROM layout').map(r => ({ ...r, photo_drive_id: 'PENDING' }))))

console.log('\nMigrated tables:')
for (const s of summary) console.log(`  ${s.table.padEnd(24)} ${s.count}`)

// ───────────────────────── Part B: users -> Supabase Auth ─────────────────────────
const users = all('SELECT id, username, password, display_name, role, active, photo_path FROM users')

async function adminFetch(pathname, init) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}`, apikey: SECRET_KEY, ...init?.headers },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}
async function grantSecurityAccess(userId, role) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_department_access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET_KEY}`, apikey: SECRET_KEY, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ user_id: userId, department: 'security', role }]),
  })
  if (!res.ok) throw new Error(`grant access failed (${res.status}): ${await res.text()}`)
}
// Legacy "boss" role -> 'admin' internally (see AGENTS notes: is_dept_admin()
// hardcodes role = 'admin'; the UI labels it "Boss" for this department only).
const ROLE_MAP = { boss: 'admin', manager: 'manager', security: 'security' }

// Legacy usernames are free text ("En. Amir", "Mohd Arif") and aren't valid
// email local-parts as-is — sanitize for the placeholder email, keep the
// original username in full_name/display via user_metadata.
function sanitizeForEmail(username) {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const userResults = []
const userIdByLegacyId = new Map()
for (const u of users) {
  const email = `${sanitizeForEmail(u.username)}@security.local`
  const role = ROLE_MAP[u.role] || 'security'

  const created = await adminFetch('/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: u.password, email_confirm: true, user_metadata: { full_name: u.display_name } }),
  })

  let userId
  if (created.ok) {
    userId = created.body.id
  } else if (created.status === 422 || /already.*registered/i.test(JSON.stringify(created.body))) {
    const list = await adminFetch(`/users?email=${encodeURIComponent(email)}`, { method: 'GET' })
    userId = list.body?.users?.[0]?.id
    if (!userId) throw new Error(`Could not find existing user for ${email}`)
  } else {
    throw new Error(`Create failed for ${email} (${created.status}): ${JSON.stringify(created.body)}`)
  }

  await grantSecurityAccess(userId, role)
  userIdByLegacyId.set(u.id, userId)
  userResults.push({ username: u.username, email, role, active: bool(u.active), status: created.ok ? 'created' : 'already existed' })
}

console.log('\nSecurity accounts:')
for (const r of userResults) console.log(`  ${r.username.padEnd(14)} -> ${r.email.padEnd(30)} security:${r.role.padEnd(9)} ${r.active ? '' : '(inactive)'} (${r.status})`)

// ───────────────────────── Part C: photos -> Google Drive ─────────────────────────
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN || !env.GOOGLE_DRIVE_FOLDER_ID) {
  console.log('\n⚠ Google Drive is not configured yet (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN/DRIVE_FOLDER_ID) —')
  console.log('  table data and accounts are migrated, but photos were skipped. Run scripts/google-drive-auth.mjs,')
  console.log('  add the resulting env vars to .env.local, then re-run this script to backfill photos.')
  db.close()
  process.exit(0)
}

const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
oauth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: oauth2Client })
const ROOT_FOLDER_ID = env.GOOGLE_DRIVE_FOLDER_ID
const folderCache = new Map()

async function getOrCreateSubfolder(name) {
  if (folderCache.has(name)) return folderCache.get(name)
  const existing = await drive.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
  })
  let id = existing.data.files?.[0]?.id
  if (!id) {
    const created = await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [ROOT_FOLDER_ID] }, fields: 'id' })
    id = created.data.id
  }
  folderCache.set(name, id)
  return id
}

async function uploadFile(localPath, subfolder) {
  const parentId = await getOrCreateSubfolder(subfolder)
  const filename = path.basename(localPath)
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentId] },
    media: { mimeType: 'image/jpeg', body: (await import('node:fs')).createReadStream(localPath) },
    fields: 'id',
  })
  return res.data.id
}

async function migratePhotosFor(table, subfolder, rows) {
  let uploaded = 0, missing = 0, skipped = 0
  for (const row of rows) {
    if (!row.legacyPath) continue
    const localPath = path.join(SECURITY_APP_DIR, 'public', row.legacyPath.replace(/^\//, ''))
    if (!existsSync(localPath)) { missing++; continue }

    const { data: current } = await sb.from(table).select('photo_drive_id').eq('id', row.id).single()
    if (current?.photo_drive_id && current.photo_drive_id !== 'PENDING') { skipped++; continue }

    const fileId = await uploadFile(localPath, subfolder)
    const { error } = await sb.from(table).update({ photo_drive_id: fileId }).eq('id', row.id)
    if (error) throw new Error(`${table} id=${row.id}: ${error.message}`)
    uploaded++
    if (uploaded % 100 === 0) console.log(`  ... ${subfolder}: ${uploaded} uploaded so far`)
  }
  return { table, uploaded, missing, skipped }
}

console.log('\nUploading photos to Google Drive (this can take a while for ~382MB)...')
const photoSummary = []
photoSummary.push(await migratePhotosFor(
  'security_entries', 'entries',
  all('SELECT id, photo_path AS legacyPath FROM entries WHERE photo_path IS NOT NULL')
))
photoSummary.push(await migratePhotosFor(
  'security_incidents', 'incidents',
  all('SELECT id, photo_path AS legacyPath FROM incidents WHERE photo_path IS NOT NULL')
))
photoSummary.push(await migratePhotosFor(
  'security_layout', 'layout',
  all('SELECT id, file_path AS legacyPath FROM layout WHERE file_path IS NOT NULL')
))

// Migrated users' own photos go through the existing Supabase 'avatars'
// bucket + profiles.avatar_url (same system Access Control already uses),
// not Google Drive — avatars are shown app-wide, including to people without
// security department access, so they can't go behind the security photo proxy.
let avatarsUploaded = 0
for (const u of users) {
  if (!u.photo_path) continue
  const localPath = path.join(SECURITY_APP_DIR, 'public', u.photo_path.replace(/^\//, ''))
  if (!existsSync(localPath)) continue
  const userId = userIdByLegacyId.get(u.id)
  const { data: profile } = await sb.from('profiles').select('avatar_url').eq('id', userId).single()
  if (profile?.avatar_url) continue // already has one, don't overwrite
  const bytes = readFileSync(localPath)
  const storagePath = `${userId}/${Date.now()}.jpg`
  const { error: upErr } = await sb.storage.from('avatars').upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: true })
  if (upErr) { console.warn(`  avatar upload failed for ${u.username}: ${upErr.message}`); continue }
  const { data: pub } = sb.storage.from('avatars').getPublicUrl(storagePath)
  await sb.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', userId)
  avatarsUploaded++
}

console.log('\nPhoto migration:')
for (const s of photoSummary) console.log(`  ${s.table.padEnd(20)} uploaded=${s.uploaded} missing_file=${s.missing} already_done=${s.skipped}`)
console.log(`  ${'profiles (avatars)'.padEnd(20)} uploaded=${avatarsUploaded}`)

console.log('\nDone. Next: reset the identity sequences (see scripts/reset-security-sequences.sql) so new')
console.log('rows created from the app don\'t collide with these migrated ids.')

db.close()
