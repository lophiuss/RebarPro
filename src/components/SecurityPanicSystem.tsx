'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Siren, X } from 'lucide-react'

// Global panic button + alert for the Security department. Replaces the
// legacy app's SSE broadcast with a Supabase Realtime subscription: any
// signed-in security member with a /security/* page open gets the same
// full-screen red alert + synthesized siren the instant anyone triggers it.
//
// IMPORTANT LIMITATION (ask before assuming this replaces a physical
// alarm): this only reaches browsers that currently have the app open. A
// guard whose laptop is asleep, or who never opened the site, gets nothing.
// See the note on the Settings page for what to do about that.
export default function SecurityPanicSystem() {
  const supabase = createClient()
  const [showTrigger, setShowTrigger] = useState(false)
  const [remark, setRemark] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [panicAlert, setPanicAlert] = useState<{ triggeredBy: string; remark: string | null } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sirenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel('security-panic')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_panic_logs' }, payload => {
        setPanicAlert({ triggeredBy: payload.new.triggered_by, remark: payload.new.remark })
        playSiren()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel); stopSiren() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function playSiren() {
    stopSiren()
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    audioCtxRef.current = ctx

    const cycle = () => {
      if (!audioCtxRef.current) return
      const osc1 = ctx.createOscillator()
      const osc2 = ctx.createOscillator()
      const gain = ctx.createGain()
      osc1.type = 'square'
      osc2.type = 'sawtooth'
      osc1.frequency.setValueAtTime(600, ctx.currentTime)
      osc1.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.8)
      osc1.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.6)
      osc2.frequency.setValueAtTime(610, ctx.currentTime)
      osc2.frequency.linearRampToValueAtTime(1210, ctx.currentTime + 0.8)
      osc2.frequency.linearRampToValueAtTime(610, ctx.currentTime + 1.6)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1)
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5)
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.6)
      osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination)
      osc1.start(); osc2.start()
      osc1.stop(ctx.currentTime + 1.6); osc2.stop(ctx.currentTime + 1.6)
      sirenTimeoutRef.current = setTimeout(cycle, 1600)
    }
    cycle()
  }

  function stopSiren() {
    if (sirenTimeoutRef.current) { clearTimeout(sirenTimeoutRef.current); sirenTimeoutRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
  }

  function dismissLocal() {
    stopSiren()
    setPanicAlert(null)
  }

  async function triggerPanic() {
    setTriggering(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user?.id).maybeSingle()
      const triggeredBy = profile?.full_name || user?.email || 'Unknown'
      const { error } = await supabase.from('security_panic_logs').insert([{ triggered_by: triggeredBy, remark: remark.trim() || null }])
      if (error) throw error
      setShowTrigger(false)
      setRemark('')
    } catch (err: any) {
      alert('Error triggering panic alert: ' + err.message)
    } finally {
      setTriggering(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowTrigger(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-5 py-3.5 rounded-full shadow-lg shadow-red-600/30"
        title="Trigger a global panic alert to every security staff with the app open"
      >
        <Siren className="w-5 h-5" /> PANIC
      </button>

      {showTrigger && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-red-600 flex items-center gap-2"><Siren className="w-5 h-5" /> Trigger Panic Alert</h2>
              <button onClick={() => setShowTrigger(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">This alerts every security staff member who currently has the app open, right now, with a siren.</p>
            <label className="block text-xs font-medium text-gray-500 mb-1">Remark (optional — location, what's happening)</label>
            <input value={remark} onChange={e => setRemark(e.target.value)} autoFocus className="w-full border rounded-md px-3 py-2 text-sm mb-4" />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowTrigger(false)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">Cancel</button>
              <button onClick={triggerPanic} disabled={triggering} className="bg-red-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-red-700">
                {triggering ? 'Sending...' : 'Send Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {panicAlert && (
        <div className="fixed inset-0 bg-red-700/95 z-[100] flex items-center justify-center p-6 text-center">
          <div>
            <div className="text-7xl mb-4 animate-pulse">🚨</div>
            <h1 className="text-3xl font-extrabold text-white mb-2">EMERGENCY ALERT</h1>
            <p className="text-red-100 font-semibold">TRIGGERED BY: {panicAlert.triggeredBy.toUpperCase()} — FOLLOW EMERGENCY PROTOCOLS</p>
            {panicAlert.remark && <p className="text-red-100 font-bold text-lg mt-4">"{panicAlert.remark}"</p>}
            <button onClick={dismissLocal} className="mt-8 bg-white text-red-700 font-bold px-6 py-3 rounded-xl hover:bg-red-50">
              DISMISS LOCAL ALERT
            </button>
          </div>
        </div>
      )}
    </>
  )
}
