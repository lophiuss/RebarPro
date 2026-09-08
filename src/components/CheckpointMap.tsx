'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type CheckpointMarker = { id: number | string; name: string; lat: number; lng: number; radiusMeters: number; active?: boolean }

// Free OpenStreetMap tiles + Leaflet — no API key/billing needed, unlike
// Google Maps. Imperative (not react-leaflet) so there's one less
// dependency to pin and the map instance is easy to keep across re-renders
// without fighting React's render cycle for a library that owns its own DOM.
export default function CheckpointMap({
  markers, pendingPoint, onPick, center, height = 360,
}: {
  markers: CheckpointMarker[]
  pendingPoint?: { lat: number; lng: number; radiusMeters: number } | null
  onPick?: (lat: number, lng: number) => void
  center?: { lat: number; lng: number }
  height?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current).setView(
      center ? [center.lat, center.lng] : [3.139, 101.6869], // KL fallback — recentres once real checkpoints/GPS exist
      center ? 17 : 12
    )
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 20,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    if (onPick) {
      map.on('click', (e: L.LeafletMouseEvent) => onPick(e.latlng.lat, e.latlng.lng))
    }
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
  }, [markers, pendingPoint])

  useEffect(() => {
    if (mapRef.current && center) mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom())
  }, [center?.lat, center?.lng])

  return <div ref={containerRef} style={{ height }} className="w-full rounded-lg border" />
}
