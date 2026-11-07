'use client'

import React, { useState, useTransition } from 'react'
import {
  Clock, Calendar, Users, CheckCircle2, AlertTriangle, AlertCircle,
  Camera, ShieldAlert, ArrowRight, RotateCcw, Check, X, ChevronRight,
  Filter, Search, ExternalLink, MessageSquare, Flame, Sparkles
} from 'lucide-react'
import LiveCameraCapture from '@/components/LiveCameraCapture'
import {
  allocateOtPlans, startOtClock, finishOtClock,
  reviewOtSessionSupervisor, reviewOtSessionManager, acknowledgeOtCap
} from '../ot-live-actions'
import { uploadAttendancePhoto } from '../attendance-actions'

type Worker = { id: number; name: string; worker_no: string | null; line: string | null; supervisor_id: number | null }
type TaskType = { id: number; name: string; category: string; requires_start_photo: boolean; requires_finish_photo: boolean }
type Project = { id: number; name: string }
type OtSession = {
  id: number
  worker_id: number
  work_date: string
  check_in_at: string
  check_out_at: string | null
  raw_minutes: number
  eligible_minutes: number
  confirmed_minutes: number | null
  approved_minutes: number | null
  completion_notes: string | null
  camera_exception_reason: string | null
  exception_flags: string[]
  status: 'active' | 'pending_supervisor' | 'pending_manager' | 'returned' | 'approved' | 'rejected'
  submission_count: number
  worker?: { name: string; worker_no: string | null; line: string | null }
  task_type?: { name: string }
  project?: { name: string }
  evidence?: { id: number; stage: string; photo_drive_id: string }[]
}

export default function OtLiveClient({
  workers,
  taskTypes,
  projects,
  initialSessions,
  myWorkerId,
  isStaff,
  isManager,
}: {
  workers: Worker[]
  taskTypes: TaskType[]
  projects: Project[]
  initialSessions: OtSession[]
  myWorkerId: number | null
  isStaff: boolean
  isManager: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'clock' | 'monitor' | 'allocate' | 'approvals' | 'cap'>('clock')
  const [sessions, setSessions] = useState<OtSession[]>(initialSessions)

  // Clock Tab State
  const [selectedTaskTypeId, setSelectedTaskTypeId] = useState<number>(taskTypes[0]?.id || 1)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projects[0]?.id || null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStage, setCameraStage] = useState<'start' | 'finish'>('start')
  const [activeSession, setActiveSession] = useState<OtSession | null>(
    sessions.find(s => s.worker_id === myWorkerId && s.status === 'active') || null
  )

  // Allocation Tab State
  const [allocWorkerIds, setAllocWorkerIds] = useState<number[]>([])
  const [allocDates, setAllocDates] = useState<string>('')
  const [allocTaskTypeId, setAllocTaskTypeId] = useState<number>(taskTypes[0]?.id || 1)
  const [allocProjectId, setAllocProjectId] = useState<number | null>(projects[0]?.id || null)
  const [allocHours, setAllocHours] = useState<number>(2)
  const [allocOverrideReason, setAllocOverrideReason] = useState<string>('')
  const [allocMessage, setAllocMessage] = useState<string | null>(null)

  // Approvals & Review state
  const [reviewRemark, setReviewRemark] = useState('')
  const [adjustMinutes, setAdjustMinutes] = useState<number>(120)
  const [inspectSession, setInspectSession] = useState<OtSession | null>(null)

  // Cap acknowledgement state
  const [capActionText, setCapActionText] = useState('')
  const [selectedCapWorkerId, setSelectedCapWorkerId] = useState<number | null>(null)

  function handlePhotoCaptured(file: File, exceptionReason?: string) {
    startTransition(async () => {
      let driveId: string | null = null
      if (!exceptionReason && file.size > 0) {
        const fd = new FormData()
        fd.set('photo', file)
        const up = await uploadAttendancePhoto(fd)
        if (up.ok) driveId = up.id || null
      }

      if (cameraStage === 'start') {
        try {
          const res = await startOtClock({
            workerId: myWorkerId || undefined,
            taskTypeId: selectedTaskTypeId,
            projectId: selectedProjectId,
            inMethod: 'gps_geofence',
            entryMode: 'self_phone',
            startPhotoDriveId: driveId,
          })
          const newSession: OtSession = {
            id: res.sessionId,
            worker_id: myWorkerId || 0,
            work_date: new Date().toISOString().slice(0, 10),
            check_in_at: new Date().toISOString(),
            check_out_at: null,
            raw_minutes: 0,
            eligible_minutes: 0,
            confirmed_minutes: null,
            approved_minutes: null,
            completion_notes: null,
            camera_exception_reason: exceptionReason || null,
            exception_flags: [],
            status: 'active',
            submission_count: 1,
          }
          setActiveSession(newSession)
          setSessions(prev => [newSession, ...prev])
        } catch (err: any) {
          alert(err?.message || 'Failed to start OT.')
        }
      } else if (activeSession) {
        try {
          const res = await finishOtClock({
            sessionId: activeSession.id,
            outMethod: 'gps_geofence',
            finishPhotoDriveId: driveId,
            completionNotes: completionNotes || 'Work completed',
            cameraExceptionReason: exceptionReason || null,
          })
          setActiveSession(null)
          setCompletionNotes('')
          setSessions(prev =>
            prev.map(s => (s.id === activeSession.id ? { ...s, status: 'pending_supervisor', raw_minutes: res.rawMinutes } : s))
          )
        } catch (err: any) {
          alert(err?.message || 'Failed to finish OT.')
        }
      }
    })
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault()
    if (!allocWorkerIds.length || !allocDates) return
    const datesArr = allocDates.split(',').map(d => d.trim()).filter(Boolean)
    setAllocMessage(null)

    startTransition(async () => {
      try {
        const res = await allocateOtPlans({
          workerIds: allocWorkerIds,
          dates: datesArr,
          taskTypeId: allocTaskTypeId,
          projectId: allocProjectId,
          plannedMinutes: allocHours * 60,
          capOverrideReason: allocOverrideReason || null,
        })
        setAllocMessage(`Successfully allocated ${res.allocatedCount} OT shifts!`)
        if (res.warnings?.length) {
          alert(`Warning:\n${res.warnings.join('\n')}`)
        }
        setAllocWorkerIds([])
        setAllocDates('')
      } catch (err: any) {
        alert(err?.message || 'Allocation failed.')
      }
    })
  }

  async function handleSupervisorReview(sessionId: number, action: 'confirm' | 'return') {
    startTransition(async () => {
      try {
        await reviewOtSessionSupervisor({
          sessionId,
          action,
          confirmedMinutes: adjustMinutes,
          remarks: reviewRemark,
        })
        setSessions(prev =>
          prev.map(s => (s.id === sessionId ? { ...s, status: action === 'confirm' ? 'pending_manager' : 'returned' } : s))
        )
        setInspectSession(null)
        setReviewRemark('')
      } catch (err: any) {
        alert(err?.message || 'Review failed.')
      }
    })
  }

  async function handleManagerReview(sessionId: number, action: 'approve' | 'return' | 'reject' | 'revoke') {
    startTransition(async () => {
      try {
        await reviewOtSessionManager({
          sessionId,
          action,
          approvedMinutes: adjustMinutes,
          remarks: reviewRemark,
        })
        const mappedStatus: 'approved' | 'rejected' | 'returned' | 'pending_supervisor' =
          action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'return' ? 'returned' : 'pending_supervisor'
        setSessions(prev =>
          prev.map(s => (s.id === sessionId ? { ...s, status: mappedStatus } : s))
        )
        setInspectSession(null)
        setReviewRemark('')
      } catch (err: any) {
        alert(err?.message || 'Manager action failed.')
      }
    })
  }

  const activeMonitorSessions = sessions.filter(s => s.status === 'active')
  const pendingSupervisorSessions = sessions.filter(s => s.status === 'pending_supervisor')
  const pendingManagerSessions = sessions.filter(s => s.status === 'pending_manager')

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            Overtime &amp; Cap Control
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pre-Allocation Gate · 2-Tier Approvals · 94h/100h/104h Cap Alerts
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() => setTab('clock')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              tab === 'clock' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Clock OT
          </button>
          <button
            type="button"
            onClick={() => setTab('monitor')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
              tab === 'monitor' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Live Monitor
            {activeMonitorSessions.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => setTab('allocate')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                tab === 'allocate' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Allocate OT
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              onClick={() => setTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1 ${
                tab === 'approvals' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approvals
              {(pendingSupervisorSessions.length + pendingManagerSessions.length) > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                  {pendingSupervisorSessions.length + pendingManagerSessions.length}
                </span>
              )}
            </button>
          )}
          {isStaff && (
            <button
              type="button"
              onClick={() => setTab('cap')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                tab === 'cap' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cap Watchlist
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: Clock OT */}
      {tab === 'clock' && (
        <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-xs text-center space-y-5">
          {activeSession ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Overtime Session Active
              </div>

              <div className="text-4xl font-extrabold font-mono text-slate-900">
                Started {new Date(activeSession.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>

              <div className="text-left space-y-2 pt-2">
                <label className="block text-xs font-bold text-slate-700">
                  Work Completed Notes <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={completionNotes}
                  onChange={e => setCompletionNotes(e.target.value)}
                  placeholder="Detail what was completed during this overtime session..."
                  className="w-full text-xs border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                disabled={isPending || !completionNotes.trim()}
                onClick={() => { setCameraStage('finish'); setCameraOpen(true) }}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-amber-600/20 flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> Finish &amp; Submit OT
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center text-amber-600 mx-auto">
                <Flame className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Start Overtime Session</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Ensure your overtime has been pre-allocated by your supervisor. Live proof photo is optional or required depending on task.
              </p>

              <div className="text-left space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Overtime Task</label>
                  <select
                    value={selectedTaskTypeId}
                    onChange={e => setSelectedTaskTypeId(Number(e.target.value))}
                    className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
                  >
                    {taskTypes.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Project</label>
                  <select
                    value={selectedProjectId || ''}
                    onChange={e => setSelectedProjectId(Number(e.target.value) || null)}
                    className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => { setCameraStage('start'); setCameraOpen(true) }}
                className="w-full py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 mt-4"
              >
                <Camera className="w-4 h-4" /> Start Overtime
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Live Monitor ("On Overtime Now") */}
      {tab === 'monitor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Currently on Overtime: <b>{activeMonitorSessions.length}</b> workers</span>
          </div>
          {activeMonitorSessions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-xs">
              No workers are currently clocked into overtime.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeMonitorSessions.map(s => {
                const w = workers.find(x => x.id === s.worker_id)
                return (
                  <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{w?.name || `Worker #${s.worker_id}`}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <p className="text-[11px] text-slate-500">{w?.line || 'Unassigned'} · Started at {new Date(s.check_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                        {s.task_type?.name || 'Overtime'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Allocate OT */}
      {tab === 'allocate' && (
        <form onSubmit={handleAllocate} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 max-w-2xl mx-auto">
          <h2 className="text-base font-bold text-slate-900">Pre-Allocate Overtime Shifts</h2>
          {allocMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              {allocMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Workers</label>
            <div className="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
              {workers.map(w => (
                <label key={w.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allocWorkerIds.includes(w.id)}
                    onChange={e => {
                      if (e.target.checked) setAllocWorkerIds(prev => [...prev, w.id])
                      else setAllocWorkerIds(prev => prev.filter(id => id !== w.id))
                    }}
                    className="w-3.5 h-3.5 rounded text-blue-600"
                  />
                  <span>{w.name} ({w.line || 'Unassigned'})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Dates (Comma Separated)</label>
              <input
                type="text"
                required
                value={allocDates}
                onChange={e => setAllocDates(e.target.value)}
                placeholder="2026-11-07, 2026-11-08"
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hour Limit (Hours)</label>
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={allocHours}
                onChange={e => setAllocHours(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Task Type</label>
              <select
                value={allocTaskTypeId}
                onChange={e => setAllocTaskTypeId(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                {taskTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Project</label>
              <select
                value={allocProjectId || ''}
                onChange={e => setAllocProjectId(Number(e.target.value) || null)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !allocWorkerIds.length}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs"
          >
            Confirm Allocation
          </button>
        </form>
      )}

      {/* TAB 4: Approvals Queue */}
      {tab === 'approvals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Supervisor Queue */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Step 1: Supervisor Confirmation</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
                  {pendingSupervisorSessions.length} Pending
                </span>
              </h3>
              {pendingSupervisorSessions.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No sessions waiting for supervisor review.</p>
              ) : (
                pendingSupervisorSessions.map(s => {
                  const w = workers.find(x => x.id === s.worker_id)
                  return (
                    <div key={s.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-semibold">
                        <span>{w?.name}</span>
                        <span>{(s.raw_minutes / 60).toFixed(1)}h</span>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">&ldquo;{s.completion_notes}&rdquo;</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleSupervisorReview(s.id, 'confirm')}
                          className="flex-1 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                        >
                          Confirm {(s.raw_minutes / 60).toFixed(1)}h
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSupervisorReview(s.id, 'return')}
                          className="px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs hover:bg-white"
                        >
                          Clarify
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Step 2: Manager Queue */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Step 2: Manager Final Approval</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px]">
                  {pendingManagerSessions.length} Pending
                </span>
              </h3>
              {pendingManagerSessions.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No sessions waiting for manager approval.</p>
              ) : (
                pendingManagerSessions.map(s => {
                  const w = workers.find(x => x.id === s.worker_id)
                  return (
                    <div key={s.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-semibold">
                        <span>{w?.name}</span>
                        <span className="text-blue-700">Confirmed: {((s.confirmed_minutes || s.raw_minutes) / 60).toFixed(1)}h</span>
                      </div>
                      <p className="text-[11px] text-slate-500 italic">&ldquo;{s.completion_notes}&rdquo;</p>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleManagerReview(s.id, 'approve')}
                          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700"
                        >
                          Final Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleManagerReview(s.id, 'reject')}
                          className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Cap Watchlist */}
      {tab === 'cap' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Monthly OT Cap Governance (104h Limit / 94h Early Warning / 100h Critical)
          </h2>
          <p className="text-xs text-slate-500">
            Malaysian Employment Act 1955 overtime threshold control. Workers nearing or exceeding caps require formal written corrective action plans.
          </p>
          <div className="divide-y divide-slate-100">
            {workers.slice(0, 6).map(w => (
              <div key={w.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-800">{w.name}</span>
                  <span className="text-slate-400 ml-2">({w.line || 'Unassigned'})</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-28 bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: '45%' }} />
                  </div>
                  <span className="text-[11px] font-mono text-slate-600">46.5 / 104h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      <LiveCameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        title={cameraStage === 'start' ? 'Overtime Start - Photo Verification' : 'Overtime Finish - Work Photo'}
        allowException={true}
      />
    </div>
  )
}
