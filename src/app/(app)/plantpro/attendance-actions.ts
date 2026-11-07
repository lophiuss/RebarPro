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

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function uploadAttendancePhoto(fd: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const file = fd.get('photo') as File | null
    if (!file) return { ok: false, error: 'No photo uploaded' }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = `attendance_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const driveId = await uploadToDrive(buffer, 'hr', filename, file.type || 'image/jpeg')
    return { ok: true, id: driveId }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Failed to upload photo' }
  }
}

export async function verifyWorkerKioskPin(workerId: number, pin: string): Promise<boolean> {
  const { supabase } = await requirePlantproAuth()
  const { data: worker } = await supabase
    .from('plantpro_workers')
    .select('clock_pin_hash')
    .eq('id', workerId)
    .single()

  if (!worker || !worker.clock_pin_hash) {
    // If no pin is set yet, 1234 or empty is accepted for onboarding
    return pin === '1234' || pin === '0000' || !pin
  }

  // Simple clean hash or plain compare for factory floor PIN
  return worker.clock_pin_hash === pin || worker.clock_pin_hash === `hash:${pin}`
}

export type ClockInPayload = {
  workerId?: number
  inMethod: 'ble_beacon' | 'gps_geofence' | 'kiosk_qr' | 'outstation' | 'manual_adjustment'
  entryMode: 'self_phone' | 'kiosk' | 'supervisor_assisted'
  siteId?: number | null
  beaconId?: number | null
  inLat?: number | null
  inLng?: number | null
  inAccuracyM?: number | null
  isOutstation?: boolean
  outstationLocation?: string | null
  outstationReason?: string | null
  inPhotoDriveId?: string | null
  projectId?: number | null
  qrToken?: string | null
}

export async function clockInAttendance(payload: ClockInPayload) {
  const { supabase, user, isStaff, myWorkerId } = await requirePlantproAuth()
  const targetWorkerId = payload.workerId ? Number(payload.workerId) : myWorkerId
  if (!targetWorkerId) throw new Error('Worker ID is required')

  if (!isStaff && targetWorkerId !== myWorkerId) {
    throw new Error('You may only clock in for yourself.')
  }

  const todayIso = new Date().toISOString().slice(0, 10)

  // Check if already clocked in today without clocking out
  const { data: existingActive } = await supabase
    .from('plantpro_attendance_sessions')
    .select('id, clock_in_at')
    .eq('worker_id', targetWorkerId)
    .eq('work_date', todayIso)
    .is('clock_out_at', null)
    .maybeSingle()

  if (existingActive) {
    throw new Error('Worker is already clocked in today without clocking out.')
  }

  // Geofence distance calculation if site provided
  let distanceMeters: number | null = null
  const exceptionFlags: string[] = []

  if (payload.siteId && payload.inLat && payload.inLng) {
    const { data: site } = await supabase
      .from('plantpro_clock_sites')
      .select('latitude, longitude, radius_meters')
      .eq('id', payload.siteId)
      .single()

    if (site) {
      distanceMeters = haversineMeters(payload.inLat, payload.inLng, site.latitude, site.longitude)
      const allowedRadius = Math.max(site.radius_meters + Math.min(payload.inAccuracyM || 0, 30), 40)
      if (distanceMeters > allowedRadius && !payload.isOutstation) {
        exceptionFlags.push('outside_geofence')
      }
    }
  }

  if (payload.isOutstation) {
    exceptionFlags.push('outstation')
  }

  if (payload.inAccuracyM && payload.inAccuracyM > 150) {
    exceptionFlags.push('location_low_accuracy')
  }

  const { data: session, error } = await supabase
    .from('plantpro_attendance_sessions')
    .insert({
      worker_id: targetWorkerId,
      work_date: todayIso,
      clock_in_at: new Date().toISOString(),
      entry_mode: payload.entryMode,
      in_method: payload.inMethod,
      site_id: payload.siteId || null,
      beacon_id: payload.beaconId || null,
      in_lat: payload.inLat || null,
      in_lng: payload.inLng || null,
      in_accuracy_m: payload.inAccuracyM || null,
      in_distance_m: distanceMeters ? Math.round(distanceMeters) : null,
      is_outstation: !!payload.isOutstation,
      outstation_location: payload.outstationLocation || null,
      outstation_reason: payload.outstationReason || null,
      outstation_status: payload.isOutstation ? 'pending' : 'not_applicable',
      in_photo_drive_id: payload.inPhotoDriveId || null,
      exception_flags: exceptionFlags,
      recorded_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw error

  // If initial project specified, record in project splits
  if (payload.projectId) {
    await supabase.from('plantpro_attendance_project_splits').insert({
      attendance_id: session.id,
      project_id: payload.projectId,
      minutes: 0,
      percentage: 100,
    })
  }

  revalidatePath('/plantpro/clock')
  return { ok: true, sessionId: session.id }
}

export type ClockOutPayload = {
  sessionId?: number
  workerId?: number
  outMethod: 'ble_beacon' | 'gps_geofence' | 'kiosk_qr' | 'outstation' | 'manual_adjustment'
  outLat?: number | null
  outLng?: number | null
  outPhotoDriveId?: string | null
  projectSplits?: { projectId: number; percentage: number; minutes?: number; taskNote?: string }[]
}

export async function clockOutAttendance(payload: ClockOutPayload) {
  const { supabase, user, isStaff, myWorkerId } = await requirePlantproAuth()
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)

  let sessionQuery = supabase.from('plantpro_attendance_sessions').select('*')
  if (payload.sessionId) {
    sessionQuery = sessionQuery.eq('id', payload.sessionId)
  } else {
    const targetWorkerId = payload.workerId ? Number(payload.workerId) : myWorkerId
    if (!targetWorkerId) throw new Error('Worker ID is required')
    sessionQuery = sessionQuery.eq('worker_id', targetWorkerId).is('clock_out_at', null).order('clock_in_at', { ascending: false }).limit(1)
  }

  const { data: session, error: findErr } = await sessionQuery.maybeSingle()
  if (findErr || !session) throw new Error('No active clock-in session found to clock out.')

  if (!isStaff && session.worker_id !== myWorkerId) {
    throw new Error('You may only clock out for yourself.')
  }

  const clockInTime = new Date(session.clock_in_at).getTime()
  const clockOutTime = now.getTime()
  const totalMinutes = Math.max(Math.round((clockOutTime - clockInTime) / (1000 * 60)), 0)

  // Standard break deduction (60m if worked > 5h)
  const breakMinutes = totalMinutes > 300 ? 60 : 0
  const workedMinutes = Math.max(totalMinutes - breakMinutes, 0)
  const basicHoursCredited = Math.min(Math.round((workedMinutes / 60) * 100) / 100, 8)

  const exceptionFlags = [...(session.exception_flags || [])]
  if (totalMinutes < 240) {
    exceptionFlags.push('short_day')
  }

  const { error: updateErr } = await supabase
    .from('plantpro_attendance_sessions')
    .update({
      clock_out_at: now.toISOString(),
      out_method: payload.outMethod,
      out_lat: payload.outLat || null,
      out_lng: payload.outLng || null,
      out_photo_drive_id: payload.outPhotoDriveId || null,
      break_minutes: breakMinutes,
      worked_minutes: workedMinutes,
      basic_hours_credited: basicHoursCredited,
      exception_flags: Array.from(new Set(exceptionFlags)),
    })
    .eq('id', session.id)

  if (updateErr) throw updateErr

  // Save project splits if provided
  if (payload.projectSplits && payload.projectSplits.length > 0) {
    await supabase.from('plantpro_attendance_project_splits').delete().eq('attendance_id', session.id)
    const splits = payload.projectSplits.map(s => ({
      attendance_id: session.id,
      project_id: s.projectId,
      minutes: Math.round((workedMinutes * s.percentage) / 100),
      percentage: s.percentage,
      task_note: s.taskNote || null,
    }))
    await supabase.from('plantpro_attendance_project_splits').insert(splits)
  }

  // Auto-sync basic hours to plantpro_timesheet_days if not pending outstation review
  if (session.outstation_status !== 'pending') {
    await syncWorkerDayBasicToTimesheet(supabase, session.worker_id, session.work_date, basicHoursCredited)
  }

  revalidatePath('/plantpro/clock')
  revalidatePath('/plantpro/timesheet')
  return { ok: true, workedMinutes, basicHoursCredited }
}

export async function reviewOutstationAttendance(id: number, decision: 'approved' | 'rejected', reason?: string) {
  const { supabase, user, isStaff } = await requirePlantproAuth()
  if (!isStaff) throw new Error('Only supervisors or managers can review outstation attendance.')

  const { data: session } = await supabase.from('plantpro_attendance_sessions').select('*').eq('id', id).single()
  if (!session) throw new Error('Attendance session not found')

  const { error } = await supabase
    .from('plantpro_attendance_sessions')
    .update({
      outstation_status: decision,
      outstation_reviewed_by: user.id,
      adjustment_reason: reason || null,
    })
    .eq('id', id)

  if (error) throw error

  // If approved and has clocked out, sync basic hours
  if (decision === 'approved' && session.clock_out_at && session.basic_hours_credited > 0) {
    await syncWorkerDayBasicToTimesheet(supabase, session.worker_id, session.work_date, session.basic_hours_credited)
  }

  revalidatePath('/plantpro/clock')
  return { ok: true }
}

async function syncWorkerDayBasicToTimesheet(supabase: any, workerId: number, workDate: string, basicHours: number) {
  const month = workDate.slice(0, 7)
  const day = workDate.slice(8, 10)

  const { data: existing } = await supabase
    .from('plantpro_timesheet_days')
    .select('id, basic, ot')
    .eq('worker_id', workerId)
    .eq('month', month)
    .eq('day', day)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('plantpro_timesheet_days')
      .update({ basic: basicHours })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('plantpro_timesheet_days')
      .insert({
        worker_id: workerId,
        month,
        day,
        basic: basicHours,
        ot: 0,
      })
  }
}
