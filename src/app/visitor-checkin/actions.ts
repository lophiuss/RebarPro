'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// Public, unauthenticated — a visitor reaches this by scanning a QR code, no
// Supabase session at all. Deliberately narrow: this only ever inserts a
// fixed set of fields into a 'pending' visitor row (never lets the caller
// set category, status, or any other column), so it can safely use the
// service-role client without opening up security_entries more broadly.
// A guard must still add a photo and approve it (see the Entries page)
// before the visitor is actually let in.
export async function submitVisitorCheckin(input: { personName: string; company: string; purpose: string; lookingFor: string; vehicleNo: string; notes: string }): Promise<void> {
  const personName = input.personName?.trim()
  if (!personName) throw new Error('Name is required')

  const admin = createAdminClient()
  const { error } = await admin.from('security_entries').insert([{
    category: 'visitor',
    person_name: personName,
    company: input.company?.trim() || null,
    purpose: input.purpose?.trim() || null,
    looking_for: input.lookingFor?.trim() || null,
    vehicle_no: input.vehicleNo?.trim() || null,
    notes: input.notes?.trim() || null,
    status: 'pending',
    time_in: new Date().toISOString(),
    created_by: 'Visitor Kiosk',
  }])
  if (error) throw error
}
