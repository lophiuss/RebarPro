'use server'

import { createClient } from '@/lib/supabase/server'
import { uploadToDrive, type DriveSubfolder } from '@/lib/google-drive'

async function requireSecurityAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'security' })
  if (!hasAccess) throw new Error('Not authorized')
}

// Uploads a photo (already compressed client-side) to the security
// department's Google Drive folder and returns the Drive file id to store
// on the entries/incidents/layout row. Re-checks department access itself —
// never trusts that only the security pages call this.
export async function uploadSecurityPhoto(formData: FormData): Promise<string> {
  await requireSecurityAccess()

  const file = formData.get('photo') as File | null
  const subfolder = formData.get('subfolder') as DriveSubfolder | null
  if (!file) throw new Error('No photo provided')
  if (!subfolder || !['entries', 'incidents', 'layout', 'avatars'].includes(subfolder)) {
    throw new Error('Invalid subfolder')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
  return uploadToDrive(buffer, subfolder, filename, file.type || 'image/jpeg')
}
