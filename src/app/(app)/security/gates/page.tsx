'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DoorClosed, DoorOpen, Plus, Trash2, X, SlidersHorizontal, Map as MapIcon } from 'lucide-react'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { securityDict } from '@/lib/i18n/dict/security'
import LanguageSwitcher from '@/components/LanguageSwitcher'

type Gate = { id: number; name: string; pos_x: number; pos_y: number; status: 'locked' | 'open'; updated_at: string }
type Layout = { id: number; photo_drive_id: string | null; photo_url: string | null } | null

export default function GatesPage() {
  const supabase = createClient()
  const [gates, setGates] = useState<Gate[]>([])
  const [layout, setLayout] = useState<Layout>(null)
  const [isManager, setIsManager] = useState(false)
  const [editing, setEditing] = useState<Gate | null>(null)
  const [placing, setPlacing] = useState(false)
  const [newGateName, setNewGateName] = useState('')
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [mobileTab, setMobileTab] = useState<'controls' | 'map'>('controls')
  const mapRef = useRef<HTMLDivElement>(null)
  const didDragRef = useRef(false)
  const [lang, setLang] = useLang()
  const t = makeT(securityDict, lang)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: gateRows }, { data: layoutRow }, { data: { user } }] = await Promise.all([
      supabase.from('security_gates').select('*').order('id'),
      supabase.from('security_layout').select('id, photo_drive_id, photo_url').order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.auth.getUser(),
    ])
    setGates(gateRows || [])
    setLayout(layoutRow)

    if (user) {
      const { data: access } = await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'security').maybeSingle()
      setIsManager(access?.role === 'admin' || access?.role === 'manager')
    }
  }

  async function toggleGate(gate: Gate) {
    const { data: { user } } = await supabase.auth.getUser()
    const newStatus = gate.status === 'locked' ? 'open' : 'locked'
    const { error } = await supabase.from('security_gates').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', gate.id)
    if (error) { alert('Error: ' + error.message); return }
    await supabase.from('security_gate_events').insert([{ gate_id: gate.id, gate_name: gate.name, action: newStatus, username: user?.email || null }])
    load()
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, gate: Gate) {
    if (!isManager || placing) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    didDragRef.current = false
    setDragId(gate.id)
    setDragPos({ x: gate.pos_x, y: gate.pos_y })
  }

  function onDragMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (dragId === null || !mapRef.current) return
    const rect = mapRef.current.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    didDragRef.current = true
    setDragPos({ x, y })
  }

  async function endDrag(e: React.PointerEvent<HTMLButtonElement>, gate: Gate) {
    if (dragId === null) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const finalPos = dragPos
    setDragId(null)
    setDragPos(null)
    if (!didDragRef.current || !finalPos) return // treat as a click, not a drag — let onClick handle it
    const { error } = await supabase.from('security_gates').update({ pos_x: finalPos.x, pos_y: finalPos.y }).eq('id', gate.id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos_x = ((e.clientX - rect.left) / rect.width) * 100
    const pos_y = ((e.clientY - rect.top) / rect.height) * 100
    createGate(pos_x, pos_y)
  }

  async function createGate(pos_x: number, pos_y: number) {
    if (!newGateName.trim()) { alert(t('gates.enterNameFirst')); return }
    const { error } = await supabase.from('security_gates').insert([{ name: newGateName.trim(), pos_x, pos_y, status: 'locked', updated_at: new Date().toISOString() }])
    if (error) { alert('Error: ' + error.message); return }
    setNewGateName('')
    setPlacing(false)
    load()
  }

  async function saveGate() {
    if (!editing) return
    const { error } = await supabase.from('security_gates').update({ name: editing.name, pos_x: editing.pos_x, pos_y: editing.pos_y }).eq('id', editing.id)
    if (error) { alert('Error: ' + error.message); return }
    setEditing(null)
    load()
  }

  async function deleteGate(id: number) {
    if (!confirm(t('gates.confirmDelete'))) return
    const { error } = await supabase.from('security_gates').delete().eq('id', id)
    if (error) { alert('Error: ' + error.message); return }
    load()
  }

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><DoorClosed className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" /> {t('gates.title')}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <>
              <input
                value={newGateName}
                onChange={e => setNewGateName(e.target.value)}
                placeholder={t('gates.newGateName')}
                className="border rounded-md px-3 py-1.5 sm:py-2 text-sm"
              />
              <button
                onClick={() => setPlacing(p => !p)}
                className={`flex items-center gap-1.5 text-xs sm:text-sm font-medium px-3 py-1.5 sm:py-2 rounded-lg cursor-pointer ${placing ? 'bg-amber-100 text-amber-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                <Plus className="w-4 h-4" /> {placing ? t('gates.clickToPlace') : t('gates.addGate')}
              </button>
            </>
          )}
          <LanguageSwitcher lang={lang} onChange={setLang} />
        </div>
      </div>

      {/* Mobile Switcher (Controls vs Layout Map) - Zero scroll mode */}
      <div className="md:hidden flex rounded-xl bg-slate-100 p-1 mb-4">
        <button
          type="button"
          onClick={() => setMobileTab('controls')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'controls' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Gate Controls ({gates.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('map')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'map' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>Layout Map</span>
        </button>
      </div>

      {/* Dedicated Mobile Gate Control Cards (Zero-scroll touch UI) */}
      <div className={`space-y-3 mb-6 md:hidden ${mobileTab === 'controls' ? 'block' : 'hidden'}`}>
        {gates.map(g => (
          <div
            key={g.id}
            className={`p-3.5 rounded-xl border flex items-center justify-between shadow-sm transition ${
              g.status === 'locked' ? 'bg-red-50/50 border-red-200' : 'bg-emerald-50/50 border-emerald-200'
            }`}
          >
            <div className="min-w-0 pr-2">
              <div className="font-bold text-base text-slate-900 flex items-center gap-2 truncate">
                {g.status === 'locked' ? (
                  <DoorClosed className="w-5 h-5 text-red-600 flex-shrink-0" />
                ) : (
                  <DoorOpen className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                )}
                <span className="truncate">{g.name}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span className={`font-semibold uppercase text-[10px] px-1.5 py-0.5 rounded ${
                  g.status === 'locked' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {t(`status.${g.status}`)}
                </span>
                <span>{new Date(g.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => toggleGate(g)}
                className={`px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-95 transition ${
                  g.status === 'locked'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {g.status === 'locked' ? <DoorOpen className="w-4 h-4" /> : <DoorClosed className="w-4 h-4" />}
                <span>{g.status === 'locked' ? t('gates.unlock') : t('gates.lock')}</span>
              </button>
              {isManager && (
                <button
                  type="button"
                  onClick={() => setEditing(g)}
                  className="p-2 text-slate-500 hover:text-blue-600 bg-white/80 rounded-lg border border-slate-200 cursor-pointer"
                  title={t('common.edit')}
                >
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              )}
            </div>
          </div>
        ))}
        {gates.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400 bg-white border rounded-xl">{t('gates.noGates')}</p>
        )}
      </div>

      {/* Interactive Map: visible on mobile when 'map' tab is active, always visible on desktop */}
      <div className={`${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}>
        {isManager && <p className="text-xs text-gray-400 mb-2">{t('gates.dragHint')}</p>}
        <div
          ref={mapRef}
          onClick={handleMapClick}
          className={`relative w-full aspect-video bg-gray-100 border rounded-xl overflow-hidden mb-6 ${placing ? 'cursor-crosshair' : ''}`}
        >
          {layout?.photo_url || (layout?.photo_drive_id && layout.photo_drive_id !== 'PENDING') ? (
            <img src={layout.photo_url || `/api/security/photo/${layout!.photo_drive_id}`} className="w-full h-full object-contain" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">{t('gates.noLayout')}</div>
          )}
          {gates.map(g => {
            const pos = dragId === g.id && dragPos ? dragPos : { x: g.pos_x, y: g.pos_y }
            return (
              <button
                key={g.id}
                onPointerDown={e => startDrag(e, g)}
                onPointerMove={onDragMove}
                onPointerUp={e => endDrag(e, g)}
                onClick={e => { e.stopPropagation(); if (!placing && !didDragRef.current) toggleGate(g) }}
                title={`${g.name} — ${g.status}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, touchAction: 'none' }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 group ${isManager && !placing ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === g.id ? 'z-10 scale-110' : ''}`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md ${g.status === 'locked' ? 'bg-red-500' : 'bg-green-500'}`}>
                  {g.status === 'locked' ? <DoorClosed className="w-4 h-4 text-white" /> : <DoorOpen className="w-4 h-4 text-white" />}
                </span>
                <span className="text-[10px] font-semibold bg-white/90 px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">{g.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Full Table: shown on desktop, and on mobile when in map view */}
      <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${mobileTab === 'map' ? 'block' : 'hidden md:block'}`}>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('gates.gate')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('common.status')}</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('gates.lastUpdated')}</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {gates.map(g => (
              <tr key={g.id}>
                <td className="px-4 py-2.5 font-medium">{g.name}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-bold uppercase rounded-full px-2.5 py-1 ${g.status === 'locked' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{t(`status.${g.status}`)}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{new Date(g.updated_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => toggleGate(g)} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 cursor-pointer">
                      {g.status === 'locked' ? t('gates.unlock') : t('gates.lock')}
                    </button>
                    {isManager && (
                      <>
                        <button onClick={() => setEditing(g)} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 cursor-pointer">{t('common.edit')}</button>
                        <button onClick={() => deleteGate(g.id)} className="text-red-500 hover:text-red-700 p-1.5 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {gates.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">{t('gates.noGates')}</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{t('gates.editGate')}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t('common.name')}</label>
            <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm mb-3" />
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('gates.posX')}</label>
                <input type="number" value={editing.pos_x} onChange={e => setEditing({ ...editing, pos_x: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">{t('gates.posY')}</label>
                <input type="number" value={editing.pos_y} onChange={e => setEditing({ ...editing, pos_y: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="bg-gray-100 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-200">{t('common.cancel')}</button>
              <button onClick={saveGate} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">{t('common.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
