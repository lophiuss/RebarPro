'use server'

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
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

export type AllocateOtInput = {
  workerIds: number[]
  dates: string[]
  taskTypeId: number
  projectId?: number | null
  plannedMinutes: number
  startTime?: string | null
  endTime?: string | null
  instructions?: string | null
  capOverrideReason?: string | null
}

export async function allocateOtPlans(input: AllocateOtInput) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  if (!isStaff) throw new Error('Only supervisors or managers can allocate OT.')

  const { data: policy } = await supabase.from('plantpro_ot_policies').select('*').eq('id', 1).single()
  const monthlyCap = Number(policy?.monthly_cap_hours || 104)

  const rowsToInsert: any[] = []
  const capWarnings: string[] = []

  for (const workerId of input.workerIds) {
    const { data: worker } = await supabase
      .from('plantpro_workers')
      .select('name, supervisor_id')
      .eq('id', workerId)
      .single()

    for (const date of input.dates) {
      // Check leave conflict
      const { data: existingLeave } = await supabase
        .from('plantpro_leave_requests')
        .select('id, leave_type:plantpro_leave_types(name)')
        .eq('worker_id', workerId)
        .eq('status', 'approved')
        .lte('start_date', date)
        .gte('end_date', date)
        .maybeSingle()

      if (existingLeave) {
        capWarnings.push(`${worker?.name || workerId} has approved leave on ${date} (${(existingLeave.leave_type as any)?.name || 'Leave'})`)
      }

      // Check current month hours
      const month = date.slice(0, 7)
      const { data: existingSessions } = await supabase
        .from('plantpro_ot_sessions')
        .select('raw_minutes, eligible_minutes, confirmed_minutes, approved_minutes, status')
        .eq('worker_id', workerId)
        .gte('work_date', `${month}-01`)
        .lte('work_date', `${month}-31`)

      let currentMonthMinutes = 0
      for (const s of existingSessions || []) {
        if (s.status === 'approved') {
          currentMonthMinutes += s.approved_minutes || 0
        } else if (['active', 'pending_supervisor', 'pending_manager'].includes(s.status)) {
          currentMonthMinutes += s.confirmed_minutes || s.eligible_minutes || s.raw_minutes || 0
        }
      }

      const projectedTotalHours = (currentMonthMinutes + input.plannedMinutes) / 60
      if (projectedTotalHours > monthlyCap && !input.capOverrideReason) {
        throw new Error(`Worker ${worker?.name || workerId} exceeds monthly OT cap of ${monthlyCap}h (Projected: ${projectedTotalHours.toFixed(1)}h). An explicit Cap Override Reason is required to allocate.`)
      }

      rowsToInsert.push({
        worker_id: workerId,
        supervisor_id: worker?.supervisor_id || null,
        project_id: input.projectId || null,
        task_type_id: input.taskTypeId,
        work_date: date,
        planned_start_time: input.startTime || '17:00',
        planned_end_time: input.endTime || null,
        planned_minutes: input.plannedMinutes,
        instructions: input.instructions || null,
        cap_override_reason: input.capOverrideReason || null,
        allocated_by: user.id,
      })
    }
  }

  const { error } = await supabase
    .from('plantpro_ot_plans')
    .upsert(rowsToInsert, { onConflict: 'worker_id,work_date,task_type_id' })

  if (error) throw error

  revalidatePath('/plantpro/ot-live')
  return { ok: true, allocatedCount: rowsToInsert.length, warnings: capWarnings }
}

export type StartOtClockPayload = {
  workerId?: number
  planId?: number | null
  taskTypeId: number
  projectId?: number | null
  inMethod: 'ble_beacon' | 'gps_geofence' | 'kiosk_qr' | 'outstation' | 'manual_adjustment'
  entryMode: 'self_phone' | 'kiosk' | 'supervisor_assisted'
  inLat?: number | null
  inLng?: number | null
  inAccuracyM?: number | null
  isOutstation?: boolean
  outstationLocation?: string | null
  startPhotoDriveId?: string | null
}

export async function startOtClock(payload: StartOtClockPayload) {
  const { supabase, user, isStaff, myWorkerId } = await requirePlantproAuth()
  const targetWorkerId = payload.workerId ? Number(payload.workerId) : myWorkerId
  if (!targetWorkerId) throw new Error('Worker ID is required')

  if (!isStaff && targetWorkerId !== myWorkerId) {
    throw new Error('You may only clock OT for yourself.')
  }

  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)

  // Check if active OT session already open
  const { data: existingActive } = await supabase
    .from('plantpro_ot_sessions')
    .select('id')
    .eq('worker_id', targetWorkerId)
    .eq('work_date', todayIso)
    .eq('status', 'active')
    .maybeSingle()

  if (existingActive) {
    throw new Error('Worker already has an active overtime session in progress.')
  }

  const { data: policy } = await supabase.from('plantpro_ot_policies').select('*').eq('id', 1).single()
  const exceptionFlags: string[] = []

  // Check plan allocation
  let planId = payload.planId || null
  let supervisorId: number | null = null
  let projectId = payload.projectId || null

  const { data: worker } = await supabase
    .from('plantpro_workers')
    .select('supervisor_id')
    .eq('id', targetWorkerId)
    .single()
  supervisorId = worker?.supervisor_id || null

  if (planId) {
    const { data: plan } = await supabase.from('plantpro_ot_plans').select('*').eq('id', planId).single()
    if (plan) {
      if (plan.project_id && !projectId) projectId = plan.project_id
      if (plan.supervisor_id) supervisorId = plan.supervisor_id
      await supabase.from('plantpro_ot_plans').update({ status: 'in_progress' }).eq('id', plan.id)
    }
  } else {
    // Check if matching plan exists for today
    const { data: matchPlan } = await supabase
      .from('plantpro_ot_plans')
      .select('id, project_id, supervisor_id')
      .eq('worker_id', targetWorkerId)
      .eq('work_date', todayIso)
      .eq('task_type_id', payload.taskTypeId)
      .maybeSingle()

    if (matchPlan) {
      planId = matchPlan.id
      if (matchPlan.project_id && !projectId) projectId = matchPlan.project_id
      if (matchPlan.supervisor_id) supervisorId = matchPlan.supervisor_id
      await supabase.from('plantpro_ot_plans').update({ status: 'in_progress' }).eq('id', matchPlan.id)
    } else if (!policy?.allow_unplanned_ot) {
      exceptionFlags.push('unplanned_ot')
    }
  }

  // Check task type photo requirement
  const { data: taskType } = await supabase.from('plantpro_ot_task_types').select('*').eq('id', payload.taskTypeId).single()
  if (taskType?.requires_start_photo && !payload.startPhotoDriveId) {
    exceptionFlags.push('missing_start_photo')
  }

  if (payload.isOutstation) {
    exceptionFlags.push('outstation')
  }

  const { data: session, error } = await supabase
    .from('plantpro_ot_sessions')
    .insert({
      plan_id: planId,
      worker_id: targetWorkerId,
      supervisor_id: supervisorId,
      project_id: projectId,
      task_type_id: payload.taskTypeId,
      work_date: todayIso,
      check_in_at: now.toISOString(),
      entry_mode: payload.entryMode,
      in_method: payload.inMethod,
      in_lat: payload.inLat || null,
      in_lng: payload.inLng || null,
      in_accuracy_m: payload.inAccuracyM || null,
      is_outstation: !!payload.isOutstation,
      outstation_location: payload.outstationLocation || null,
      exception_flags: exceptionFlags,
      status: 'active',
      submission_count: 1,
    })
    .select('id')
    .single()

  if (error) throw error

  if (payload.startPhotoDriveId) {
    await supabase.from('plantpro_ot_evidence').insert({
      ot_session_id: session.id,
      stage: 'start',
      photo_drive_id: payload.startPhotoDriveId,
      lat: payload.inLat || null,
      lng: payload.inLng || null,
      uploaded_by: user.id,
    })
  }

  revalidatePath('/plantpro/ot-live')
  return { ok: true, sessionId: session.id }
}

export type FinishOtClockPayload = {
  sessionId: number
  outMethod: 'ble_beacon' | 'gps_geofence' | 'kiosk_qr' | 'outstation' | 'manual_adjustment'
  outLat?: number | null
  outLng?: number | null
  finishPhotoDriveId?: string | null
  completionNotes: string
  cameraExceptionReason?: string | null
}

export async function finishOtClock(payload: FinishOtClockPayload) {
  const { supabase, user, isStaff, myWorkerId } = await requirePlantproAuth()
  const now = new Date()

  const { data: session, error: findErr } = await supabase
    .from('plantpro_ot_sessions')
    .select('*, task_type:plantpro_ot_task_types(*), plan:plantpro_ot_plans(*)')
    .eq('id', payload.sessionId)
    .single()

  if (findErr || !session) throw new Error('OT session not found')
  if (!isStaff && session.worker_id !== myWorkerId) {
    throw new Error('You may only clock out your own overtime session.')
  }

  const { data: policy } = await supabase.from('plantpro_ot_policies').select('*').eq('id', 1).single()
  const thresholdMins = policy?.eligibility_threshold_minutes || 60
  const eligMethod = policy?.eligibility_method || 'minimum_only'

  const checkInTime = new Date(session.check_in_at).getTime()
  const checkOutTime = now.getTime()
  const rawMinutes = Math.max(Math.round((checkOutTime - checkInTime) / (1000 * 60)), 0)

  // Compute eligible minutes based on KomotApp policy
  let eligibleMinutes = 0
  if (rawMinutes >= thresholdMins) {
    if (eligMethod === 'deduct_threshold') {
      eligibleMinutes = rawMinutes - thresholdMins
    } else {
      eligibleMinutes = rawMinutes
    }
  }

  const exceptionFlags = [...(session.exception_flags || [])]

  // Check finish photo requirement
  if (session.task_type?.requires_finish_photo && !payload.finishPhotoDriveId && !payload.cameraExceptionReason) {
    exceptionFlags.push('missing_finish_photo')
  }

  if (payload.cameraExceptionReason) {
    exceptionFlags.push('evidence_exception')
  }

  // Check long session vs planned limit
  const plannedMinutes = session.plan?.planned_minutes || (policy?.daily_ot_cap_hours ? policy.daily_ot_cap_hours * 60 : 240)
  if (rawMinutes > plannedMinutes + 30) {
    exceptionFlags.push('long_session')
  } else if (rawMinutes < plannedMinutes - 45 && rawMinutes > 30) {
    exceptionFlags.push('short_session')
  }

  // Check overnight session crossing midnight
  const inDate = session.check_in_at.slice(0, 10)
  const outDate = now.toISOString().slice(0, 10)
  if (inDate !== outDate) {
    exceptionFlags.push('overnight')
  }

  const { error: updateErr } = await supabase
    .from('plantpro_ot_sessions')
    .update({
      check_out_at: now.toISOString(),
      out_method: payload.outMethod,
      out_lat: payload.outLat || null,
      out_lng: payload.outLng || null,
      raw_minutes: rawMinutes,
      eligible_minutes: eligibleMinutes,
      completion_notes: payload.completionNotes.trim(),
      camera_exception_reason: payload.cameraExceptionReason?.trim() || null,
      exception_flags: Array.from(new Set(exceptionFlags)),
      status: 'pending_supervisor',
    })
    .eq('id', session.id)

  if (updateErr) throw updateErr

  if (payload.finishPhotoDriveId) {
    await supabase.from('plantpro_ot_evidence').insert({
      ot_session_id: session.id,
      stage: 'finish',
      photo_drive_id: payload.finishPhotoDriveId,
      lat: payload.outLat || null,
      lng: payload.outLng || null,
      uploaded_by: user.id,
    })
  }

  if (session.plan_id) {
    await supabase.from('plantpro_ot_plans').update({ status: 'completed' }).eq('id', session.plan_id)
  }

  // Notify Supervisor of submission
  if (session.supervisor_id) {
    const { data: sup } = await supabase.from('plantpro_supervisors').select('linked_user_id, name').eq('id', session.supervisor_id).single()
    if (sup?.linked_user_id) {
      await supabase.from('plantpro_notifications').insert({
        recipient_user_id: sup.linked_user_id,
        worker_id: session.worker_id,
        category: 'ot_review',
        severity: 'info',
        title: 'Overtime Submitted for Review',
        body: `Worker submitted ${(rawMinutes / 60).toFixed(1)}h OT for ${session.work_date}. Tap to review.`,
        action_url: `/plantpro/ot-live?tab=approvals&session=${session.id}`,
      })
    }
  }

  revalidatePath('/plantpro/ot-live')
  return { ok: true, rawMinutes, eligibleMinutes }
}

// Supervisor 1st-tier review
export async function reviewOtSessionSupervisor(input: {
  sessionId: number
  action: 'confirm' | 'return'
  confirmedMinutes?: number
  remarks?: string
}) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  if (!isStaff) throw new Error('Only supervisors or managers can review overtime.')

  const { data: session } = await supabase.from('plantpro_ot_sessions').select('*').eq('id', input.sessionId).single()
  if (!session) throw new Error('Session not found')

  const now = new Date().toISOString()

  if (input.action === 'return') {
    // Return for clarification
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        status: 'returned',
        supervisor_remarks: input.remarks || 'Clarification needed.',
        supervisor_reviewed_by: user.id,
        supervisor_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error

    // Notify worker
    const { data: worker } = await supabase.from('plantpro_workers').select('linked_user_id').eq('id', session.worker_id).single()
    if (worker?.linked_user_id) {
      await supabase.from('plantpro_notifications').insert({
        recipient_user_id: worker.linked_user_id,
        worker_id: session.worker_id,
        category: 'ot_review',
        severity: 'warning',
        title: 'OT Returned for Clarification',
        body: input.remarks || 'Please provide details and resubmit your overtime clocking.',
        action_url: `/plantpro/ot-live?tab=my_ot&session=${session.id}`,
      })
    }
  } else {
    // Supervisor confirms hours and passes to manager
    const confirmedMins = input.confirmedMinutes !== undefined ? input.confirmedMinutes : session.eligible_minutes
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        confirmed_minutes: confirmedMins,
        status: 'pending_manager',
        supervisor_remarks: input.remarks || null,
        supervisor_reviewed_by: user.id,
        supervisor_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error
  }

  revalidatePath('/plantpro/ot-live')
  return { ok: true }
}

// Manager 2nd-tier final review & auto-sync to timesheet
export async function reviewOtSessionManager(input: {
  sessionId: number
  action: 'approve' | 'return' | 'reject' | 'revoke'
  approvedMinutes?: number
  remarks?: string
}) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  const { data: isOtApprover } = await supabase.rpc('plantpro_is_ot_approver')
  if (!isOtApprover) throw new Error('Only Managers or Admins can grant final OT approval.')

  const { data: session } = await supabase.from('plantpro_ot_sessions').select('*').eq('id', input.sessionId).single()
  if (!session) throw new Error('Session not found')

  const now = new Date().toISOString()

  if (input.action === 'approve') {
    const approvedMins = input.approvedMinutes !== undefined ? input.approvedMinutes : (session.confirmed_minutes || session.eligible_minutes)
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        approved_minutes: approvedMins,
        status: 'approved',
        manager_remarks: input.remarks || null,
        manager_reviewed_by: user.id,
        manager_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error

    // Auto-sync approved OT hours to plantpro_timesheet_days
    await syncApprovedOtToTimesheet(supabase, session.worker_id, session.work_date, session.project_id)
  } else if (input.action === 'revoke') {
    // Manager revokes an already-approved record back to review
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        status: 'pending_supervisor',
        manager_remarks: input.remarks ? `Revoked: ${input.remarks}` : 'Approved status revoked for 2nd review.',
        manager_reviewed_by: user.id,
        manager_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error
    await syncApprovedOtToTimesheet(supabase, session.worker_id, session.work_date, session.project_id)
  } else if (input.action === 'return') {
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        status: 'returned',
        manager_remarks: input.remarks || 'Returned by manager for clarification.',
        manager_reviewed_by: user.id,
        manager_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error
  } else if (input.action === 'reject') {
    if (!input.remarks?.trim()) throw new Error('A mandatory reason is required to reject overtime.')
    const { error } = await supabase
      .from('plantpro_ot_sessions')
      .update({
        status: 'rejected',
        manager_remarks: input.remarks.trim(),
        manager_reviewed_by: user.id,
        manager_reviewed_at: now,
      })
      .eq('id', input.sessionId)

    if (error) throw error
    await syncApprovedOtToTimesheet(supabase, session.worker_id, session.work_date, session.project_id)
  }

  // Audit log
  await supabase.from('plantpro_audit_logs').insert({
    entity_type: 'plantpro_ot_sessions',
    entity_id: session.id,
    action: `manager_${input.action}`,
    actor_user_id: user.id,
    actor_role: 'manager',
    previous_value: { status: session.status, approved_minutes: session.approved_minutes },
    new_value: { status: input.action === 'approve' ? 'approved' : input.action, approved_minutes: input.approvedMinutes },
    reason: input.remarks || null,
  })

  revalidatePath('/plantpro/ot-live')
  revalidatePath('/plantpro/timesheet')
  return { ok: true }
}

async function syncApprovedOtToTimesheet(supabase: any, workerId: number, workDate: string, projectId?: number | null) {
  const month = workDate.slice(0, 7)
  const day = workDate.slice(8, 10)

  // Sum all approved OT sessions for this worker on this date
  const { data: approvedSessions } = await supabase
    .from('plantpro_ot_sessions')
    .select('approved_minutes, project_id')
    .eq('worker_id', workerId)
    .eq('work_date', workDate)
    .eq('status', 'approved')

  let totalApprovedMinutes = 0
  const projectMinutesMap = new Map<number, number>()

  for (const s of approvedSessions || []) {
    const mins = s.approved_minutes || 0
    totalApprovedMinutes += mins
    if (s.project_id) {
      projectMinutesMap.set(s.project_id, (projectMinutesMap.get(s.project_id) || 0) + mins)
    }
  }

  const otHours = Math.round((totalApprovedMinutes / 60) * 100) / 100

  // 1. Update plantpro_timesheet_days
  const { data: existingTs } = await supabase
    .from('plantpro_timesheet_days')
    .select('id, basic')
    .eq('worker_id', workerId)
    .eq('month', month)
    .eq('day', day)
    .maybeSingle()

  if (existingTs) {
    await supabase.from('plantpro_timesheet_days').update({ ot: otHours }).eq('id', existingTs.id)
  } else {
    // Default basic is 8 for weekday, 0 for sunday
    const isSunday = new Date(workDate).getDay() === 0
    await supabase.from('plantpro_timesheet_days').insert({
      worker_id: workerId,
      month,
      day,
      basic: isSunday ? 0 : 8,
      ot: otHours,
    })
  }

  // 2. Update plantpro_ot_days and allocations if ot_month exists
  const { data: otMonth } = await supabase
    .from('plantpro_ot_months')
    .select('id')
    .eq('worker_id', workerId)
    .eq('month', month)
    .maybeSingle()

  if (otMonth) {
    const { data: existingOtDay } = await supabase
      .from('plantpro_ot_days')
      .select('id, basic')
      .eq('ot_month_id', otMonth.id)
      .eq('day', day)
      .maybeSingle()

    let otDayId: number
    if (existingOtDay) {
      await supabase.from('plantpro_ot_days').update({ ot: otHours }).eq('id', existingOtDay.id)
      otDayId = existingOtDay.id
    } else {
      const isSunday = new Date(workDate).getDay() === 0
      const { data: createdOtDay } = await supabase
        .from('plantpro_ot_days')
        .insert({ ot_month_id: otMonth.id, day, basic: isSunday ? 0 : 8, ot: otHours })
        .select('id')
        .single()
      otDayId = createdOtDay.id
    }

    // Sync project allocations for the day
    if (totalApprovedMinutes > 0 && projectMinutesMap.size > 0) {
      await supabase.from('plantpro_ot_day_allocations').delete().eq('ot_day_id', otDayId)
      const allocations = Array.from(projectMinutesMap.entries()).map(([pid, mins]) => ({
        ot_day_id: otDayId,
        project_id: pid,
        percentage: Math.round((mins / totalApprovedMinutes) * 1000) / 10,
      }))
      await supabase.from('plantpro_ot_day_allocations').insert(allocations)
    }
  }
}

export async function acknowledgeOtCap(workerId: number, month: string, tier: 'warning_94' | 'critical_100' | 'cap_104', correctiveAction: string) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  if (!isStaff) throw new Error('Only managers or HR can acknowledge OT cap alerts.')
  if (!correctiveAction.trim()) throw new Error('A written corrective action plan is mandatory to acknowledge this cap threshold.')

  const { data: sessions } = await supabase
    .from('plantpro_ot_sessions')
    .select('approved_minutes, eligible_minutes')
    .eq('worker_id', workerId)
    .gte('work_date', `${month}-01`)
    .lte('work_date', `${month}-31`)

  const totalMinutes = (sessions || []).reduce((acc: number, s: any) => acc + (s.approved_minutes || s.eligible_minutes || 0), 0)
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10

  const { error } = await supabase.from('plantpro_ot_cap_acknowledgements').insert({
    worker_id: workerId,
    month,
    tier,
    total_hours_at_trigger: totalHours,
    corrective_action: correctiveAction.trim(),
    acknowledged_by: user.id,
  })

  if (error) throw error

  revalidatePath('/plantpro/ot-live')
  return { ok: true }
}
