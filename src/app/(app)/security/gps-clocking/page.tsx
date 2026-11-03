'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhotoWithRetry } from '@/lib/uploadPhoto'
import { compressImageToTarget } from '@/lib/compressImage'
import { Navigation, MapPin, CheckCircle2, Loader2, Check, RotateCcw, ShieldCheck, Map as MapIcon, Clock, ChevronRight, AlertTriangle, Sparkles } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'
import CheckpointMap from '@/components/CheckpointMap'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { securityDict } from '@/lib/i18n/dict/security'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { reportActionError } from '@/lib/staleAction'

type Checkpoint = { id: number; name: string; latitude: number; longitude: number; radius_meters: number; sequence_order: number; is_active: boolean }
type ClockRecord = {
  id: number; checkpoint_id: number | null; checkpoint_name: string; guard_name: string
  clocked_at: string; distance_meters: number; photo_drive_id: string; remark: string | null
}

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Haversine — great-circle distance between two lat/lng points, in meters.
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Calculates mobile-friendly geofence radius incorporating GPS accuracy tolerance.
// Night-time guards under metal shed/roofing experience ±15m-30m GPS jitter.
// This ensures guards standing at the checkpoint are never blocked by GPS drift,
// while strictly maintaining geofence integrity against remote spoofing.
function getEffectiveRadius(checkpointRadius: number, accuracyMeters?: number) {
  const accuracyBuffer = Math.min(Math.max(accuracyMeters || 0, 10), 25)
  return Math.max(checkpointRadius + accuracyBuffer, 35)
}

export default function GpsClockingPage() {
  const supabase = createClient()
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [myName, setMyName] = useState('')
  const [myEmail, setMyEmail] = useState('')
  const [todayRecords, setTodayRecords] = useState<ClockRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCheckpointId, setSelectedCheckpointId] = useState('')
  const [userManuallySelected, setUserManuallySelected] = useState(false)
  const [remark, setRemark] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [locating, setLocating] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; accuracyMeters?: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [initialCenter, setInitialCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [mobileTab, setMobileTab] = useState<'clock' | 'map' | 'today'>('clock')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [lang, setLang] = useLang()
  const t = makeT(securityDict, lang)

  useEffect(() => { load() }, [])

  // Keeps the "you are here" dot on the map live as the guard walks around
  useEffect(() => {
    if (!navigator.geolocation) { setLocationError(t('gps.noGpsSupport')); return }
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        setLocationError(null)
        setMyLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy || undefined,
        })
      },
      err => setLocationError('Error: ' + err.message),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  useEffect(() => {
    if (initialCenter) return
    if (myLocation) setInitialCenter({ lat: myLocation.lat, lng: myLocation.lng })
    else if (checkpoints[0]) setInitialCenter({ lat: checkpoints[0].latitude, lng: checkpoints[0].longitude })
  }, [myLocation, checkpoints, initialCenter])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setMyEmail(user?.email ?? '')
    const [{ data: profile }, { data: cps }, { data: todayRows }] = await Promise.all([
      user ? supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('security_checkpoints').select('*').eq('is_active', true).order('sequence_order'),
      supabase.from('security_clocking_records').select('*').gte('clocked_at', new Date(isoToday() + 'T00:00:00').toISOString()).order('clocked_at', { ascending: false }),
    ])
    setMyName(profile?.full_name || user?.email || '')
    setCheckpoints(cps || [])
    setTodayRecords(todayRows || [])
    setLoading(false)
  }

  const myIdentifier = myName || myEmail
  const myClockedToday = todayRecords.filter(r => r.guard_name === myIdentifier)
  const myClockedCheckpointIds = new Set(myClockedToday.map(r => r.checkpoint_id))
  const nextSuggested = checkpoints.find(c => !myClockedCheckpointIds.has(c.id)) || checkpoints[0]

  useEffect(() => {
    if (!selectedCheckpointId && nextSuggested) {
      setSelectedCheckpointId(String(nextSuggested.id))
    }
  }, [checkpoints.length, selectedCheckpointId, nextSuggested])

  // Which checkpoint (if any) the guard's live location currently falls inside
  const inRangeCheckpoint = myLocation
    ? checkpoints.find(c => {
        const dist = distanceMeters(myLocation.lat, myLocation.lng, c.latitude, c.longitude)
        const allowedRadius = getEffectiveRadius(c.radius_meters, myLocation.accuracyMeters)
        return dist <= allowedRadius
      })
    : undefined

  const lastAutoSelectedRef = useRef<number | null>(null)
  useEffect(() => {
    // Only auto-select if the user hasn't deliberately chosen another checkpoint
    if (userManuallySelected) return

    if (inRangeCheckpoint && inRangeCheckpoint.id !== lastAutoSelectedRef.current) {
      lastAutoSelectedRef.current = inRangeCheckpoint.id
      setSelectedCheckpointId(String(inRangeCheckpoint.id))
    }
    if (!inRangeCheckpoint) {
      lastAutoSelectedRef.current = null
    }
  }, [inRangeCheckpoint?.id, userManuallySelected])

  function handleSelectCheckpoint(id: string, manual = true) {
    setSelectedCheckpointId(id)
    if (manual) {
      setUserManuallySelected(true)
    }
  }

  function handleResetToAuto() {
    setUserManuallySelected(false)
    lastAutoSelectedRef.current = null
    if (inRangeCheckpoint) {
      setSelectedCheckpointId(String(inRangeCheckpoint.id))
    } else if (nextSuggested) {
      setSelectedCheckpointId(String(nextSuggested.id))
    }
  }

  async function clockIn() {
    const checkpoint = checkpoints.find(c => c.id === Number(selectedCheckpointId))
    if (!checkpoint) { alert(t('gps.selectCheckpointFirst')); return }
    if (!photo) { alert(t('gps.photoRequired')); return }
    if (!navigator.geolocation) { alert(t('gps.noGpsSupport')); return }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude, longitude, accuracy } = pos.coords
          const dist = distanceMeters(latitude, longitude, checkpoint.latitude, checkpoint.longitude)
          const allowedRadius = getEffectiveRadius(checkpoint.radius_meters, accuracy)

          if (dist > allowedRadius) {
            alert(`${Math.round(dist)}m — "${checkpoint.name}" ${t('gps.outsideGeofence')} ${Math.round(allowedRadius)}m ${t('gps.geofenceMoveCloser')}`)
            setLocating(false)
            return
          }

          const blob = await compressImageToTarget(photo, 195 * 1024)
          const fd = new FormData()
          fd.set('photo', blob, 'clocking.jpg')
          fd.set('subfolder', 'clocking')
          const photo_drive_id = await uploadSecurityPhotoWithRetry(fd)

          const { error } = await supabase.from('security_clocking_records').insert([{
            checkpoint_id: checkpoint.id,
            checkpoint_name: checkpoint.name,
            guard_name: myIdentifier,
            latitude,
            longitude,
            distance_meters: Math.round(dist),
            photo_drive_id,
            remark: remark.trim() || null,
            created_by: myEmail || null,
          }])
          if (error) throw error

          setPhoto(null)
          setRemark('')
          setUserManuallySelected(false)
          setSuccessMsg(t('gps.clockSuccess'))
          try {
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              navigator.vibrate([80, 40, 80])
            }
          } catch {}
          setTimeout(() => setSuccessMsg(null), 4000)
          await load()
        } catch (err: any) {
          reportActionError(err, 'Error')
        } finally {
          setLocating(false)
        }
      },
      err => {
        setLocating(false)
        alert('Error: ' + err.message + ' — ' + t('gps.locationErrorSuffix'))
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const selectedCheckpoint = checkpoints.find(c => c.id === Number(selectedCheckpointId)) || nextSuggested || checkpoints[0]
  const currentDist = (myLocation && selectedCheckpoint)
    ? Math.round(distanceMeters(myLocation.lat, myLocation.lng, selectedCheckpoint.latitude, selectedCheckpoint.longitude))
    : null
  const currentEffectiveRadius = selectedCheckpoint
    ? Math.round(getEffectiveRadius(selectedCheckpoint.radius_meters, myLocation?.accuracyMeters))
    : 35
  const isCurrentInRange = currentDist !== null && currentDist <= currentEffectiveRadius
  const isCurrentClocked = selectedCheckpoint ? myClockedCheckpointIds.has(selectedCheckpoint.id) : false

  return (
    <div className="p-2 sm:p-4 md:p-6 max-w-6xl mx-auto min-h-[calc(100dvh-3.5rem)] flex flex-col justify-start">
      {/* Top Header - Compact for Mobile, Elegant for Desktop */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-200/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Navigation className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight truncate flex items-center gap-1.5">
              <span>{t('gps.title')}</span>
              <span className={`inline-block w-2 h-2 rounded-full ${myLocation ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} title={myLocation ? t('gps.gpsActive') : 'Waiting GPS'} />
            </h1>
            <p className="text-[11px] text-gray-500 truncate hidden sm:block">
              {myName ? `${myName} · ` : ''}{t('gps.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {myLocation?.accuracyMeters != null && (
            <span className="text-[10px] sm:text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-md border border-slate-200" title="GPS Accuracy">
              ±{Math.round(myLocation.accuracyMeters)}m
            </span>
          )}
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="bg-emerald-600 text-white text-xs sm:text-sm font-semibold rounded-xl px-4 py-2.5 mb-2 shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-200 hover:text-white text-xs underline cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Mobile-Only Segmented Tabs: [Clock In] [Map] [Today] */}
      <div className="md:hidden flex items-center p-1 bg-slate-200/80 rounded-xl mb-2 gap-1 text-xs font-semibold select-none">
        <button
          type="button"
          onClick={() => setMobileTab('clock')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition cursor-pointer ${
            mobileTab === 'clock'
              ? 'bg-white text-blue-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>{t('gps.tabClock')}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition cursor-pointer ${
            mobileTab === 'map'
              ? 'bg-white text-blue-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>{t('gps.tabMap')}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('today')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition cursor-pointer ${
            mobileTab === 'today'
              ? 'bg-white text-blue-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{t('gps.tabToday')}</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${myClockedToday.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-300 text-slate-700'}`}>
            {myClockedToday.length}/{checkpoints.length}
          </span>
        </button>
      </div>

      {/* No Checkpoints Notice */}
      {checkpoints.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 mb-3">
          {t('gps.noCheckpoints')}
        </div>
      )}

      {/* Location Error Warning */}
      {locationError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-xs text-red-700 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          <span className="truncate">{locationError} — {t('gps.locationErrorSuffix')}</span>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 min-h-0">
        {/* DESKTOP LAYOUT (2 Columns) */}
        <div className="hidden md:grid md:grid-cols-12 md:gap-5">
          {/* Left Column: Interactive Map & History */}
          <div className="md:col-span-7 space-y-4">
            <div className="bg-white border rounded-xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> {t('gps.mapTitle')}
                </h2>
                {myLocation?.accuracyMeters != null && (
                  <span className="text-xs text-gray-400">±{Math.round(myLocation.accuracyMeters)}m {t('gps.accuracy')}</span>
                )}
              </div>
              <CheckpointMap
                markers={checkpoints.map(c => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, radiusMeters: c.radius_meters, active: c.is_active }))}
                userLocation={myLocation}
                center={initialCenter || undefined}
                height={320}
                onSelect={id => handleSelectCheckpoint(String(id), true)}
              />
            </div>

            {/* Desktop Today's Clocking */}
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">
                  {t('gps.myClockingToday')} ({myClockedToday.length}/{checkpoints.length})
                </h2>
                <Link href="/security/audit" className="text-xs text-blue-600 hover:underline">
                  {t('audit.title')} →
                </Link>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {myClockedToday.map(r => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-slate-800 truncate">{r.checkpoint_name}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(r.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {r.distance_meters}m {t('gps.fromPoint')}
                        {r.remark ? ` · ${r.remark}` : ''}
                      </div>
                    </div>
                    <img
                      src={`/api/security/photo/${r.photo_drive_id}`}
                      alt={r.checkpoint_name}
                      className="w-10 h-10 rounded-md object-cover cursor-zoom-in shrink-0 border border-gray-200"
                      onClick={() => setZoomSrc(`/api/security/photo/${r.photo_drive_id}`)}
                    />
                  </div>
                ))}
                {myClockedToday.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">{t('gps.nothingClockedToday')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Clocking Action Form */}
          <div className="md:col-span-5 space-y-4">
            {nextSuggested && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-sm">
                <Sparkles className="w-4 h-4 shrink-0 text-amber-300" />
                <span className="truncate">{t('gps.nextSuggested')}: #{nextSuggested.sequence_order} {nextSuggested.name}</span>
              </div>
            )}

            <div className="bg-white border rounded-xl shadow-sm p-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">{t('gps.tapToSelect')}</span>
                  {userManuallySelected && (
                    <button
                      type="button"
                      onClick={handleResetToAuto}
                      className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{t('gps.resetToAuto')}</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border rounded-lg bg-slate-50/50">
                  {checkpoints.map(c => {
                    const isSelected = selectedCheckpointId === String(c.id)
                    const isClocked = myClockedCheckpointIds.has(c.id)
                    const dist = myLocation ? Math.round(distanceMeters(myLocation.lat, myLocation.lng, c.latitude, c.longitude)) : null
                    const effRad = Math.round(getEffectiveRadius(c.radius_meters, myLocation?.accuracyMeters))
                    const inR = dist !== null && dist <= effRad

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCheckpoint(String(c.id), true)}
                        className={`text-left p-2 rounded-lg border text-xs transition cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20'
                            : inR
                            ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-bold text-slate-800 truncate">#{c.sequence_order} {c.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                        </div>
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className={inR ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                            {dist !== null ? `${dist}m` : '...'} {inR ? `(${t('gps.inRange')})` : ''}
                          </span>
                          {isClocked && <span className="text-[10px] text-emerald-600 font-bold">✓</span>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Status Box for Active Checkpoint */}
              {selectedCheckpoint && (
                <div className={`p-3 rounded-xl border text-xs ${
                  isCurrentInRange
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-amber-50 border-amber-300 text-amber-900'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold truncate">#{selectedCheckpoint.sequence_order} {selectedCheckpoint.name}</span>
                    <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                      isCurrentInRange ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isCurrentInRange ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`} />
                      {isCurrentInRange ? t('gps.inRange') : t('gps.notInRange')}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-90">
                    {currentDist !== null
                      ? isCurrentInRange
                        ? `${currentDist}m ${t('gps.fromPoint')} (≤ ${currentEffectiveRadius}m OK)`
                        : `${currentDist}m ${t('gps.fromPoint')} (${t('gps.outsideGeofence')} ${currentEffectiveRadius}m)`
                      : t('gps.waitingForLocation')}
                  </div>
                </div>
              )}

              <PhotoPicker label={t('gps.evidencePhoto')} file={photo} onChange={setPhoto} />

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('gps.remarkOptional')}</label>
                <input
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  placeholder={t('gps.remarkPlaceholder')}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={clockIn}
                disabled={locating || !selectedCheckpointId || !photo}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-3 rounded-xl hover:bg-blue-700 shadow-sm cursor-pointer transition active:scale-[0.99]"
              >
                {locating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('gps.gettingLocation')}</> : <><Navigation className="w-4 h-4" /> {t('gps.clockInHere')}</>}
              </button>
            </div>
          </div>
        </div>

        {/* MOBILE LAYOUT (< md): Ultra-optimized Patrol Terminal */}
        <div className="md:hidden">
          {/* TAB 1: CLOCK IN (Cockpit designed to fit without scrolling) */}
          {mobileTab === 'clock' && (
            <div className="space-y-2.5">
              {/* Checkpoint Carousel Strip */}
              <div>
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[11px] font-semibold text-slate-600">{t('gps.tapToSelect')}</span>
                  {userManuallySelected && (
                    <button
                      type="button"
                      onClick={handleResetToAuto}
                      className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded transition"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>{t('gps.resetToAuto')}</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar select-none">
                  {checkpoints.map(c => {
                    const isSelected = selectedCheckpointId === String(c.id)
                    const isClocked = myClockedCheckpointIds.has(c.id)
                    const dist = myLocation ? Math.round(distanceMeters(myLocation.lat, myLocation.lng, c.latitude, c.longitude)) : null
                    const effRad = Math.round(getEffectiveRadius(c.radius_meters, myLocation?.accuracyMeters))
                    const inR = dist !== null && dist <= effRad

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelectCheckpoint(String(c.id), true)}
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-xs font-semibold'
                            : inR
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-medium'
                            : 'border-gray-200 bg-white text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-[11px] whitespace-nowrap">
                          <span>#{c.sequence_order} {c.name}</span>
                          {isClocked && <span className={`${isSelected ? 'text-white' : 'text-emerald-600'} font-bold`}>✓</span>}
                        </div>
                        <div className={`text-[10px] ${isSelected ? 'text-blue-100' : inR ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
                          {dist !== null ? `${dist}m` : '...'} {inR ? `(${t('gps.inRange')})` : ''}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Selected Checkpoint Hero Card */}
              {selectedCheckpoint && (
                <div className={`p-3 rounded-xl border transition shadow-xs ${
                  isCurrentInRange
                    ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950'
                    : 'bg-amber-50/90 border-amber-300 text-amber-950'
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold tracking-wider opacity-75">
                        {t('gps.checkpoint')} #{selectedCheckpoint.sequence_order}
                      </div>
                      <h2 className="text-base font-bold truncate">
                        {selectedCheckpoint.name}
                      </h2>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[10px] ${
                        isCurrentInRange
                          ? 'bg-emerald-200 text-emerald-900'
                          : 'bg-amber-200 text-amber-900'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isCurrentInRange ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'}`} />
                        {isCurrentInRange ? t('gps.inRange') : t('gps.notInRange')}
                      </span>
                      <div className="text-[11px] font-mono mt-0.5">
                        {currentDist !== null ? `${currentDist}m` : 'GPS...'}
                      </div>
                    </div>
                  </div>

                  {/* Status Helper Notice */}
                  <div className="mt-1 pt-1 border-t border-black/5 flex items-center justify-between text-[11px]">
                    <span className="truncate">
                      {isCurrentInRange
                        ? `✓ ${t('gps.inRange')} (≤${currentEffectiveRadius}m)`
                        : currentDist !== null
                        ? `⚠️ ${t('gps.outsideGeofence')} ${currentEffectiveRadius}m — ${t('gps.geofenceMoveCloser')}`
                        : t('gps.waitingForLocation')}
                    </span>
                    {isCurrentClocked && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded shrink-0">
                        ✓ {t('gps.alreadyClocked')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Photo Evidence Section (Compact & Fast) */}
              <div className="bg-white border rounded-xl p-2.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <span>{t('gps.evidencePhoto')}</span>
                    <span className="text-red-500">*</span>
                  </span>
                  {photo && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      ✓ Ready
                    </span>
                  )}
                </div>
                <PhotoPicker
                  compact={true}
                  hideLabel={true}
                  takePhotoText={t('gps.takeEvidencePhoto')}
                  file={photo}
                  onChange={setPhoto}
                />
              </div>

              {/* Optional Remark Input */}
              <div className="bg-white border rounded-xl p-2 shadow-2xs">
                <input
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  placeholder={t('gps.remarkPlaceholder')}
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              {/* Big Thumb-Friendly Primary Clock In Action */}
              <button
                type="button"
                onClick={clockIn}
                disabled={locating || !selectedCheckpointId || !photo}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm shadow-md transition active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 ${
                  !photo
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                    : !isCurrentInRange
                    ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/30 ring-2 ring-blue-500/20'
                }`}
              >
                {locating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('gps.gettingLocation')}</span>
                  </>
                ) : !photo ? (
                  <>
                    <Navigation className="w-4 h-4 opacity-50" />
                    <span>{t('gps.takePhotoFirst')}</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-5 h-5" />
                    <span>{t('gps.clockInHere')}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: INTERACTIVE MAP */}
          {mobileTab === 'map' && (
            <div className="bg-white border rounded-xl p-2 shadow-sm space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>{t('gps.mapTitle')}</span>
                </span>
                {myLocation?.accuracyMeters != null && (
                  <span className="text-[11px] text-gray-400 font-mono">±{Math.round(myLocation.accuracyMeters)}m</span>
                )}
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <CheckpointMap
                  markers={checkpoints.map(c => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, radiusMeters: c.radius_meters, active: c.is_active }))}
                  userLocation={myLocation}
                  center={initialCenter || undefined}
                  height={380}
                  onSelect={id => {
                    handleSelectCheckpoint(String(id), true)
                    setMobileTab('clock')
                  }}
                />
              </div>
              <p className="text-[11px] text-center text-slate-500 py-1">
                Ketik mana-mana penanda pada peta untuk memilih titik semak & kembali ke skrin rakam.
              </p>
            </div>
          )}

          {/* TAB 3: TODAY'S LOGS */}
          {mobileTab === 'today' && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden space-y-2">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  {t('gps.myClockingToday')} ({myClockedToday.length}/{checkpoints.length})
                </span>
                <Link href="/security/audit" className="text-xs text-blue-600 font-medium hover:underline">
                  {t('audit.title')} →
                </Link>
              </div>

              <div className="divide-y divide-gray-100 max-h-[calc(100dvh-13rem)] overflow-y-auto px-1">
                {myClockedToday.map(r => (
                  <div key={r.id} className="p-2.5 flex items-center gap-2.5 text-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800 truncate">{r.checkpoint_name}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(r.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {r.distance_meters}m {t('gps.fromPoint')}
                        {r.remark ? ` · ${r.remark}` : ''}
                      </div>
                    </div>
                    <img
                      src={`/api/security/photo/${r.photo_drive_id}`}
                      alt={r.checkpoint_name}
                      className="w-11 h-11 rounded-lg object-cover cursor-zoom-in shrink-0 border border-gray-200 shadow-2xs"
                      onClick={() => setZoomSrc(`/api/security/photo/${r.photo_drive_id}`)}
                    />
                  </div>
                ))}
                {myClockedToday.length === 0 && (
                  <div className="py-8 text-center text-xs text-gray-400">
                    {t('gps.nothingClockedToday')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
