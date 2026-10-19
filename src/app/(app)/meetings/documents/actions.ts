'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsAccess, requireMeetingsManager } from '../guard'
import { DOC_DEPARTMENTS } from '@/lib/meetings'
import { uploadToDrive, deleteFromDrive } from '@/lib/google-drive'

// Only http(s) links are stored, so a document can never carry a javascript:
// or data: URL that would run when someone clicks it.
function cleanUrl(raw: string) {
  const v = raw.trim()
  if (!v) return null
  let u: URL
  try { u = new URL(v) } catch { throw new Error('Enter a full link starting with https://') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Only http(s) links are allowed')
  return u.toString()
}

// Uploaded files live in Google Drive (same account and folder as Security / HR / Maintenance) and are
// recorded as file_path = 'drive:<file id>'. They are read back only through /api/meetings/file/<id>,
// which checks the signed-in person can see the document row (so meeting membership still applies).
const DRIVE_PREFIX = 'drive:'

const MAX_BYTES = 25 * 1024 * 1024
// Types that are safe to show inside the browser; everything else downloads.
const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']

export async function addDocument(input: {
  title: string; description: string; url: string; category: string; meeting_id: string | null; department?: string | null
  file?: { path: string; name: string; size: number; type: string } | null
}) {
  const { supabase, user } = await requireMeetingsAccess()
  const title = input.title.trim()
  if (!title) throw new Error('Title is required')
  const url = cleanUrl(input.url)
  const file = input.file ?? null
  if (!file && !url) throw new Error('Upload a file or paste a link')
  if (file) {
    // The browser uploads straight to storage under the person's own folder; check it.
    if (!file.path.startsWith(`${user.id}/`) || file.path.includes('..')) throw new Error('Invalid file location')
    if (!(file.size > 0) || file.size > MAX_BYTES) throw new Error('Files can be up to 25 MB')
  }
  // The browser uploaded to temporary storage; move the file into Drive. If Drive is unavailable the
  // file simply stays in storage and keeps working.
  let storedPath = file?.path ?? null
  if (file && storedPath) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from('meeting-docs').download(storedPath)
      if (dlErr || !blob) throw dlErr ?? new Error('download failed')
      const driveId = await uploadToDrive(Buffer.from(await blob.arrayBuffer()), 'meetings', file.name.slice(0, 200), file.type || 'application/octet-stream')
      await supabase.storage.from('meeting-docs').remove([storedPath])
      storedPath = DRIVE_PREFIX + driveId
    } catch (err) {
      console.error('meeting document: Drive copy failed, keeping the file in storage:', err)
    }
  }
  const { error } = await supabase.from('mtg_documents').insert({
    title: title.slice(0, 200),
    description: input.description.trim().slice(0, 2000) || null,
    url,
    category: input.category.trim().slice(0, 60) || null,
    meeting_id: input.meeting_id || null,
    department: DOC_DEPARTMENTS.includes(input.department ?? '') ? input.department : null,
    created_by: user.id,
    file_path: storedPath,
    file_name: file ? file.name.slice(0, 200) : null,
    file_size: file?.size ?? null,
    mime_type: file ? file.type.slice(0, 100) : null,
  })
  if (error) throw error
  revalidatePath('/meetings/documents')
  revalidatePath('/meetings/[id]', 'page')
}

// A short-lived link to an uploaded file. PDFs and images open in the browser;
// anything else is forced to download so it can never run as a web page.
export async function getDocumentUrl(id: string) {
  const { supabase } = await requireMeetingsAccess()
  const { data: doc } = await supabase.from('mtg_documents').select('file_path, file_name, mime_type').eq('id', id).maybeSingle()
  if (!doc?.file_path) throw new Error('This document has no uploaded file')
  if (doc.file_path.startsWith(DRIVE_PREFIX)) return `/api/meetings/file/${encodeURIComponent(doc.file_path.slice(DRIVE_PREFIX.length))}`
  const inline = INLINE_TYPES.includes(doc.mime_type ?? '')
  const { data, error } = await supabase.storage.from('meeting-docs').createSignedUrl(doc.file_path, 120, inline ? undefined : { download: doc.file_name ?? true })
  if (error || !data) throw new Error('Could not open the file')
  return data.signedUrl
}

export async function deleteDocument(id: string) {
  const { supabase, user } = await requireMeetingsAccess()
  const { data: doc } = await supabase.from('mtg_documents').select('created_by, file_path').eq('id', id).maybeSingle()
  if (!doc) return
  if (doc.created_by !== user.id) await requireMeetingsManager()
  const { error } = await supabase.from('mtg_documents').delete().eq('id', id)
  if (error) throw error
  if (doc.file_path?.startsWith(DRIVE_PREFIX)) await deleteFromDrive(doc.file_path.slice(DRIVE_PREFIX.length)).catch(err => console.error('Drive delete failed:', err))
  else if (doc.file_path) await supabase.storage.from('meeting-docs').remove([doc.file_path])
  revalidatePath('/meetings/documents')
  revalidatePath('/meetings/[id]', 'page')
}
