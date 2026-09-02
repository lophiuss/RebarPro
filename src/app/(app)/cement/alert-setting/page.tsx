'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

type LogRow = { id: number; alert_date: string; plant_name: string; material_name: string; variance_pct: number; created_at: string }

export default function AlertSettingPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [pct, setPct] = useState('3')
  const [status, setStatus] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])

  useEffect(() => {
    supabase.from('cement_alert_settings').select('manager_email, variance_threshold_pct').eq('id', 1).single()
      .then(({ data }) => {
        if (data) { setEmail(data.manager_email || ''); setPct(String(data.variance_threshold_pct ?? 3)) }
      })
    supabase.from('cement_alert_log').select('id, alert_date, plant_name, material_name, variance_pct, created_at')
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setLogs(data || []))
  }, [])

  async function save() {
    if (!email.trim()) { alert('Manager email is required'); return }
    const { error } = await supabase.from('cement_alert_settings').update({
      manager_email: email.trim(),
      variance_threshold_pct: Number(pct),
    }).eq('id', 1)
    setStatus(error ? '❌ Failed to save settings' : '✅ Settings saved successfully')
    setTimeout(() => setStatus(null), 4000)
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><AlertTriangle className="w-7 h-7 text-amber-500" /> Variance Alert Settings</h1>

      <div className="bg-white border rounded-xl shadow-sm p-6 mb-8">
        <label className="block text-sm font-semibold text-gray-700 mb-1">Manager Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@example.com" className="w-full border rounded-md px-3 py-2 mb-4" />

        <label className="block text-sm font-semibold text-gray-700 mb-1">Variance Threshold (%)</label>
        <input type="number" step="0.1" min="0" value={pct} onChange={e => setPct(e.target.value)} className="w-full border rounded-md px-3 py-2 mb-4" />

        <Button onClick={save} className="w-full">Save Settings</Button>

        <p className="text-xs text-gray-500 mt-4">Alert will trigger only after <b>Daily Closing</b> (every active silo has a stock take recorded for that day).</p>
        {status && <p className="text-sm font-semibold mt-2">{status}</p>}
      </div>

      <h2 className="text-lg font-bold mb-3">Recent Alerts</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plant</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map(l => (
              <tr key={l.id}>
                <td className="px-4 py-2.5">{l.alert_date}</td>
                <td className="px-4 py-2.5 font-medium">{l.plant_name}</td>
                <td className="px-4 py-2.5">{l.material_name}</td>
                <td className="px-4 py-2.5 text-right font-bold text-red-600">{Number(l.variance_pct).toFixed(2)}%</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No alerts logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
