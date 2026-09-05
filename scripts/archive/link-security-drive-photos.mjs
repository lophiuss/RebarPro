// The 3,334 legacy photos were copied into Google Drive manually (not via
// migrate-security.mjs's own upload pass), so this script does the matching
// instead of uploading: list every file already in the Drive folder (and any
// subfolders inside it — however the manual copy was organized), match each
// one by filename to the legacy security.db photo_path/file_path it came
// from, and record that file's Drive id on the corresponding row.
//
// Run with:  node scripts/link-security-drive-photos.mjs
//
// Safe to re-run: only rows whose photo_drive_id is still null/'PENDING' are
// updated.
//
// Needs, from .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID

import { DatabaseSync } from 'node:sqlite'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { readFileSync } from 'node:fs'
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
for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID']) {
  if (!env[k]) throw new Error(`Missing ${k} in .env.local`)
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
oauth2Client.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth: oauth2Client })

// Recursively walk every folder under the root, building filename -> fileId.
// If the same filename appears more than once, the LAST one seen wins and a
// warning is printed — shouldn't happen since the legacy app's upload
// filenames were already unique (timestamp + random suffix).
async function listAllFiles(folderId, seenFolders = new Set()) {
  if (seenFolders.has(folderId)) return new Map()
  seenFolders.add(folderId)
  const byName = new Map()
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken,
    })
    for (const f of res.data.files || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const nested = await listAllFiles(f.id, seenFolders)
        for (const [name, id] of nested) {
          if (byName.has(name)) console.warn(`  duplicate filename across folders: ${name}`)
          byName.set(name, id)
        }
      } else {
        if (byName.has(f.name)) console.warn(`  duplicate filename in same tree: ${f.name}`)
        byName.set(f.name, f.id)
      }
    }
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return byName
}

console.log('Listing files already in Drive (this walks subfolders too)...')
const driveFiles = await listAllFiles(env.GOOGLE_DRIVE_FOLDER_ID)
console.log(`Found ${driveFiles.size} files in Drive.\n`)

const db = new DatabaseSync(path.join(SECURITY_APP_DIR, 'security.db'), { readOnly: true })
const all = (sql) => db.prepare(sql).all()

// Fetches every {id, photo_drive_id} in a table, paging past PostgREST's
// 1000-row default cap — needed since security_entries alone has 3,611 rows.
async function fetchCurrentDriveIds(table) {
  const byId = new Map()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(table).select('id, photo_drive_id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const r of data) byId.set(r.id, r.photo_drive_id)
    if (data.length < PAGE) break
  }
  return byId
}

// A partial-column upsert ({id, photo_drive_id}) fails: Postgres checks the
// INSERT side's NOT NULL constraints (category, person_name, ...) even
// though a conflict means it never actually inserts a new row. A plain
// .update() has no such problem — it only ever touches the columns named —
// so that's what actually writes, run with limited concurrency instead of
// one request at a time (which is what made the first attempt so slow).
async function updateWithConcurrency(items, concurrency, fn) {
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

async function linkTable(table, rows, pathKey) {
  const current = await fetchCurrentDriveIds(table)

  let alreadyDone = 0, notFoundInDrive = 0
  const updates = []
  for (const row of rows) {
    if (!row[pathKey]) continue
    const filename = path.basename(row[pathKey])

    const existing = current.get(row.id)
    if (existing && existing !== 'PENDING') { alreadyDone++; continue }

    const fileId = driveFiles.get(filename)
    if (!fileId) { notFoundInDrive++; continue }

    updates.push({ id: row.id, photo_drive_id: fileId })
  }

  let linked = 0
  await updateWithConcurrency(updates, 25, async ({ id, photo_drive_id }) => {
    const { error } = await sb.from(table).update({ photo_drive_id }).eq('id', id)
    if (error) throw new Error(`${table} id=${id}: ${error.message}`)
    linked++
    if (linked % 500 === 0) console.log(`  ... ${table}: ${linked}/${updates.length}`)
  })

  return { table, linked, alreadyDone, notFoundInDrive }
}

const results = []
results.push(await linkTable('security_entries', all('SELECT id, photo_path FROM entries WHERE photo_path IS NOT NULL'), 'photo_path'))
results.push(await linkTable('security_incidents', all('SELECT id, photo_path FROM incidents WHERE photo_path IS NOT NULL'), 'photo_path'))
results.push(await linkTable('security_layout', all('SELECT id, file_path FROM layout WHERE file_path IS NOT NULL'), 'file_path'))

console.log('Linked:')
for (const r of results) console.log(`  ${r.table.padEnd(20)} linked=${r.linked} already_done=${r.alreadyDone} not_found_in_drive=${r.notFoundInDrive}`)

const totalNotFound = results.reduce((s, r) => s + r.notFoundInDrive, 0)
if (totalNotFound > 0) {
  console.log(`\n⚠ ${totalNotFound} photo(s) referenced in security.db were not found by filename in the Drive folder.`)
  console.log('  Either they weren\'t copied over, or they ended up renamed during the manual copy.')
}

db.close()
