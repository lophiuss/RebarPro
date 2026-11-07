'use server'

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { uploadToDrive } from '@/lib/google-drive'
import { Readable } from 'node:stream'
import { revalidatePath } from 'next/cache'

async function requirePlantproAuth() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) throw new Error('Not signed in')
  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) throw new Error('Not authorized')

  const { data: isStaff } = await supabase.rpc('plantpro_is_staff')
  const { data: myWorkerId } = await supabase.rpc('plantpro_my_worker_id')
  return { supabase, user, isStaff: !!isStaff, myWorkerId: myWorkerId ? Number(myWorkerId) : null }
}

export type ApplyLeaveInput = {
  workerId?: number
  leaveTypeId: number
  startDate: string
  endDate: string
  durationMode: 'full_day' | 'half_am' | 'half_pm'
  reason: string
  attachmentDriveId?: string | null
  attachmentName?: string | null
}

export async function uploadLeaveAttachment(fd: FormData): Promise<{ ok: boolean; id?: string; name?: string; error?: string }> {
  try {
    const file = fd.get('file') as File | null
    if (!file) return { ok: false, error: 'No file uploaded' }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `leave_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const driveId = await uploadToDrive(buffer, 'hr', filename, file.type || 'application/pdf')
    return { ok: true, id: driveId, name: file.name }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to upload attachment' }
  }
}

export async function applyLeave(input: ApplyLeaveInput) {
  const { supabase, user, isStaff, myWorkerId } = await requirePlantproAuth()
  const targetWorkerId = input.workerId ? Number(input.workerId) : myWorkerId
  if (!targetWorkerId) throw new Error('Worker ID is required')

  if (!isStaff && targetWorkerId !== myWorkerId) {
    throw new Error('You may only apply leave for yourself.')
  }

  const { data: leaveType } = await supabase.from('plantpro_leave_types').select('*').eq('id', input.leaveTypeId).single()
  if (!leaveType) throw new Error('Invalid leave type')

  if (leaveType.requires_attachment && !input.attachmentDriveId) {
    throw new Error(`${leaveType.name} requires a medical certificate or supporting document upload.`)
  }

  // Calculate day count
  const start = new Date(input.startDate)
  const end = new Date(input.endDate)
  if (end < start) throw new Error('End date cannot be earlier than start date.')

  let daysCount = 0
  const cur = new Date(start)
  while (cur <= end) {
    // Skip Sundays
    if (cur.getDay() !== 0) {
      daysCount += input.durationMode === 'full_day' ? 1 : 0.5
    }
    cur.setDate(cur.getDate() + 1)
  }

  if (daysCount <= 0) {
    throw new Error('Leave date range contains no working days (e.g. only Sunday).')
  }

  // Check supervisor
  const { data: worker } = await supabase.from('plantpro_workers').select('supervisor_id, name').eq('id', targetWorkerId).single()

  const { data: request, error } = await supabase
    .from('plantpro_leave_requests')
    .insert({
      worker_id: targetWorkerId,
      supervisor_id: worker?.supervisor_id || null,
      leave_type_id: input.leaveTypeId,
      start_date: input.startDate,
      end_date: input.endDate,
      duration_mode: input.durationMode,
      days_count: daysCount,
      reason: input.reason.trim(),
      attachment_drive_id: input.attachmentDriveId || null,
      attachment_name: input.attachmentName || null,
      status: 'pending_supervisor',
      requested_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw error

  // Notify supervisor
  if (worker?.supervisor_id) {
    const { data: sup } = await supabase.from('plantpro_supervisors').select('linked_user_id').eq('id', worker.supervisor_id).single()
    if (sup?.linked_user_id) {
      await supabase.from('plantpro_notifications').insert({
        recipient_user_id: sup.linked_user_id,
        worker_id: targetWorkerId,
        category: 'leave',
        severity: 'info',
        title: 'New Leave Application',
        body: `${worker.name} applied for ${daysCount}d ${leaveType.name} (${input.startDate} to ${input.endDate}).`,
        action_url: `/plantpro/leave?tab=approvals&request=${request.id}`,
      })
    }
  }

  revalidatePath('/plantpro/leave')
  return { ok: true, requestId: request.id, daysCount }
}

export async function reviewLeaveRequest(input: {
  requestId: number
  tier: 'supervisor' | 'manager'
  decision: 'approve' | 'reject'
  note?: string
}) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  if (!isStaff) throw new Error('Only supervisors, managers or HR can review leave.')

  const { data: req } = await supabase
    .from('plantpro_leave_requests')
    .select('*, leave_type:plantpro_leave_types(*), worker:plantpro_workers(*)')
    .eq('id', input.requestId)
    .single()

  if (!req) throw new Error('Leave request not found')

  const now = new Date().toISOString()

  if (input.tier === 'supervisor') {
    if (input.decision === 'approve') {
      const { error } = await supabase
        .from('plantpro_leave_requests')
        .update({
          status: 'pending_hr_manager',
          supervisor_by: user.id,
          supervisor_at: now,
        })
        .eq('id', input.requestId)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('plantpro_leave_requests')
        .update({
          status: 'rejected',
          supervisor_by: user.id,
          supervisor_at: now,
          decision_note: input.note?.trim() || 'Rejected by supervisor.',
        })
        .eq('id', input.requestId)
      if (error) throw error
    }
  } else {
    // Final HR / Manager Decision
    if (input.decision === 'approve') {
      const { error } = await supabase
        .from('plantpro_leave_requests')
        .update({
          status: 'approved',
          decided_by: user.id,
          decided_at: now,
          decision_note: input.note?.trim() || null,
        })
        .eq('id', input.requestId)
      if (error) throw error

      // Auto-sync leave to plantpro_timesheet_days
      await syncLeaveToTimesheet(supabase, req)
    } else {
      const { error } = await supabase
        .from('plantpro_leave_requests')
        .update({
          status: 'rejected',
          decided_by: user.id,
          decided_at: now,
          decision_note: input.note?.trim() || 'Rejected by manager/HR.',
        })
        .eq('id', input.requestId)
      if (error) throw error
    }
  }

  // Notify worker of final status
  if (req.worker?.linked_user_id) {
    await supabase.from('plantpro_notifications').insert({
      recipient_user_id: req.worker.linked_user_id,
      worker_id: req.worker_id,
      category: 'leave',
      severity: input.decision === 'approve' ? 'info' : 'warning',
      title: `Leave Application ${input.decision === 'approve' ? 'Approved' : 'Rejected'}`,
      body: `Your leave request for ${req.days_count}d (${req.start_date}) has been ${input.decision === 'approve' ? 'approved' : 'rejected'}.`,
      action_url: `/plantpro/leave?tab=my_leave`,
    })
  }

  revalidatePath('/plantpro/leave')
  revalidatePath('/plantpro/timesheet')
  return { ok: true }
}

async function syncLeaveToTimesheet(supabase: any, req: any) {
  const isPaid = req.leave_type?.is_paid !== false
  const basicHoursPerDay = isPaid ? (req.duration_mode === 'full_day' ? 8 : 4) : 0

  const cur = new Date(req.start_date)
  const end = new Date(req.end_date)

  while (cur <= end) {
    if (cur.getDay() !== 0) {
      const iso = cur.toISOString().slice(0, 10)
      const month = iso.slice(0, 7)
      const day = iso.slice(8, 10)

      const { data: existing } = await supabase
        .from('plantpro_timesheet_days')
        .select('id, basic, ot')
        .eq('worker_id', req.worker_id)
        .eq('month', month)
        .eq('day', day)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('plantpro_timesheet_days')
          .update({ basic: basicHoursPerDay })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('plantpro_timesheet_days')
          .insert({
            worker_id: req.worker_id,
            month,
            day,
            basic: basicHoursPerDay,
            ot: 0,
          })
      }
    }
    cur.setDate(cur.getDate() + 1)
  }
}
