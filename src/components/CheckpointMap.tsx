'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Both free, no API key/billing (unlike Google's satellite tiles): OSM for
// street, Esri World Imagery for satellite — the same free-tile approach
// as the base street layer, just a second provider for the aerial view.
const STREET_TILES = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors', maxZoom: 20 }
const SATELLITE_TILES = { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri', maxZoom: 19 }

export type CheckpointMarker = { id: number | string; name: string; lat: number; lng: number; radiusMeters: number; active?: boolean }

// Free OpenStreetMap tiles + Leaflet — no API key/billing needed, unlike
// Google Maps. Imperative (not react-leaflet) so there's one less
// dependency to pin and the map instance is easy to keep across re-renders
// without fighting React's render cycle for a library that owns its own DOM.
export default function CheckpointMap({
  markers, pendingPoint, onPick, center, height = 360, userLocation,
}: {
  markers: CheckpointMarker[]
  pendingPoint?: { lat: number; lng: number; radiusMeters: number } | null
  onPick?: (lat: number, lng: number) => void
  center?: { lat: number; lng: number }
  height?: number
  // The viewer's own live GPS position — a "you are here" dot, distinct
  // from checkpoint markers (no geofence circle, different color/style).
  userLocation?: { lat: number; lng: number; accuracyMeters?: number } | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const streetLayerRef = useRef<L.TileLayer | null>(null)
  const satelliteLayerRef = useRef<L.TileLayer | null>(null)
  const [satellite, setSatellite] = useState(false)
  // The click listener below is attached once, at mount — but `onPick` is
  // undefined on that very first render (the parent's canManage/role check
  // is still loading), so a plain closure over `onPick` would permanently
  // miss clicks even after the parent re-renders with a real handler. A
  // ref sidesteps that: the listener always reads whatever onPick is now.
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView(
      center ? [center.lat, center.lng] : [3.139, 101.6869], // KL fallback — recentres once real checkpoints/GPS exist
      center ? 17 : 12
    )
    streetLayerRef.current = L.tileLayer(STREET_TILES.url, { attribution: STREET_TILES.attribution, maxZoom: STREET_TILES.maxZoom }).addTo(map)
    satelliteLayerRef.current = L.tileLayer(SATELLITE_TILES.url, { attribution: SATELLITE_TILES.attribution, maxZoom: SATELLITE_TILES.maxZoom })
    layerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => onPickRef.current?.(e.latlng.lat, e.latlng.lng))
    mapRef.current = map
    // Leaflet sizes itself off the container's dimensions at creation time —
    // if this mounted inside a hidden/animating panel that box can be wrong,
    // so re-measure shortly after mount.
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()

    for (const m of markers) {
      const color = m.active === false ? '#9ca3af' : '#f97316'
      L.circleMarker([m.lat, m.lng], { radius: 6, color, fillColor: color, fillOpacity: 1 }).addTo(layer).bindTooltip(m.name)
      L.circle([m.lat, m.lng], { radius: m.radiusMeters, color, fillColor: color, fillOpacity: 0.08, weight: 1 }).addTo(layer)
    }
    if (pendingPoint) {
      L.circleMarker([pendingPoint.lat, pendingPoint.lng], { radius: 7, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1 }).addTo(layer).bindTooltip('New point')
      L.circle([pendingPoint.lat, pendingPoint.lng], { radius: pendingPoint.radiusMeters, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.12, weight: 1.5, dashArray: '4' }).addTo(layer)
    }
    if (userLocation) {
      // A white-ringed blue dot reads as "you are here" distinct from the
      // orange checkpoint markers; the faint accuracy circle (when the
      // device reports one) shows how much to trust the exact position.
      if (userLocation.accuracyMeters) {
        L.circle([userLocation.lat, userLocation.lng], { radius: userLocation.accuracyMeters, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.08 }).addTo(layer)
      }
      L.circleMarker([userLocation.lat, userLocation.lng], { radius: 8, color: '#ffffff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 }).addTo(layer).bindTooltip('You are here')
    }
  }, [markers, pendingPoint, userLocation])

  useEffect(() => {
    if (mapRef.current && center) mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom())
  }, [center?.lat, center?.lng])

  useEffect(() => {
    const map = mapRef.current
    const street = streetLayerRef.current
    const sat = satelliteLayerRef.current
    if (!map || !street || !sat) return
    if (satellite) { map.removeLayer(street); map.addLayer(sat) }
    else { map.removeLayer(sat); map.addLayer(street) }
  }, [satellite])

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height }} className="w-full rounded-lg border" />
      <button
        type="button"
        onClick={() => setSatellite(v => !v)}
        className="absolute top-2 right-2 z-[1000] bg-white border rounded-md px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow hover:bg-gray-50"
      >
        {satellite ? 'Street view' : 'Satellite view'}
      </button>
    </div>
  )
}
