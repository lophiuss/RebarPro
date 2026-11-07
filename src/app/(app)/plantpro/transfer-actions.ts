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

  const { data: isOtApprover } = await supabase.rpc('plantpro_is_ot_approver')
  if (!isOtApprover) throw new Error('Only managers or admins can transfer workers.')
  return { supabase, user }
}

export type TransferWorkerPayload = {
  workerIds: number[]
  toSupervisorId?: number | null
  toLine?: string | null
  effectiveDate: string
  reason: string
  transferType: 'permanent' | 'temporary'
  endDate?: string | null
}

export async function transferWorkers(payload: TransferWorkerPayload) {
  const { supabase, user } = await requirePlantproAuth()
  if (!payload.workerIds || payload.workerIds.length === 0) {
    throw new Error('At least one worker must be selected for transfer.')
  }
  if (!payload.toSupervisorId && !payload.toLine) {
    throw new Error('Please select either a new supervisor or department line.')
  }
  if (!payload.reason?.trim()) {
    throw new Error('A transfer reason is mandatory.')
  }

  for (const workerId of payload.workerIds) {
    const { data: worker } = await supabase
      .from('plantpro_workers')
      .select('id, name, worker_no, line, supervisor_id')
      .eq('id', workerId)
      .single()

    if (!worker) continue

    const fromSupervisorId = worker.supervisor_id
    const fromLine = worker.line
    const targetSupervisorId = payload.toSupervisorId !== undefined ? payload.toSupervisorId : fromSupervisorId
    const targetLine = payload.toLine !== undefined ? payload.toLine : fromLine

    // 1. Update plantpro_workers
    const patch: any = {}
    if (payload.toSupervisorId !== undefined) patch.supervisor_id = payload.toSupervisorId
    if (payload.toLine !== undefined) patch.line = payload.toLine

    const { error: updateWorkerErr } = await supabase
      .from('plantpro_workers')
      .update(patch)
      .eq('id', workerId)

    if (updateWorkerErr) throw updateWorkerErr

    // 2. Insert into plantpro_worker_movements
    await supabase.from('plantpro_worker_movements').insert({
      worker_id: workerId,
      effective_date: payload.effectiveDate,
      from_supervisor_id: fromSupervisorId,
      to_supervisor_id: targetSupervisorId,
      from_line: fromLine,
      to_line: targetLine,
      reason: payload.reason.trim(),
      transfer_type: payload.transferType,
      end_date: payload.endDate || null,
      initiated_by: user.id,
      changed_by: user.email || 'Manager',
    })

    // 3. Reassign future OT plans from effective_date onwards
    if (payload.toSupervisorId) {
      await supabase
        .from('plantpro_ot_plans')
        .update({ supervisor_id: payload.toSupervisorId })
        .eq('worker_id', workerId)
        .gte('work_date', payload.effectiveDate)
        .in('status', ['planned', 'in_progress'])
    }

    // 4. Audit log
    await supabase.from('plantpro_audit_logs').insert({
      entity_type: 'plantpro_workers',
      entity_id: workerId,
      action: 'worker_transfer',
      actor_user_id: user.id,
      actor_role: 'manager',
      previous_value: { supervisor_id: fromSupervisorId, line: fromLine },
      new_value: { supervisor_id: targetSupervisorId, line: targetLine },
      reason: payload.reason.trim(),
    })

    // 5. Trigger email notice edge function
    if (payload.toSupervisorId) {
      try {
        await supabase.functions.invoke('send-plantpro-transfer-notice', {
          body: {
            worker_id: workerId,
            from_supervisor_id: fromSupervisorId,
            to_supervisor_id: payload.toSupervisorId,
            effective_date: payload.effectiveDate,
          },
        })
      } catch (err) {
        console.warn('[transferWorkers] Email notice failed:', err)
      }
    }
  }

  revalidatePath('/plantpro/transfers')
  revalidatePath('/plantpro/hr')
  revalidatePath('/plantpro/ot')
  return { ok: true, count: payload.workerIds.length }
}
