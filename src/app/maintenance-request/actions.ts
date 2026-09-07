'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/google-drive'

// Public, unauthenticated — anyone on site reaches this via a shared
// link/QR, no Supabase session at all. Mirrors src/app/visitor-checkin's
// pattern exactly: deliberately narrow, only ever inserts a fixed set of
// fields into a 'pending' maintenance_work_requests row, so it can safely
// use the service-role client without opening that table up more broadly.
// The photo upload itself needs no Supabase auth (uploadToDrive only talks
// to Google, not Supabase) — safe here because this file's only export is
// this one narrow insert path, not a general-purpose upload endpoint.
export type PublicEquipmentOption = { id: number; name: string; category: string | null }

// Read-only, narrow (id/name/category only — no location, ownership, or
// anything else) equipment list for the public form's category -> item
// picker. Needs the service-role client since an anonymous visitor has no
// session at all, so no RLS-satisfying request is possible; kept safe by
// only ever selecting these three columns and excluding retired/spoiled
// equipment, same as the logged-in Equipment list's own default.
export async function listPublicEquipmentOptions(): Promise<PublicEquipmentOption[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('maintenance_equipment')
    .select('id, name, category')
    .eq('is_active', true)
    .or('condition.neq.spoil,condition.is.null')
    .order('name')
  if (error) throw error
  return data || []
}

export async function submitWorkRequest(input: {
  requesterName: string
  requesterContact: string
  location: string
  equipmentId?: string
  issueDescription: string
  photoDataUrl?: string
}): Promise<void> {
  const requesterName = input.requesterName?.trim()
  const issueDescription = input.issueDescription?.trim()
  if (!requesterName) throw new Error('Name is required')
  if (!issueDescription) throw new Error('Please describe the issue')

  let photo_drive_id: string | null = null
  if (input.photoDataUrl) {
    const match = input.photoDataUrl.match(/^data:(.+);base64,(.*)$/)
    if (match) {
      const [, mimeType, base64] = match
      const buffer = Buffer.from(base64, 'base64')
      const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
      photo_drive_id = await uploadToDrive(buffer, 'maintenance', filename, mimeType || 'image/jpeg')
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('maintenance_work_requests').insert([{
    requester_name: requesterName,
    requester_contact: input.requesterContact?.trim() || null,
    location: input.location?.trim() || null,
    equipment_id: input.equipmentId ? Number(input.equipmentId) : null,
    issue_description: issueDescription,
    photo_drive_id,
    status: 'pending',
  }])
  if (error) throw error
}
