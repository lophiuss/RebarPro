'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { uploadToDrive } from '@/lib/google-drive'

// Public, unauthenticated — anyone on site reaches this via a shared
// link/QR, no Supabase session at all. Deliberately narrow, only ever inserts
// a fixed set of fields into a 'pending' maintenance_work_requests row, so it can safely
// use the service-role client without opening that table up more broadly.
// Photos are strictly capped at 200 KB.
export type PublicEquipmentOption = { id: number; name: string; category: string | null }

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
  const requesterName = input.requesterName?.trim().slice(0, 100)
  const issueDescription = input.issueDescription?.trim().slice(0, 2000)
  if (!requesterName) throw new Error('Name is required')
  if (!issueDescription) throw new Error('Please describe the issue')

  let photo_drive_id: string | null = null
  if (input.photoDataUrl) {
    const match = input.photoDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/)
    if (!match) throw new Error('The photo must be a JPEG, PNG or WebP image')
    
    const [, mimeType, base64] = match
    const buffer = Buffer.from(base64, 'base64')
    const MAX_PHOTO_BYTES = 200 * 1024 // 200 KB per photo limit
    if (buffer.length > MAX_PHOTO_BYTES) {
      throw new Error(`The photo is too large (${Math.round(buffer.length / 1024)}KB). Maximum allowed size is 200KB per photo.`)
    }
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`
    photo_drive_id = await uploadToDrive(buffer, 'maintenance', filename, mimeType || 'image/jpeg')
  }

  const admin = createAdminClient()
  const { error } = await admin.from('maintenance_work_requests').insert([{
    requester_name: requesterName,
    requester_contact: input.requesterContact?.trim().slice(0, 50) || null,
    location: input.location?.trim().slice(0, 100) || null,
    equipment_id: input.equipmentId ? Number(input.equipmentId) : null,
    issue_description: issueDescription,
    photo_drive_id,
    status: 'pending',
  }])
  if (error) throw error
}
