'use server'

import { createClient } from '@/lib/supabase/server'
import { uploadToDrive } from '@/lib/google-drive'

async function requireMaintenanceAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'maintenance' })
  if (!hasAccess) throw new Error('Not authorized')
}

// Uploads a file (photo evidence, already compressed client-side where
// applicable — or a user-manual PDF, uncompressed) to the maintenance
// department's Google Drive folder and returns the Drive file id. Re-checks
// department access itself — never trusts that only maintenance pages call
// this. Mirrors src/app/(app)/security/actions.ts's uploadSecurityPhoto.
export async function uploadMaintenanceFile(formData: FormData): Promise<string> {
  await requireMaintenanceAccess()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg'
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`
  return uploadToDrive(buffer, 'maintenance', filename, file.type || 'image/jpeg')
}
