import 'server-only'
import { google } from 'googleapis'
import { Readable } from 'node:stream'

// Security department photos (visitor/incident/user photos, the site layout
// image) are stored in the user's own Google Drive instead of Supabase
// Storage, so they don't eat into Supabase's storage quota. Credentials are
// a Google OAuth2 refresh token obtained once via scripts/google-drive-auth.mjs
// — never exposed to the browser, only used from Server Actions and the
// /api/security/photo/[fileId] route handler.
function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Google Drive is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN)')
  }
  const client = new google.auth.OAuth2(clientId, clientSecret)
  client.setCredentials({ refresh_token: refreshToken })
  return client
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getOAuthClient() })
}

// Subfolders (entries/incidents/layout/avatars) live under this root folder,
// created lazily and cached in-memory for the life of the server process —
// avoids a folder-lookup round trip on every upload.
const folderCache = new Map<string, string>()

// The root folder GOOGLE_DRIVE_FOLDER_ID is the Security department's (alphaVison/security/uploads), so the
// security subfolders live inside it. The other departments' folders sit next to "security" instead, i.e.
// two levels up from the root. Falls back to the root if that location can't be resolved.
const DEPARTMENT_FOLDERS: DriveSubfolder[] = ['maintenance', 'meetings', 'hr', 'backups']
let departmentsParent: string | undefined

async function getDepartmentsParent(rootId: string): Promise<string> {
  if (departmentsParent) return departmentsParent
  const drive = getDriveClient()
  try {
    const securityId = (await drive.files.get({ fileId: rootId, fields: 'parents' })).data.parents?.[0]
    const topId = securityId ? (await drive.files.get({ fileId: securityId, fields: 'parents' })).data.parents?.[0] : undefined
    departmentsParent = topId ?? rootId
  } catch {
    return rootId // don't cache a failure
  }
  return departmentsParent
}

async function getOrCreateSubfolder(name: DriveSubfolder): Promise<string> {
  const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!rootId) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set')
  const parentId = DEPARTMENT_FOLDERS.includes(name) ? await getDepartmentsParent(rootId) : rootId
  const cacheKey = `${parentId}/${name}`
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey)!

  const drive = getDriveClient()
  const existing = await drive.files.list({
    q: `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  })
  let folderId = existing.data.files?.[0]?.id
  if (!folderId) {
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
    })
    folderId = created.data.id!
  }
  folderCache.set(cacheKey, folderId)
  return folderId
}

export type DriveSubfolder = 'entries' | 'incidents' | 'layout' | 'avatars' | 'maintenance' | 'clocking' | 'hr' | 'meetings' | 'backups'

// Lists the files directly inside a subfolder (used by the backup job to apply its retention rules).
export async function listDriveSubfolder(subfolder: DriveSubfolder): Promise<{ id: string; name: string }[]> {
  const drive = getDriveClient()
  const parentId = await getOrCreateSubfolder(subfolder)
  const out: { id: string; name: string }[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: 1000,
      pageToken,
    })
    for (const f of res.data.files ?? []) if (f.id && f.name) out.push({ id: f.id, name: f.name })
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return out
}

// Uploads a file into the given subfolder of the security photos root and
// returns its Drive file id. The file is left at Drive's default sharing
// (private to this account) — viewing goes through streamFromDrive() behind
// our own has_dept_access('security') check, not a public Drive link.
export async function uploadToDrive(buffer: Buffer, subfolder: DriveSubfolder, filename: string, mimeType = 'image/jpeg'): Promise<string> {
  const drive = getDriveClient()
  const parentId = await getOrCreateSubfolder(subfolder)
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id',
  })
  if (!res.data.id) throw new Error('Drive upload did not return a file id')
  return res.data.id
}

// Streams a file's bytes back out, for the photo proxy route. Returns the
// content type Drive has on record plus a Node Readable of the bytes.
export async function streamFromDrive(fileId: string): Promise<{ stream: NodeJS.ReadableStream; mimeType: string }> {
  const drive = getDriveClient()
  const meta = await drive.files.get({ fileId, fields: 'mimeType' })
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  return { stream: res.data as unknown as NodeJS.ReadableStream, mimeType: meta.data.mimeType || 'application/octet-stream' }
}

// Deletes a file from Drive outright (not just unlinking the DB row) —
// used when a document record is deleted, mirroring PMS's on-disk delete
// (DELETE /api/documents/[id] "removes row + unlinks file"). Swallows a
// 404 (already gone) so a stale reference never blocks the DB delete.
export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDriveClient()
  try {
    await drive.files.delete({ fileId })
  } catch (err: any) {
    if (err?.code !== 404) throw err
  }
}
