'use client'

import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ShieldCheck, Clock, MapPin, RefreshCw } from 'lucide-react'

export default function KioskBeaconPage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [secondsLeft, setSecondsLeft] = useState(30)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(clockInterval)
  }, [])

  useEffect(() => {
    generateNewToken()
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          generateNewToken()
          return 30
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  async function generateNewToken() {
    const ts = Math.floor(Date.now() / 30000) // 30-sec window
    const token = JSON.stringify({
      type: 'plantpro_gate_qr',
      site: 'Main Plant & Yard',
      window: ts,
      v: 1,
    })
    try {
      const url = await QRCode.toDataURL(token, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      })
      setQrDataUrl(url)
    } catch (err) {
      console.error('Failed to generate QR code:', err)
    }
  }

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-3xl shadow-xl p-8 flex flex-col items-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-6">
          <ShieldCheck className="w-4 h-4" />
          <span>Plant Gate Check-in Terminal</span>
        </div>

        <div className="text-4xl font-extrabold tracking-tight text-slate-900 mb-1">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <p className="text-xs text-slate-400 flex items-center gap-1 mb-6">
          <MapPin className="w-3.5 h-3.5 text-slate-500" /> Main Plant & Yard Gate
        </p>

        <div className="relative p-4 rounded-2xl bg-slate-50 border border-slate-200 shadow-inner mb-6 flex items-center justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Gate Check-In QR" className="w-64 h-64 object-contain rounded-xl" />
          ) : (
            <div className="w-64 h-64 flex items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          )}
        </div>

        <div className="w-full flex items-center justify-between text-xs text-slate-500 px-2 mb-2">
          <span>Scan with phone to clock in</span>
          <span className="font-mono font-semibold text-blue-600">Refreshes in {secondsLeft}s</span>
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${(secondsLeft / 30) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
