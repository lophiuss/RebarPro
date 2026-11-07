'use client'

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Navigation, MapPin, CheckCircle2, Loader2, AlertCircle, Clock,
  Smartphone, Users, Shield, Camera, Building2, Check, RefreshCw, AlertTriangle
} from 'lucide-react'
import BleScannerButton from '@/components/BleScannerButton'
import LiveCameraCapture from '@/components/LiveCameraCapture'
import { clockInAttendance, clockOutAttendance, uploadAttendancePhoto, verifyWorkerKioskPin } from '../attendance-actions'

type Worker = { id: number; worker_no: string | null; name: string; line: string | null; supervisor_id: number | null }
type ClockSite = { id: number; name: string; latitude: number; longitude: number; radius_meters: number }
type Project = { id: number; name: string }
export type ActiveSession = {
  id: number
  worker_id: number
  work_date: string
  clock_in_at: string
  clock_out_at: string | null
  in_method: string
  is_outstation: boolean
  outstation_location: string | null
  in_distance_m: number | null
  in_photo_drive_id: string | null
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const STANDARD_SHIFT_MINUTES = 8 * 60 // 480 minutes (8 hours)

export default function ClockClient({
  workers,
  sites,
  projects,
  myWorkerId,
  isStaff,
  initialActiveSessions,
}: {
  workers: Worker[]
  sites: ClockSite[]
  projects: Project[]
  myWorkerId: number | null
  isStaff: boolean
  initialActiveSessions: ActiveSession[]
}) {
  const [isPending, startTransition] = useTransition()
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>(initialActiveSessions)

  // Default worker: personal worker id, or if staff, pick worker who is currently active (e.g. Abdul Malek) or first worker
  const defaultWorkerId = myWorkerId || (initialActiveSessions[0]?.worker_id ?? workers[0]?.id ?? null)
  const [mode, setMode] = useState<'personal' | 'assisted'>(myWorkerId ? 'personal' : 'assisted')
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(defaultWorkerId)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projects[0]?.id ?? null)

  // Active session for currently selected worker
  const activeSession = useMemo(() => {
    if (!selectedWorkerId) return null
    return activeSessions.find(s => s.worker_id === selectedWorkerId && !s.clock_out_at) || null
  }, [activeSessions, selectedWorkerId])

  // Geolocation
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number; accuracyMeters: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  // Presence selection
  const [selectedSiteId, setSelectedSiteId] = useState<number>(sites[0]?.id || 1)
  const [bleBeacon, setBleBeacon] = useState<{ name: string; id: string } | null>(null)
  const [isOutstation, setIsOutstation] = useState(false)
  const [outstationLocation, setOutstationLocation] = useState('')
  const [outstationReason, setOutstationReason] = useState('')

  // Assisted PIN verification
  const [kioskPin, setKioskPin] = useState('')
  const [pinVerified, setPinVerified] = useState(false)
  const [pinError, setPinError] = useState<string | null>(null)

  // Camera
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStage, setCameraStage] = useState<'in' | 'out'>('in')
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Running elapsed timer & progress state
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    refreshLocation()
  }, [])

  // Timer loop for active session
  useEffect(() => {
    if (!activeSession?.clock_in_at || activeSession.clock_out_at) {
      setElapsedSeconds(0)
      return
    }

    const calcElapsed = () => {
      const clockInMs = new Date(activeSession.clock_in_at).getTime()
      const nowMs = Date.now()
      const sec = Math.max(Math.floor((nowMs - clockInMs) / 1000), 0)
      setElapsedSeconds(sec)
    }

    calcElapsed()
    const timer = setInterval(calcElapsed, 1000)
    return () => clearInterval(timer)
  }, [activeSession])

  function refreshLocation() {
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLoc({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
        })
        setLocating(false)
      },
      err => {
        setLocError(err.message || 'Unable to retrieve your location.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0]
  const distanceToSite = userLoc && selectedSite ? haversine(userLoc.lat, userLoc.lng, selectedSite.latitude, selectedSite.longitude) : null
  const isInsideGeofence = distanceToSite !== null && selectedSite ? distanceToSite <= (selectedSite.radius_meters + Math.min(userLoc?.accuracyMeters || 0, 30)) : false

  async function handlePinCheck() {
    if (!selectedWorkerId) return
    setPinError(null)
    try {
      const valid = await verifyWorkerKioskPin(selectedWorkerId, kioskPin)
      if (valid) {
        setPinVerified(true)
      } else {
        setPinError('Incorrect 4-digit PIN. Please re-enter.')
      }
    } catch {
      setPinError('Error verifying PIN.')
    }
  }

  function handlePhotoCaptured(file: File, exceptionReason?: string) {
    if (exceptionReason) {
      if (cameraStage === 'in') {
        doClockIn(null)
      } else {
        doClockOut(null)
      }
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set('photo', file)
      const res = await uploadAttendancePhoto(fd)
      if (res.ok && res.id) {
        if (cameraStage === 'in') {
          await doClockIn(res.id)
        } else {
          await doClockOut(res.id)
        }
      } else {
        setActionMsg({ type: 'error', text: res.error || 'Failed to upload photo' })
      }
    })
  }

  async function doClockIn(photoId: string | null) {
    setActionMsg(null)
    const method = isOutstation ? 'outstation' : bleBeacon ? 'ble_beacon' : 'gps_geofence'
    const entry = mode === 'assisted' ? 'supervisor_assisted' : 'self_phone'

    const res = await clockInAttendance({
      workerId: selectedWorkerId || undefined,
      inMethod: method,
      entryMode: entry,
      siteId: selectedSite?.id || null,
      inLat: userLoc?.lat || null,
      inLng: userLoc?.lng || null,
      inAccuracyM: userLoc?.accuracyMeters || null,
      isOutstation,
      outstationLocation: isOutstation ? outstationLocation : null,
      outstationReason: isOutstation ? outstationReason : null,
      inPhotoDriveId: photoId,
      projectId: selectedProjectId,
    })

    if (res.ok) {
      const newSession: ActiveSession = {
        id: res.sessionId,
        worker_id: selectedWorkerId || 0,
        work_date: new Date().toISOString().slice(0, 10),
        clock_in_at: new Date().toISOString(),
        clock_out_at: null,
        in_method: method,
        is_outstation: isOutstation,
        outstation_location: outstationLocation,
        in_distance_m: distanceToSite ? Math.round(distanceToSite) : null,
        in_photo_drive_id: photoId,
      }
      setActiveSessions(prev => [newSession, ...prev.filter(s => s.worker_id !== selectedWorkerId)])
      setActionMsg({ type: 'success', text: 'Clock-in recorded successfully!' })
      setPinVerified(false)
      setKioskPin('')
    } else {
      setActionMsg({ type: 'error', text: res.error })
    }
  }

  async function doClockOut(photoId: string | null) {
    if (!activeSession) return
    setActionMsg(null)
    const method = isOutstation ? 'outstation' : bleBeacon ? 'ble_beacon' : 'gps_geofence'

    const res = await clockOutAttendance({
      sessionId: activeSession.id,
      workerId: activeSession.worker_id,
      outMethod: method,
      outLat: userLoc?.lat || null,
      outLng: userLoc?.lng || null,
      outPhotoDriveId: photoId,
      projectSplits: selectedProjectId ? [{ projectId: selectedProjectId, percentage: 100 }] : undefined,
    })

    if (res.ok) {
      setActiveSessions(prev => prev.filter(s => s.id !== activeSession.id))
      setActionMsg({
        type: 'success',
        text: `Clock-out recorded! Worked ${(res.workedMinutes / 60).toFixed(1)}h (${res.basicHoursCredited}h basic credited).`,
      })
      setPinVerified(false)
      setKioskPin('')
    } else {
      setActionMsg({ type: 'error', text: res.error })
    }
  }

  // Progress Bar Calculations
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  const isExceeded = elapsedMinutes > STANDARD_SHIFT_MINUTES
  const progressPercent = Math.min((elapsedMinutes / STANDARD_SHIFT_MINUTES) * 100, 100)

  const hoursDisplay = Math.floor(elapsedSeconds / 3600)
  const minsDisplay = Math.floor((elapsedSeconds % 3600) / 60)
  const secsDisplay = elapsedSeconds % 60
  const formattedElapsed = `${String(hoursDisplay).padStart(2, '0')}:${String(minsDisplay).padStart(2, '0')}:${String(secsDisplay).padStart(2, '0')}`

  const selectedWorker = workers.find(w => w.id === selectedWorkerId)

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Top Banner / Mode Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-600" />
            Attendance Clocking
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bluetooth Beacon, GPS Geofence &amp; Outstation Presence
          </p>
        </div>

        {isStaff && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('personal'); setPinVerified(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'personal' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 inline mr-1" />
              Personal Phone
            </button>
            <button
              type="button"
              onClick={() => { setMode('assisted'); setPinVerified(false) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === 'assisted' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 inline mr-1" />
              Assisted / Kiosk
            </button>
          </div>
        )}
      </div>

      {/* Currently Clocked-In Quick Bar */}
      {activeSessions.length > 0 && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-blue-900 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Currently Clocked In Today ({activeSessions.length} workers):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeSessions.map(s => {
              const w = workers.find(x => x.id === s.worker_id)
              const isSelected = s.worker_id === selectedWorkerId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedWorkerId(s.worker_id)
                    setPinVerified(true)
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium text-xs transition border flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <span>{w?.name || `Worker #${s.worker_id}`}</span>
                  <span className="text-[10px] opacity-80">
                    ({new Date(s.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
            actionMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {actionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span>{actionMsg.text}</span>
        </div>
      )}

      {/* Main Clocking Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Presence & Verification Status */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Presence Channel</h3>

            {/* Outstation Toggle */}
            <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <span className="text-xs font-medium text-slate-700">Outstation / Off-site Work</span>
              <input
                type="checkbox"
                checked={isOutstation}
                onChange={e => setIsOutstation(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
            </label>

            {isOutstation ? (
              <div className="space-y-2 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">Site / Client Name</label>
                  <input
                    type="text"
                    required
                    value={outstationLocation}
                    onChange={e => setOutstationLocation(e.target.value)}
                    placeholder="e.g. JB Sentral Project Site"
                    className="w-full border border-amber-300 rounded-lg p-2 bg-white text-xs outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">Reason for Outstation</label>
                  <input
                    type="text"
                    value={outstationReason}
                    onChange={e => setOutstationReason(e.target.value)}
                    placeholder="e.g. Rebar offloading inspection"
                    className="w-full border border-amber-300 rounded-lg p-2 bg-white text-xs outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            ) : (
              <>
                {/* BLE Beacon Scanner */}
                <BleScannerButton
                  onBeaconDetected={beacon => setBleBeacon({ name: beacon.deviceName, id: beacon.id })}
                />

                {/* Geofence Status */}
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Site Geofence:</span>
                    <span className={`font-semibold ${isInsideGeofence ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isInsideGeofence ? 'Within Perimeter' : 'Outside Geofence'}
                    </span>
                  </div>
                  {distanceToSite !== null && (
                    <div className="text-[11px] text-slate-500 flex items-center justify-between">
                      <span>Distance to {selectedSite?.name}:</span>
                      <span className="font-mono font-medium">{Math.round(distanceToSite)}m</span>
                    </div>
                  )}
                  {locError && (
                    <p className="text-[10px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {locError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={refreshLocation}
                    disabled={locating}
                    className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 pt-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${locating ? 'animate-spin' : ''}`} /> Refresh GPS
                  </button>
                </div>
              </>
            )}

            {/* Project Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to Project</label>
              <select
                value={selectedProjectId || ''}
                onChange={e => setSelectedProjectId(Number(e.target.value) || null)}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Center / Right Column: Active Punch & Worker Card */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col items-center justify-center text-center">
            {/* Worker Selector */}
            <div className="w-full max-w-sm mb-4 text-left">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {mode === 'assisted' ? 'Assisted Worker Clocking' : 'Clocking Profile'}
              </label>
              <select
                value={selectedWorkerId || ''}
                onChange={e => {
                  const wid = Number(e.target.value) || null
                  setSelectedWorkerId(wid)
                  setPinVerified(false)
                }}
                className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white font-medium"
              >
                {workers.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} {w.worker_no ? `(${w.worker_no})` : ''} · {w.line || 'Unassigned'}
                  </option>
                ))}
              </select>
            </div>

            {/* Assisted PIN Pad if not verified and not clocked in */}
            {mode === 'assisted' && !pinVerified && !activeSession && (
              <div className="w-full max-w-sm mb-6 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="password"
                    maxLength={6}
                    value={kioskPin}
                    onChange={e => setKioskPin(e.target.value)}
                    placeholder="Enter Worker 4-digit PIN"
                    className="flex-1 text-center font-mono tracking-widest text-sm border border-slate-300 rounded-xl px-3 py-2 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handlePinCheck}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700"
                  >
                    Verify
                  </button>
                </div>
                {pinError && <p className="text-xs text-red-500 text-left">{pinError}</p>}
                <p className="text-[11px] text-slate-400 text-left">Default PIN is 1234 if not customized.</p>
              </div>
            )}

            {/* Current Active Status & Progress Bar */}
            {activeSession ? (
              <div className="w-full flex flex-col items-center py-2">
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-3 ${
                    isExceeded
                      ? 'bg-red-100 text-red-800 border border-red-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isExceeded ? 'bg-red-600 animate-ping' : 'bg-emerald-500 animate-pulse'
                    }`}
                  />
                  {isExceeded ? 'Shift Exceeded 8h (Overtime Alert)' : 'Currently Clocked In'}
                </div>

                <div className="text-xs font-medium text-slate-500 mb-1">
                  Worker: <span className="font-bold text-slate-900">{selectedWorker?.name}</span>
                </div>

                {/* Digital Timer */}
                <div
                  className={`text-5xl font-extrabold font-mono tracking-tight mb-2 ${
                    isExceeded ? 'text-red-600' : 'text-slate-900'
                  }`}
                >
                  {formattedElapsed}
                </div>

                <p className="text-xs text-slate-500 mb-4">
                  Clocked in at {new Date(activeSession.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} via{' '}
                  <span className="font-semibold capitalize">{activeSession.in_method.replace('_', ' ')}</span>
                  {activeSession.is_outstation && ` (${activeSession.outstation_location || 'Outstation'})`}
                </p>

                {/* PROGRESS BAR LOADING */}
                <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 text-left space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className={isExceeded ? 'text-red-700 font-bold flex items-center gap-1' : 'text-slate-700'}>
                      {isExceeded ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                          Exceeded 8h Limit (+{Math.floor((elapsedMinutes - STANDARD_SHIFT_MINUTES) / 60)}h{' '}
                          {(elapsedMinutes - STANDARD_SHIFT_MINUTES) % 60}m)
                        </>
                      ) : (
                        `Shift Progress: ${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m / 8h 00m`
                      )}
                    </span>
                    <span className={`font-mono ${isExceeded ? 'text-red-600 font-extrabold' : 'text-slate-500'}`}>
                      {progressPercent.toFixed(1)}%
                    </span>
                  </div>

                  {/* Visual Bar: Blue when normal, Red when exceeded */}
                  <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden p-0.5 relative">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                        isExceeded
                          ? 'bg-red-600 shadow-md shadow-red-500/50 animate-pulse'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {isExceeded && (
                    <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 mt-2 font-medium">
                      ⚠️ Worker has exceeded the standard 8-hour shift. Please clock out or allocate an authorized overtime session.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => { setCameraStage('out'); setCameraOpen(true) }}
                  className="w-full max-w-xs py-3.5 px-6 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-600/20 flex items-center justify-center gap-2 transition active:scale-98"
                >
                  {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                  Clock Out Now
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center py-4">
                <div className="w-20 h-20 rounded-full bg-blue-50 border-4 border-blue-100 flex items-center justify-center text-blue-600 mb-4">
                  <Clock className="w-10 h-10" />
                </div>

                <h2 className="text-lg font-bold text-slate-900 mb-1">
                  Ready to Start Shift {selectedWorker ? `for ${selectedWorker.name}` : ''}
                </h2>
                <p className="text-xs text-slate-500 max-w-xs mb-6">
                  {isOutstation
                    ? 'Outstation mode selected. Live GPS & site photo will be recorded.'
                    : bleBeacon
                    ? `Bluetooth beacon "${bleBeacon.name}" verified.`
                    : isInsideGeofence
                    ? 'Location verified within yard perimeter.'
                    : 'Ensure GPS or Bluetooth is enabled before clocking in.'}
                </p>

                <button
                  type="button"
                  disabled={isPending || (mode === 'assisted' && !pinVerified)}
                  onClick={() => { setCameraStage('in'); setCameraOpen(true) }}
                  className="w-full max-w-xs py-3.5 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition active:scale-98"
                >
                  {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                  Verify &amp; Clock In
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Camera Modal */}
      <LiveCameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
        title={cameraStage === 'in' ? 'Clock In - Face & Site Verification' : 'Clock Out - Verification'}
        allowException={true}
      />
    </div>
  )
}
