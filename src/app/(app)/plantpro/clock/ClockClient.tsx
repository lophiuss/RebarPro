'use client'

import React, { useEffect, useState, useTransition } from 'react'
import {
  Navigation, MapPin, CheckCircle2, Loader2, AlertCircle, Clock,
  Smartphone, Users, Shield, Camera, Building2, Check, RefreshCw
} from 'lucide-react'
import BleScannerButton from '@/components/BleScannerButton'
import LiveCameraCapture from '@/components/LiveCameraCapture'
import CheckpointMap from '@/components/CheckpointMap'
import { clockInAttendance, clockOutAttendance, uploadAttendancePhoto, verifyWorkerKioskPin } from '../attendance-actions'

type Worker = { id: number; worker_no: string | null; name: string; line: string | null; supervisor_id: number | null }
type ClockSite = { id: number; name: string; latitude: number; longitude: number; radius_meters: number }
type Project = { id: number; name: string }
type ActiveSession = {
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

export default function ClockClient({
  workers,
  sites,
  projects,
  myWorkerId,
  isStaff,
  initialActiveSession,
}: {
  workers: Worker[]
  sites: ClockSite[]
  projects: Project[]
  myWorkerId: number | null
  isStaff: boolean
  initialActiveSession: ActiveSession | null
}) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'personal' | 'assisted'>(myWorkerId ? 'personal' : 'assisted')
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(myWorkerId || (workers[0]?.id ?? null))
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projects[0]?.id ?? null)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(initialActiveSession)

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
  const [capturedPhotoDriveId, setCapturedPhotoDriveId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Elapsed timer for active session
  const [elapsedStr, setElapsedStr] = useState('00:00:00')

  useEffect(() => {
    refreshLocation()
  }, [])

  useEffect(() => {
    if (!activeSession?.clock_in_at || activeSession.clock_out_at) return
    const updateElapsed = () => {
      const diff = Math.max(Date.now() - new Date(activeSession.clock_in_at).getTime(), 0)
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setElapsedStr(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    updateElapsed()
    const timer = setInterval(updateElapsed, 1000)
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
      // Camera exception
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
        setCapturedPhotoDriveId(res.id)
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

    try {
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

      setActiveSession({
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
      })
      setActionMsg({ type: 'success', text: 'Clock-in recorded successfully!' })
      setPinVerified(false)
      setKioskPin('')
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Clock-in failed.' })
    }
  }

  async function doClockOut(photoId: string | null) {
    if (!activeSession) return
    setActionMsg(null)
    const method = isOutstation ? 'outstation' : bleBeacon ? 'ble_beacon' : 'gps_geofence'

    try {
      const res = await clockOutAttendance({
        sessionId: activeSession.id,
        workerId: activeSession.worker_id,
        outMethod: method,
        outLat: userLoc?.lat || null,
        outLng: userLoc?.lng || null,
        outPhotoDriveId: photoId,
        projectSplits: selectedProjectId ? [{ projectId: selectedProjectId, percentage: 100 }] : undefined,
      })

      setActiveSession(null)
      setActionMsg({
        type: 'success',
        text: `Clock-out recorded! Worked ${(res.workedMinutes / 60).toFixed(1)}h (${res.basicHoursCredited}h basic credited).`,
      })
      setPinVerified(false)
      setKioskPin('')
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Clock-out failed.' })
    }
  }

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
            {/* Assisted Worker Picker & PIN Pad */}
            {mode === 'assisted' && !pinVerified && !activeSession && (
              <div className="w-full max-w-sm mb-6 space-y-3">
                <label className="block text-xs font-semibold text-slate-700 text-left">Select Worker</label>
                <select
                  value={selectedWorkerId || ''}
                  onChange={e => setSelectedWorkerId(Number(e.target.value) || null)}
                  className="w-full text-xs border border-slate-300 rounded-xl p-2.5 bg-white"
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.worker_no ? `(${w.worker_no})` : ''} · {w.line || 'Unassigned'}
                    </option>
                  ))}
                </select>

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
                <p className="text-[11px] text-slate-400 text-left">Default PIN is 1234 if not customized in Access Control.</p>
              </div>
            )}

            {/* Current Active Status */}
            {activeSession ? (
              <div className="w-full flex flex-col items-center py-4">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Currently Clocked In
                </div>

                <div className="text-5xl font-extrabold font-mono text-slate-900 tracking-tight mb-2">
                  {elapsedStr}
                </div>
                <p className="text-xs text-slate-500 mb-6">
                  Clocked in at {new Date(activeSession.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} via{' '}
                  <span className="font-semibold capitalize">{activeSession.in_method.replace('_', ' ')}</span>
                  {activeSession.is_outstation && ` (${activeSession.outstation_location || 'Outstation'})`}
                </p>

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

                <h2 className="text-lg font-bold text-slate-900 mb-1">Ready to Start Shift</h2>
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
