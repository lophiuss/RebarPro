'use server'

import { createClient } from '@/lib/supabase/server'
import { uploadToDrive, type DriveSubfolder } from '@/lib/google-drive'

async function requireSecurityAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in — please log in again.')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'security' })
  if (!hasAccess) throw new Error('Not authorized')
}

// Never throws to the browser: in production Next.js replaces the message of an exception thrown from a Server
// Action with a generic one, which the page then shows as "Minified React error #441" — no way to tell a bad
// login from a Google Drive hiccup. A returned value is not redacted, so the real reason reaches the guard's phone.
export type UploadResult = { ok: true; id: string } | { ok: false; error: string }

// Uploads a photo (already compressed client-side) to the security
// department's Google Drive folder and returns the Drive file id to store
// on the entries/incidents/layout row. Re-checks department access itself —
// never trusts that only the security pages call this.
export async function uploadSecurityPhoto(formData: FormData): Promise<UploadResult> {
  try {
    await requireSecurityAccess()

    const file = formData.get('photo') as File | null
    const subfolder = formData.get('subfolder') as DriveSubfolder | null
    if (!file) return { ok: false, error: 'No photo provided' }
    if (!subfolder || !['entries', 'incidents', 'layout', 'avatars', 'clocking'].includes(subfolder)) {
      return { ok: false, error: 'Invalid subfolder' }
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
    return { ok: true, id: await uploadToDrive(buffer, subfolder, filename, file.type || 'image/jpeg') }
  } catch (err: any) {
    console.error('[uploadSecurityPhoto] failed:', err?.code, err?.message)
    const msg = String(err?.message ?? err)
    return { ok: false, error: /Not signed in|Not authorized/.test(msg) ? msg : `Photo storage (Google Drive) failed: ${msg.slice(0, 200)}` }
  }
}
