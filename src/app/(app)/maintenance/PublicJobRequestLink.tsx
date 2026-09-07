'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode, Copy, Check } from 'lucide-react'

// Same pattern as Security's visitor-checkin kiosk card
// (src/app/(app)/security/settings/page.tsx) — a public, unauthenticated
// form link + QR code, computed client-side since it needs window.location.
export default function PublicJobRequestLink() {
  const [url, setUrl] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const link = `${window.location.origin}/maintenance-request`
    setUrl(link)
    QRCode.toDataURL(link, { width: 200, margin: 1 }).then(setQrDataUrl).catch(() => {})
  }, [])

  function copyLink() {
    navigator.clipboard.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-bold text-slate-700 w-full text-left">
        <QrCode className="w-4 h-4 text-orange-600" /> Public Job Report Link
        <span className="ml-auto text-xs text-gray-400 font-normal">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="flex items-center gap-6 flex-wrap mt-4">
          {qrDataUrl && <img src={qrDataUrl} alt="Work Request form QR code" className="w-32 h-32 border rounded-lg p-1 flex-shrink-0" />}
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs text-gray-500 mb-2">
              Share this with anyone on site — no login needed. They fill in the issue and it lands in{' '}
              <a href="/maintenance/work-requests" className="text-blue-600 hover:underline">Work Requests</a> for a manager to review.
            </p>
            <div className="flex gap-2">
              <input readOnly value={url} className="flex-1 border rounded-md px-3 py-2 text-sm bg-gray-50" />
              <button onClick={copyLink} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200 flex-shrink-0">
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
