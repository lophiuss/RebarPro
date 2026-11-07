'use client'

import React, { useState, useTransition } from 'react'
import {
  CalendarDays, Plus, CheckCircle2, AlertCircle, FileText, Upload,
  Clock, Check, X, Shield, Users, AlertTriangle
} from 'lucide-react'
import { applyLeave, reviewLeaveRequest, uploadLeaveAttachment, type ApplyLeaveInput } from '../leave-actions'

type Worker = { id: number; name: string; worker_no: string | null; line: string | null }
type LeaveType = { id: number; code: string; name: string; is_paid: boolean; requires_attachment: boolean; color: string }
type LeaveRequest = {
  id: number
  worker_id: number
  leave_type_id: number
  start_date: string
  end_date: string
  duration_mode: string
  days_count: number
  reason: string
  attachment_drive_id: string | null
  attachment_name: string | null
  status: 'pending_supervisor' | 'pending_hr_manager' | 'approved' | 'rejected' | 'cancelled'
  worker?: { name: string; line: string | null }
  leave_type?: { name: string; code: string; is_paid: boolean; color: string }
}

export default function LeaveClient({
  workers,
  leaveTypes,
  initialRequests,
  myWorkerId,
  isStaff,
}: {
  workers: Worker[]
  leaveTypes: LeaveType[]
  initialRequests: LeaveRequest[]
  myWorkerId: number | null
  isStaff: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'my_leave' | 'apply' | 'approvals'>('my_leave')
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests)

  // Form State
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(myWorkerId || (workers[0]?.id ?? null))
  const [selectedTypeId, setSelectedTypeId] = useState<number>(leaveTypes[0]?.id || 1)
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [durationMode, setDurationMode] = useState<'full_day' | 'half_am' | 'half_pm'>('full_day')
  const [reason, setReason] = useState<string>('')
  const [attachmentDriveId, setAttachmentDriveId] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const selectedType = leaveTypes.find(t => t.id === selectedTypeId) || leaveTypes[0]

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true)
    const fd = new FormData()
    fd.set('file', file)
    try {
      const res = await uploadLeaveAttachment(fd)
      if (res.ok && res.id) {
        setAttachmentDriveId(res.id)
        setAttachmentName(res.name || file.name)
      } else {
        alert(res.error || 'Failed to upload document')
      }
    } catch {
      alert('Upload error')
    } finally {
      setUploadingFile(false)
    }
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      try {
        const res = await applyLeave({
          workerId: selectedWorkerId || undefined,
          leaveTypeId: selectedTypeId,
          startDate,
          endDate,
          durationMode,
          reason,
          attachmentDriveId,
          attachmentName,
        })
        setMsg({ type: 'success', text: `Leave applied successfully (${res.daysCount} days)!` })
        setTab('my_leave')
        setReason('')
        setAttachmentDriveId(null)
        setAttachmentName(null)
      } catch (err: any) {
        setMsg({ type: 'error', text: err?.message || 'Failed to submit leave.' })
      }
    })
  }

  function handleReview(requestId: number, tier: 'supervisor' | 'manager', decision: 'approve' | 'reject') {
    startTransition(async () => {
      try {
        await reviewLeaveRequest({
          requestId,
          tier,
          decision,
        })
        setRequests(prev =>
          prev.map(r =>
            r.id === requestId
              ? { ...r, status: decision === 'approve' ? (tier === 'supervisor' ? 'pending_hr_manager' : 'approved') : 'rejected' }
              : r
          )
        )
      } catch (err: any) {
        alert(err?.message || 'Review failed.')
      }
    })
  }

  const pendingApprovals = requests.filter(r => ['pending_supervisor', 'pending_hr_manager'].includes(r.status))

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            Leave Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Annual, MC with Photo Upload, 2-Tier Approvals &amp; Timesheet Sync
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('my_leave')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === 'my_leave' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave History
          </button>
          <button
            type="button"
            onClick={() => setTab('apply')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
              tab === 'apply' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Apply Leave
          </button>
          {isStaff && (
            <button
              type="button"
              onClick={() => setTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                tab === 'approvals' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approvals
              {pendingApprovals.length > 0 && (
                <span className="px-1.5 py-0.2 bg-blue-600 text-white rounded-full text-[10px]">
                  {pendingApprovals.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* TAB 1: History */}
      {tab === 'my_leave' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Leave Applications</h2>
          {requests.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No leave applications recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map(r => (
                <div key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{r.worker?.name || `Worker #${r.worker_id}`}</span>
                      <span className="px-2 py-0.5 rounded-md font-medium text-[11px]" style={{ backgroundColor: `${r.leave_type?.color || '#3b82f6'}15`, color: r.leave_type?.color || '#3b82f6' }}>
                        {r.leave_type?.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {r.start_date} to {r.end_date} · <b>{r.days_count} day(s)</b> ({r.duration_mode.replace('_', ' ')})
                    </p>
                    <p className="text-[11px] text-slate-600 italic mt-0.5">&ldquo;{r.reason}&rdquo;</p>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {r.attachment_drive_id && (
                      <a
                        href={`/api/plantpro/file/${r.attachment_drive_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-[11px] flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3 text-blue-600" />
                        <span>View MC</span>
                      </a>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        r.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : r.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {r.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Apply Leave */}
      {tab === 'apply' && (
        <form onSubmit={handleApply} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 max-w-xl mx-auto">
          <h2 className="text-base font-bold text-slate-900">New Leave Application</h2>

          {isStaff && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Applying For Worker</label>
              <select
                value={selectedWorkerId || ''}
                onChange={e => setSelectedWorkerId(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              >
                {workers.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.line || 'Unassigned'})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Leave Type</label>
            <select
              value={selectedTypeId}
              onChange={e => setSelectedTypeId(Number(e.target.value))}
              className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
            >
              {leaveTypes.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.is_paid ? 'Paid' : 'Unpaid'}) {t.requires_attachment ? '· Requires MC' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Duration</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDurationMode('full_day')}
                className={`py-2 rounded-xl text-xs font-medium border ${
                  durationMode === 'full_day' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                Full Day
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('half_am')}
                className={`py-2 rounded-xl text-xs font-medium border ${
                  durationMode === 'half_am' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                Half Day AM
              </button>
              <button
                type="button"
                onClick={() => setDurationMode('half_pm')}
                className={`py-2 rounded-xl text-xs font-medium border ${
                  durationMode === 'half_pm' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                Half Day PM
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Leave</label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide reason for leave..."
              className="w-full text-xs border border-slate-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {selectedType.requires_attachment && (
            <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Medical Certificate / Attachment (Mandatory)
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {uploadingFile && <p className="text-[11px] text-blue-600">Uploading to Google Drive...</p>}
              {attachmentName && <p className="text-[11px] text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {attachmentName}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || (selectedType.requires_attachment && !attachmentDriveId)}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-xs"
          >
            Submit Leave Request
          </button>
        </form>
      )}

      {/* TAB 3: Approvals Queue */}
      {tab === 'approvals' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Pending Leave Approvals</h2>
          {pendingApprovals.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No leave applications currently awaiting review.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingApprovals.map(r => (
                <div key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <span>{r.worker?.name}</span>
                      <span className="text-[11px] font-normal text-slate-500">({r.worker?.line || 'Unassigned'})</span>
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[10px] bg-blue-50 text-blue-700">
                        {r.leave_type?.name} ({r.days_count}d)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {r.start_date} to {r.end_date} · &ldquo;{r.reason}&rdquo;
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.attachment_drive_id && (
                      <a
                        href={`/api/plantpro/file/${r.attachment_drive_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>MC</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleReview(r.id, r.status === 'pending_supervisor' ? 'supervisor' : 'manager', 'approve')}
                      className="px-3 py-1.5 bg-emerald-600 text-white font-semibold rounded-lg text-xs hover:bg-emerald-700 flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(r.id, r.status === 'pending_supervisor' ? 'supervisor' : 'manager', 'reject')}
                      className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50 flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
