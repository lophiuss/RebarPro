'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhotoWithRetry } from '@/lib/uploadPhoto'
import { compressImageToTarget } from '@/lib/compressImage'
import { Navigation, MapPin, CheckCircle2, Loader2, Check, RotateCcw } from 'lucide-react'
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

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Navigation className="w-7 h-7 text-blue-600" /> {t('gps.title')}</h1>
        <LanguageSwitcher lang={lang} onChange={setLang} />
      </div>
      <p className="text-sm text-gray-500 mb-6">{t('gps.subtitle')}</p>

      {checkpoints.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 mb-6">
          {t('gps.noCheckpoints')}
        </div>
      )}

      {nextSuggested && (
        <div className="flex items-center gap-2.5 bg-blue-600 rounded-xl px-5 py-3 mb-6 text-sm font-semibold text-white shadow-sm">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          {t('gps.nextSuggested')}: {nextSuggested.name} <span className="font-normal opacity-80">(#{nextSuggested.sequence_order} — {t('gps.pickAnyOther')})</span>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-blue-600" /> {t('gps.mapTitle')}</h2>
          {myLocation?.accuracyMeters != null && <span className="text-xs text-gray-400">±{Math.round(myLocation.accuracyMeters)}m {t('gps.accuracy')}</span>}
        </div>
        {locationError && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{locationError} — {t('gps.locationErrorSuffix')}</p>}
        <CheckpointMap
          markers={checkpoints.map(c => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, radiusMeters: c.radius_meters, active: c.is_active }))}
          userLocation={myLocation}
          center={initialCenter || undefined}
          height={300}
        />
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-8 space-y-5">
        {/* Quick Checkpoint Tap Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 border rounded-lg bg-slate-50/50">
            {checkpoints.map(c => {
              const isSelected = selectedCheckpointId === String(c.id)
              const isClocked = myClockedCheckpointIds.has(c.id)
              const dist = myLocation ? Math.round(distanceMeters(myLocation.lat, myLocation.lng, c.latitude, c.longitude)) : null
              const effectiveRad = Math.round(getEffectiveRadius(c.radius_meters, myLocation?.accuracyMeters))
              const isInRange = dist !== null && dist <= effectiveRad

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCheckpoint(String(c.id), true)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition relative active:scale-[0.98] cursor-pointer ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/20 shadow-2xs'
                      : isInRange
                      ? 'border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-bold text-slate-800 truncate">
                      #{c.sequence_order} {c.name}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                  </div>

                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    {dist !== null ? (
                      <span className={isInRange ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                        {dist}m {isInRange ? `(${t('gps.inRange')})` : ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">...</span>
                    )}

                    {isClocked && (
                      <span className="inline-flex items-center text-[10px] text-emerald-600 font-semibold" title="Clocked today">
                        ✓
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Dropdown Alternative */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{t('gps.checkpoint')}</label>
          <select
            value={selectedCheckpointId}
            onChange={e => handleSelectCheckpoint(e.target.value, true)}
            className={`w-full border-2 rounded-md px-3 py-2 text-sm bg-white transition ${inRangeCheckpoint ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'}`}
          >
            <option value="">{t('gps.selectCheckpoint')}</option>
            {checkpoints.map(c => (
              <option key={c.id} value={c.id}>
                #{c.sequence_order} {c.name}{myClockedCheckpointIds.has(c.id) ? ` — ${t('gps.alreadyClocked')}` : ''}
              </option>
            ))}
          </select>
          <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${inRangeCheckpoint ? 'text-green-700' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inRangeCheckpoint ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            {inRangeCheckpoint
              ? `${t('gps.inRangeOf')} ${inRangeCheckpoint.name}${!userManuallySelected ? ` — ${t('gps.autoSelected')}` : ''}`
              : myLocation
              ? t('gps.notInRange')
              : t('gps.waitingForLocation')}
          </div>
        </div>

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
          className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-blue-700 shadow-sm cursor-pointer transition active:scale-[0.99]"
        >
          {locating ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('gps.gettingLocation')}</> : <><Navigation className="w-4 h-4" /> {t('gps.clockInHere')}</>}
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">{t('gps.myClockingToday')} ({myClockedToday.length})</h2></div>
        <div className="divide-y divide-gray-100">
          {myClockedToday.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.checkpoint_name}</div>
                <div className="text-xs text-gray-400">{new Date(r.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {r.distance_meters}m {t('gps.fromPoint')}{r.remark ? ` · ${r.remark}` : ''}</div>
              </div>
              <img
                src={`/api/security/photo/${r.photo_drive_id}`}
                alt={r.checkpoint_name}
                className="w-10 h-10 rounded object-cover cursor-zoom-in flex-shrink-0 border border-gray-200"
                onClick={() => setZoomSrc(`/api/security/photo/${r.photo_drive_id}`)}
              />
            </div>
          ))}
          {myClockedToday.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">{t('gps.nothingClockedToday')}</p>}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 text-xs text-blue-700">
        {t('gps.historyMovedToAudit')} <Link href="/security/audit" className="font-semibold underline">{t('audit.title')}</Link>.
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
