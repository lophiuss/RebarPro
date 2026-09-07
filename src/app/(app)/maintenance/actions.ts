'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/google-drive'

async function requireMaintenanceAccess() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
// people to populate a dropdown instead. RLS on user_department_access only
// lets an admin read every row in the department (a manager can only see
// their own), so this goes through the service-role client — gated on the
// caller actually having maintenance access first, same as every other
// action here.
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
  // full_name-or-email must match exactly what the signed-in technician's
  // own session resolves to (see work-requests/page.tsx's myIdentifier),
  // or "My Tasks" silently never finds their assigned rows.
  return (access || [])
    .map(a => ({ name: nameById.get(a.user_id) || emailById.get(a.user_id) || null, role: a.role }))
    .filter((p): p is StaffMember => !!p.name)
    .sort((a, b) => a.name.localeCompare(b.name))
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
