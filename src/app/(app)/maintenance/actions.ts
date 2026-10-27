'use server'

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/google-drive'

async function requireMaintenanceAccess() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'maintenance' })
  if (!hasAccess) throw new Error('Not authorized')
  return { supabase, user }
}

export type StaffMember = { name: string; role: string }

// Work Requests are "assigned to" a free-text name (assigned_to), matched
// later against the signed-in technician's own display name to build their
// "My Tasks" list — a manager typing that name by hand is one typo away
// from it silently never matching. This lists real maintenance-department
// people to populate a dropdown instead.
export async function listMaintenanceStaff(): Promise<StaffMember[]> {
  await requireMaintenanceAccess()
  const admin = createAdminClient()
  const [{ data: access, error }, { data: authList }] = await Promise.all([
    admin.from('user_department_access').select('user_id, role').eq('department', 'maintenance'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (error) throw error
  const ids = (access || []).map(a => a.user_id)
  if (ids.length === 0) return []
  const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', ids)
  const nameById = new Map((profiles || []).map(p => [p.id, p.full_name]))
  const emailById = new Map(authList.users.map(u => [u.id, u.email]))
  return (access || [])
    .map(a => ({ name: nameById.get(a.user_id) || emailById.get(a.user_id) || null, role: a.role }))
    .filter((p): p is StaffMember => !!p.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Uploads a file (photo evidence, or a user-manual PDF) to the maintenance
// department's Google Drive folder.
// Photos are strictly capped at 200 KB per photo.
export async function uploadMaintenanceFile(formData: FormData): Promise<string> {
  await requireMaintenanceAccess()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')

  const isPdf = file.type === 'application/pdf'
  const MAX_PHOTO_BYTES = 200 * 1024 // 200 KB limit for photos
  if (!isPdf && file.size > MAX_PHOTO_BYTES) {
    throw new Error(`Photo exceeds the 200KB limit (${Math.round(file.size / 1024)}KB). Please try again.`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = isPdf ? 'pdf' : 'jpg'
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`
  return uploadToDrive(buffer, 'maintenance', filename, file.type || 'image/jpeg')
}
