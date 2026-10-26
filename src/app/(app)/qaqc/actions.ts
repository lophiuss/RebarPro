'use server'

import { requireQaqcAccess } from './guard'
import { revalidatePath } from 'next/cache'

export type QaqcTestInput = {
  project: string
  supplier: string
  marking?: string | null
  test_type: string
  date_cast?: string | null
  date_test: string
  report_no?: string | null
  email_date?: string | null
  qaqc_remarks?: string | null
  po_no?: string | null
  po_date?: string | null
  po_amount?: number | null
  purchaser_remarks?: string | null
  invoice_no?: string | null
  invoice_date?: string | null
  invoice_amount?: number | null
  payment_status?: 'Pending' | 'Paid' | 'Partially Paid' | 'Void'
  payment_date?: string | null
  account_remarks?: string | null
}

async function generateNextRunningNo(supabase: any, year: number): Promise<string> {
  // Try Postgres RPC first
  try {
    const { data, error } = await supabase.rpc('qaqc_next_running_no', { p_year: year })
    if (!error && data) return data as string
  } catch {
    // Fall back to table query
  }

  // Fallback: Query the latest running number for this year
  const prefix = `QAQC-${year}-`
  const { data: latest } = await supabase
    .from('qaqc_tests')
    .select('running_no')
    .like('running_no', `${prefix}%`)
    .order('running_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (latest?.running_no) {
    const parts = latest.running_no.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextSeq = lastNum + 1
  }

  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

export async function createQaqcTest(input: QaqcTestInput) {
  const { supabase, user } = await requireQaqcAccess()

  const year = input.date_test ? new Date(input.date_test).getFullYear() : new Date().getFullYear()
  const runningNo = await generateNextRunningNo(supabase, year)

  // Auto-register new test type if provided
  if (input.test_type?.trim()) {
    const trimmed = input.test_type.trim()
    supabase.from('qaqc_test_types').insert({ name: trimmed }).maybeSingle().then(() => {})
  }

  // Auto-register new supplier if provided
  if (input.supplier?.trim()) {
    const trimmed = input.supplier.trim()
    supabase.from('qaqc_suppliers').insert({ name: trimmed }).maybeSingle().then(() => {})
  }

  const { data, error } = await supabase
    .from('qaqc_tests')
    .insert({
      running_no: runningNo,
      project: input.project.trim(),
      supplier: input.supplier.trim(),
      marking: input.marking?.trim() || null,
      test_type: input.test_type.trim(),
      date_cast: input.date_cast || null,
      date_test: input.date_test,
      report_no: input.report_no?.trim() || null,
      email_date: input.email_date || null,
      qaqc_remarks: input.qaqc_remarks?.trim() || null,
      po_no: input.po_no?.trim() || null,
      po_date: input.po_date || null,
      po_amount: input.po_amount ?? null,
      purchaser_remarks: input.purchaser_remarks?.trim() || null,
      invoice_no: input.invoice_no?.trim() || null,
      invoice_date: input.invoice_date || null,
      invoice_amount: input.invoice_amount ?? null,
      payment_status: input.payment_status || 'Pending',
      payment_date: input.payment_date || null,
      account_remarks: input.account_remarks?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) throw error

  revalidatePath('/qaqc/records')
  revalidatePath('/qaqc/dashboard')
  return data
}

export async function bulkCreateQaqcTests(items: QaqcTestInput[]) {
  const { supabase, user } = await requireQaqcAccess()
  if (!items.length) return []

  const currentYear = new Date().getFullYear()
  // Determine year for each or group by year
  const prefix = `QAQC-${currentYear}-`

  // Get current highest number for current year
  const { data: latest } = await supabase
    .from('qaqc_tests')
    .select('running_no')
    .like('running_no', `${prefix}%`)
    .order('running_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextSeq = 1
  if (latest?.running_no) {
    const parts = latest.running_no.split('-')
    const lastNum = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastNum)) nextSeq = lastNum + 1
  }

  // Also extract test types and suppliers to auto-register
  const uniqueTestTypes = new Set<string>()
  const uniqueSuppliers = new Set<string>()

  const rows = items.map((item, idx) => {
    const seq = nextSeq + idx
    const runningNo = `${prefix}${String(seq).padStart(4, '0')}`
    if (item.test_type?.trim()) uniqueTestTypes.add(item.test_type.trim())
    if (item.supplier?.trim()) uniqueSuppliers.add(item.supplier.trim())

    return {
      running_no: runningNo,
      project: item.project.trim(),
      supplier: item.supplier.trim(),
      marking: item.marking?.trim() || null,
      test_type: item.test_type.trim(),
      date_cast: item.date_cast || null,
      date_test: item.date_test || new Date().toISOString().slice(0, 10),
      report_no: item.report_no?.trim() || null,
      email_date: item.email_date || null,
      qaqc_remarks: item.qaqc_remarks?.trim() || null,
      po_no: item.po_no?.trim() || null,
      po_date: item.po_date || null,
      po_amount: item.po_amount ?? null,
      purchaser_remarks: item.purchaser_remarks?.trim() || null,
      invoice_no: item.invoice_no?.trim() || null,
      invoice_date: item.invoice_date || null,
      invoice_amount: item.invoice_amount ?? null,
      payment_status: item.payment_status || 'Pending',
      payment_date: item.payment_date || null,
      account_remarks: item.account_remarks?.trim() || null,
      created_by: user.id,
    }
  })

  // Save new test types & suppliers in background
  if (uniqueTestTypes.size > 0) {
    const typeRows = Array.from(uniqueTestTypes).map(name => ({ name }))
    supabase.from('qaqc_test_types').upsert(typeRows, { onConflict: 'name', ignoreDuplicates: true }).then(() => {})
  }
  if (uniqueSuppliers.size > 0) {
    const supRows = Array.from(uniqueSuppliers).map(name => ({ name }))
    supabase.from('qaqc_suppliers').upsert(supRows, { onConflict: 'name', ignoreDuplicates: true }).then(() => {})
  }

  const { data, error } = await supabase.from('qaqc_tests').insert(rows).select()
  if (error) throw error

  revalidatePath('/qaqc/records')
  revalidatePath('/qaqc/dashboard')
  return data
}

export async function updateQaqcTest(id: number, patch: Partial<QaqcTestInput>) {
  const { supabase } = await requireQaqcAccess()

  const cleanPatch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  const fields: (keyof QaqcTestInput)[] = [
    'project', 'supplier', 'marking', 'test_type', 'date_cast', 'date_test',
    'report_no', 'email_date', 'qaqc_remarks', 'po_no', 'po_date', 'po_amount',
    'purchaser_remarks', 'invoice_no', 'invoice_date', 'invoice_amount',
    'payment_status', 'payment_date', 'account_remarks',
  ]

  for (const f of fields) {
    if (patch[f] !== undefined) {
      cleanPatch[f] = patch[f]
    }
  }

  const { data, error } = await supabase
    .from('qaqc_tests')
    .update(cleanPatch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  revalidatePath('/qaqc/records')
  revalidatePath('/qaqc/dashboard')
  return data
}

export async function deleteQaqcTest(id: number) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_tests').delete().eq('id', id)
  if (error) throw error

  revalidatePath('/qaqc/records')
  revalidatePath('/qaqc/dashboard')
}

// ---------------------------------------------------------------------------
// Settings: Test Types & Suppliers
// ---------------------------------------------------------------------------

export async function createQaqcTestType(name: string, category = 'General', standard_cost = 0) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_test_types').insert({
    name: name.trim(),
    category: category.trim() || 'General',
    standard_cost: Number(standard_cost) || 0,
    status: 'Active',
  })
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

export async function updateQaqcTestType(id: number, patch: { name?: string; category?: string; standard_cost?: number; status?: 'Active' | 'Inactive' }) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_test_types').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

export async function deleteQaqcTestType(id: number) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_test_types').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

export async function createQaqcSupplier(name: string, contact_person = '', phone = '', email = '') {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_suppliers').insert({
    name: name.trim(),
    contact_person: contact_person.trim() || null,
    phone: phone.trim() || null,
    email: email.trim() || null,
    status: 'Active',
  })
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

export async function updateQaqcSupplier(id: number, patch: { name?: string; contact_person?: string; phone?: string; email?: string; status?: 'Active' | 'Inactive' }) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_suppliers').update(patch).eq('id', id)
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

export async function deleteQaqcSupplier(id: number) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_suppliers').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/qaqc/settings')
  revalidatePath('/qaqc/records')
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export async function upsertQaqcTarget(project: string, month: string, test_count_target: number, spend_target: number) {
  const { supabase } = await requireQaqcAccess()
  const { error } = await supabase.from('qaqc_targets').upsert(
    {
      project: project.trim(),
      month,
      test_count_target: Number(test_count_target) || 0,
      spend_target: Number(spend_target) || 0,
    },
    { onConflict: 'project,month' }
  )
  if (error) throw error
  revalidatePath('/qaqc/targets')
  revalidatePath('/qaqc/dashboard')
}
