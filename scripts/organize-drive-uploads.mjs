// One-off tidy-up of the Google Drive "uploads" folder (GOOGLE_DRIVE_FOLDER_ID).
//
// The 3,300+ legacy security photos were copied straight into "uploads" by hand, while the app puts new photos
// into subfolders (entries, layout, ...). This moves each loose photo into the subfolder that matches the database
// row that uses it. Photos nothing points at go into "uploads/unlinked" for you to review (nothing is deleted).
// Moving a file in Drive keeps its file id, so the database links keep working.
//
//   node --env-file=.env.local scripts/organize-drive-uploads.mjs          # dry run: only prints the plan
//   node --env-file=.env.local scripts/organize-drive-uploads.mjs --apply  # does the moves

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const apply = process.argv.includes('--apply')
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID: UPLOADS } = process.env
if (!url || !key || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !UPLOADS) {
  console.error('Missing env values. Run with: node --env-file=.env.local scripts/organize-drive-uploads.mjs')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })

// subfolder -> [table, column] holding Drive file ids
const SOURCES = {
  entries: ['security_entries', 'photo_drive_id'],
  layout: ['security_layout', 'photo_drive_id'],
  incidents: ['security_incidents', 'photo_drive_id'],
  clocking: ['security_clocking_records', 'photo_drive_id'],
}

const owner = new Map()
for (const [folder, [table, col]] of Object.entries(SOURCES)) {
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(col).not(col, 'is', null).range(from, from + 999)
    if (error) throw error
    for (const r of data) owner.set(r[col], folder)
    if (data.length < 1000) break
  }
}

const loose = []
let pageToken
do {
  const r = await drive.files.list({
    q: `'${UPLOADS}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
    fields: 'nextPageToken, files(id, name)', pageSize: 1000, pageToken,
  })
  loose.push(...r.data.files); pageToken = r.data.nextPageToken
} while (pageToken)

const counts = {}
const jobs = loose.map(f => { const to = owner.get(f.id) ?? 'unlinked'; counts[to] = (counts[to] || 0) + 1; return { id: f.id, to } })
console.log(`Loose files in uploads: ${loose.length}`)
console.log('Plan:', counts)
if (!apply) { console.log('\nDry run only. Add --apply to move them.'); process.exit(0) }

const folderIds = {}
async function folder(name) {
  if (folderIds[name]) return folderIds[name]
  const r = await drive.files.list({ q: `'${UPLOADS}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id)' })
  folderIds[name] = r.data.files[0]?.id
    ?? (await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [UPLOADS] }, fields: 'id' })).data.id
  return folderIds[name]
}

let done = 0
const failed = []
async function worker() {
  while (jobs.length) {
    const j = jobs.pop()
    try {
      await drive.files.update({ fileId: j.id, addParents: await folder(j.to), removeParents: UPLOADS, fields: 'id' })
      if (++done % 500 === 0) console.log(`  moved ${done}`)
    } catch (e) { failed.push(`${j.id}: ${e.message}`) }
  }
}
await Promise.all(Array.from({ length: 6 }, worker))
console.log(`Done. Moved ${done}, failed ${failed.length}`)
if (failed.length) console.log(failed.slice(0, 10).join('\n'))
