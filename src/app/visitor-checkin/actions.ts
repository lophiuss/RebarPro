'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Public, unauthenticated — anyone reaches this by scanning a QR code, no
// Supabase session at all. Used by visitors, drivers, and in-house staff
// alike: the person filling it in does not pick a category — a guard reviews
// what was filled in, can correct/complete it, and decides which group
// (Visitor / Delivery / In-House) they belong to before letting them in.
export async function submitVisitorCheckin(input: {
  personName: string
  company: string
  purpose: string
  lookingFor: string
  vehicleNo: string
  notes: string
  honeypot?: string
}): Promise<void> {
  // Silent reject for bot submissions filling in the honeypot
  if (input.honeypot) return

  const personName = input.personName?.trim().slice(0, 100)
  if (!personName) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin.from('security_entries').insert([{
    category: null,
    person_name: personName,
    company: input.company?.trim().slice(0, 100) || null,
    purpose: input.purpose?.trim().slice(0, 200) || null,
    looking_for: input.lookingFor?.trim().slice(0, 100) || null,
    vehicle_no: input.vehicleNo?.trim().slice(0, 50) || null,
    notes: input.notes?.trim().slice(0, 500) || null,
    status: 'pending',
    time_in: new Date().toISOString(),
    created_by: 'Visitor Kiosk',
  }])
  if (error) throw error
}
