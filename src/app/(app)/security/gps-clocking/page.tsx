'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadSecurityPhoto } from '../actions'
import { Navigation, MapPin, CheckCircle2, Loader2 } from 'lucide-react'
import PhotoPicker from '@/components/PhotoPicker'
import PhotoLightbox from '@/components/PhotoLightbox'
import CheckpointMap from '@/components/CheckpointMap'

type Checkpoint = { id: number; name: string; latitude: number; longitude: number; radius_meters: number; sequence_order: number; is_active: boolean }
type ClockRecord = {
  id: number; checkpoint_id: number | null; checkpoint_name: string; guard_name: string
  clocked_at: string; distance_meters: number; photo_drive_id: string; remark: string | null
}

function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const MAX = 900
  let { width, height } = img
  if (width > height) { if (width > MAX) { height *= MAX / width; width = MAX } }
  else if (height > MAX) { width *= MAX / height; height = MAX }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.75))
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

export default function GpsClockingPage() {
  const supabase = createClient()
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [myName, setMyName] = useState('')
  const [myEmail, setMyEmail] = useState('')
  const [todayRecords, setTodayRecords] = useState<ClockRecord[]>([])
  const [date, setDate] = useState(isoToday())
  const [history, setHistory] = useState<ClockRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedCheckpointId, setSelectedCheckpointId] = useState('')
  const [remark, setRemark] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [locating, setLocating] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number; accuracyMeters?: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  // Centers the map once, on the first GPS fix (or the first checkpoint if
  // GPS never resolves) — myLocation itself updates continuously via
  // watchPosition, and re-centering the whole view on every single tick
  // would fight anyone trying to pan/zoom the map themselves.
  const [initialCenter, setInitialCenter] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => { load() }, [])
  useEffect(() => { loadHistory() }, [date])

  // Keeps the "you are here" dot on the map live as the guard walks around
  // — separate from the fresh, one-off getCurrentPosition() clockIn() does
  // at the actual moment of clocking in (that one has to be exact right
  // then; this one is just for orientation on the map).
  useEffect(() => {
    if (!navigator.geolocation) { setLocationError('This device/browser does not support GPS location'); return }
    const watchId = navigator.geolocation.watchPosition(
      pos => { setLocationError(null); setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyMeters: pos.coords.accuracy || undefined }) },
      err => setLocationError('Could not get your location: ' + err.message),
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
    loadHistory()
  }

  async function loadHistory() {
    const start = new Date(date + 'T00:00:00').toISOString()
    const end = new Date(date + 'T23:59:59.999').toISOString()
    const { data } = await supabase.from('security_clocking_records').select('*').gte('clocked_at', start).lte('clocked_at', end).order('clocked_at', { ascending: false })
    setHistory(data || [])
  }

  const myIdentifier = myName || myEmail
  // "Guided only" sequence — suggests what's next based on the highest
  // sequence number this guard has already clocked today, but never blocks
  // clocking any other checkpoint (see the free-choice dropdown below).
  const myClockedToday = todayRecords.filter(r => r.guard_name === myIdentifier)
  const myClockedCheckpointIds = new Set(myClockedToday.map(r => r.checkpoint_id))
  const nextSuggested = checkpoints.find(c => !myClockedCheckpointIds.has(c.id))
    || checkpoints[0]

  useEffect(() => {
    if (!selectedCheckpointId && nextSuggested) setSelectedCheckpointId(String(nextSuggested.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpoints.length])

  // Which checkpoint (if any) the guard's live location currently falls
  // inside — same haversine-vs-radius test clockIn() does at submit time,
  // just continuous. Auto-selects the dropdown the MOMENT they walk into a
  // new one (not on every position tick, so picking a different checkpoint
  // manually while standing still doesn't get silently reverted).
  const inRangeCheckpoint = myLocation
    ? checkpoints.find(c => distanceMeters(myLocation.lat, myLocation.lng, c.latitude, c.longitude) <= c.radius_meters)
    : undefined
  const lastAutoSelectedRef = useRef<number | null>(null)
  useEffect(() => {
    if (inRangeCheckpoint && inRangeCheckpoint.id !== lastAutoSelectedRef.current) {
      lastAutoSelectedRef.current = inRangeCheckpoint.id
      setSelectedCheckpointId(String(inRangeCheckpoint.id))
    }
    if (!inRangeCheckpoint) lastAutoSelectedRef.current = null
  }, [inRangeCheckpoint?.id])

  async function clockIn() {
    const checkpoint = checkpoints.find(c => c.id === Number(selectedCheckpointId))
    if (!checkpoint) { alert('Please select a checkpoint'); return }
    if (!photo) { alert('A photo is required'); return }
    if (!navigator.geolocation) { alert('This device/browser does not support GPS location'); return }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const { latitude, longitude } = pos.coords
          const dist = distanceMeters(latitude, longitude, checkpoint.latitude, checkpoint.longitude)
          if (dist > checkpoint.radius_meters) {
            alert(`You're ${Math.round(dist)}m from "${checkpoint.name}" — outside its ${checkpoint.radius_meters}m geofence. Move closer and try again.`)
            setLocating(false)
            return
          }
          const blob = await compressImage(photo)
          const fd = new FormData()
          fd.set('photo', blob, 'clocking.jpg')
          fd.set('subfolder', 'clocking')
          const photo_drive_id = await uploadSecurityPhoto(fd)

          const { error } = await supabase.from('security_clocking_records').insert([{
            checkpoint_id: checkpoint.id, checkpoint_name: checkpoint.name, guard_name: myIdentifier,
            latitude, longitude, distance_meters: Math.round(dist), photo_drive_id, remark: remark.trim() || null,
            created_by: myEmail || null,
          }])
          if (error) throw error
          setPhoto(null)
          setRemark('')
          await load()
        } catch (err: any) {
          alert('Error: ' + err.message)
        } finally {
          setLocating(false)
        }
      },
      err => {
        setLocating(false)
        alert('Could not get your location: ' + err.message + '. Make sure location access is allowed for this site.')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  // Session matrix — one row per guard's clocking "session" on the
  // selected date, one column per checkpoint, so a full patrol round reads
  // at a glance instead of scanning the flat chronological list below for
  // who covered what. A checkpoint since renamed/deleted still gets its
  // own column (by whatever name history recorded) rather than losing
  // that data from the matrix.
  const sessionGuards = [...new Set(history.map(h => h.guard_name))].sort()
  const sessionColumns = [
    ...checkpoints.map(c => c.name),
    ...[...new Set(history.map(h => h.checkpoint_name))].filter(n => !checkpoints.some(c => c.name === n)).sort(),
  ]
  function sessionCell(guard: string, checkpointName: string): ClockRecord | null {
    const matches = history.filter(h => h.guard_name === guard && h.checkpoint_name === checkpointName)
    if (matches.length === 0) return null
    return matches.reduce((latest, r) => (new Date(r.clocked_at) > new Date(latest.clocked_at) ? r : latest))
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><Navigation className="w-7 h-7 text-blue-600" /> GPS Clocking</h1>
      <p className="text-sm text-gray-500 mb-6">Clock in at a checkpoint — you must be physically within its marked radius. A photo is required.</p>

      {checkpoints.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 mb-6">
          No active checkpoints are configured yet. Ask a Security admin/manager to add some in Settings.
        </div>
      )}

      {nextSuggested && (
        <div className="flex items-center gap-2.5 bg-blue-600 rounded-xl px-5 py-3 mb-6 text-sm font-semibold text-white">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          Next suggested checkpoint: {nextSuggested.name} <span className="font-normal opacity-80">(#{nextSuggested.sequence_order} — you can still pick any other one below)</span>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><MapPin className="w-4 h-4 text-blue-600" /> Map — checkpoints &amp; your current location</h2>
          {myLocation?.accuracyMeters != null && <span className="text-xs text-gray-400">±{Math.round(myLocation.accuracyMeters)}m accuracy</span>}
        </div>
        {locationError && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{locationError} — make sure location access is allowed for this site.</p>}
        <CheckpointMap
          markers={checkpoints.map(c => ({ id: c.id, name: c.name, lat: c.latitude, lng: c.longitude, radiusMeters: c.radius_meters, active: c.is_active }))}
          userLocation={myLocation}
          center={initialCenter || undefined}
          height={300}
        />
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-8 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Checkpoint</label>
          <select
            value={selectedCheckpointId}
            onChange={e => setSelectedCheckpointId(e.target.value)}
            className={`w-full border-2 rounded-md px-3 py-2 text-sm bg-white transition ${inRangeCheckpoint ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'}`}
          >
            <option value="">Select a checkpoint…</option>
            {checkpoints.map(c => (
              <option key={c.id} value={c.id}>#{c.sequence_order} {c.name}{myClockedCheckpointIds.has(c.id) ? ' — already clocked today' : ''}</option>
            ))}
          </select>
          <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${inRangeCheckpoint ? 'text-green-700' : 'text-gray-400'}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${inRangeCheckpoint ? 'bg-green-500' : 'bg-gray-300'}`} />
            {inRangeCheckpoint ? `In range of ${inRangeCheckpoint.name} — auto-selected` : myLocation ? 'Not within any checkpoint’s geofence right now' : 'Waiting for your location…'}
          </div>
        </div>
        <PhotoPicker label="Evidence Photo (required)" file={photo} onChange={setPhoto} />
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Remark (optional)</label>
          <input value={remark} onChange={e => setRemark(e.target.value)} placeholder="e.g. All clear, gate secured" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <button onClick={clockIn} disabled={locating || !selectedCheckpointId || !photo} className="w-full flex items-center justify-center gap-2 bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-3 rounded-lg hover:bg-blue-700">
          {locating ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting your location…</> : <><Navigation className="w-4 h-4" /> Clock In Here</>}
        </button>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="px-4 py-3 border-b bg-gray-50"><h2 className="text-sm font-bold text-slate-700">My Clocking Today ({myClockedToday.length})</h2></div>
        <div className="divide-y divide-gray-100">
          {myClockedToday.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.checkpoint_name}</div>
                <div className="text-xs text-gray-400">{new Date(r.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · {r.distance_meters}m from point{r.remark ? ` · ${r.remark}` : ''}</div>
              </div>
              <img src={`/api/security/photo/${r.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in flex-shrink-0" onClick={() => setZoomSrc(`/api/security/photo/${r.photo_drive_id}`)} />
            </div>
          ))}
          {myClockedToday.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing clocked yet today.</p>}
        </div>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold text-slate-700">History — All Guards</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-2 py-1.5 text-sm" />
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Guard</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Checkpoint</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Remark</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Photo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {history.map(h => (
              <tr key={h.id}>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{new Date(h.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-2 font-medium whitespace-nowrap">{h.guard_name}</td>
                <td className="px-4 py-2 whitespace-nowrap">{h.checkpoint_name}</td>
                <td className="px-4 py-2 text-gray-500">{h.distance_meters}m</td>
                <td className="px-4 py-2 text-gray-500">{h.remark || '-'}</td>
                <td className="px-4 py-2">
                  <img src={`/api/security/photo/${h.photo_drive_id}`} className="w-8 h-8 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/security/photo/${h.photo_drive_id}`)} />
                </td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No clocking recorded for this date.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-bold text-slate-700">Session Matrix — {date}</h2>
          <p className="text-xs text-gray-400 mt-0.5">One row per guard's patrol that day, one column per checkpoint — click any photo to zoom in.</p>
        </div>
        {sessionGuards.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No clocking recorded for this date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Guard</th>
                  {sessionColumns.map(name => <th key={name} className="px-2 py-2 text-center font-medium text-gray-500 uppercase whitespace-nowrap">{name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessionGuards.map(guard => (
                  <tr key={guard}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap sticky left-0 bg-white">{guard}</td>
                    {sessionColumns.map(name => {
                      const rec = sessionCell(guard, name)
                      return (
                        <td key={name} className="px-2 py-2 text-center">
                          {rec ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <img src={`/api/security/photo/${rec.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => setZoomSrc(`/api/security/photo/${rec.photo_drive_id}`)} />
                              <span className="text-[10px] text-gray-400">{new Date(rec.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PhotoLightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  )
}
