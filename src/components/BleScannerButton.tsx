'use client'

import React, { useState } from 'react'
import { Bluetooth, Check, Loader2, AlertCircle } from 'lucide-react'

interface BleScannerButtonProps {
  onBeaconDetected: (beacon: { deviceName: string; id: string }) => void
  disabled?: boolean
  className?: string
}

export default function BleScannerButton({
  onBeaconDetected,
  disabled = false,
  className = '',
}: BleScannerButtonProps) {
  const [scanning, setScanning] = useState(false)
  const [detectedName, setDetectedName] = useState<string | null>(null)
  const [unsupportedMsg, setUnsupportedMsg] = useState<string | null>(null)

  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  async function handleScan() {
    setUnsupportedMsg(null)
    setDetectedName(null)

    if (isIos) {
      setUnsupportedMsg('Apple Safari blocks Web Bluetooth on iOS. Please use GPS Geofence or scan the Gate Kiosk QR!')
      return
    }

    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      setUnsupportedMsg('Web Bluetooth is not supported on this browser. Use Chrome on Android or Desktop, or switch to GPS Geofence.')
      return
    }

    try {
      setScanning(true)
      const navAny = navigator as any
      // Request device with generic access or acceptAllDevices
      const device = await navAny.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'battery_service'],
      })

      if (device) {
        const name = device.name || 'Factory BLE Beacon'
        setDetectedName(name)
        onBeaconDetected({ deviceName: name, id: device.id })
      }
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        setUnsupportedMsg(err?.message || 'Bluetooth scan cancelled or unavailable.')
      }
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <button
        type="button"
        disabled={disabled || scanning}
        onClick={handleScan}
        className={`w-full py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold transition border ${
          detectedName
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-indigo-50/80 border-indigo-200 text-indigo-700 hover:bg-indigo-100/80'
        } ${className}`}
      >
        {scanning ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span>Scanning for Workshop Beacon...</span>
          </>
        ) : detectedName ? (
          <>
            <Check className="w-4 h-4 text-emerald-600" />
            <span className="truncate">Connected: {detectedName}</span>
          </>
        ) : (
          <>
            <Bluetooth className="w-4 h-4 text-indigo-600" />
            <span>Verify via Bluetooth Beacon</span>
          </>
        )}
      </button>

      {unsupportedMsg && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-[11px] text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <span>{unsupportedMsg}</span>
        </div>
      )}
    </div>
  )
}
