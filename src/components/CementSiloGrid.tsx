'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GripVertical, Factory } from 'lucide-react'

export type SiloStock = {
  silo_id: number
  silo: string
  plant: string
  material: string | null
  capacity: number | null
  current_stock: number
  bg_color: string
  // This SILO'S MATERIAL total stock ÷ total average daily usage over the
  // trailing 14 days, summed across every silo holding that material at
  // this plant — a material figure, not a per-container one, so silos
  // sharing a material show the same value. null means no usage was
  // logged for that material in the window, so this isn't computable.
  days_of_cover?: number | null
}

export default function CementSiloGrid({ silosByPlant }: { silosByPlant: [string, SiloStock[]][] }) {
  const supabase = createClient()
  const [colors, setColors] = useState<Record<number, string>>({})
  const [groups, setGroups] = useState(silosByPlant)
  const [selectedPlant, setSelectedPlant] = useState<string>('all')
  const dragSilo = useRef<{ plant: string; siloId: number } | null>(null)

  useEffect(() => setGroups(silosByPlant), [silosByPlant])

  const totalSilosCount = useMemo(() => {
    return groups.reduce((acc, [, silos]) => acc + silos.length, 0)
  }, [groups])

  const visibleGroups = useMemo(() => {
    if (selectedPlant === 'all') return groups
    return groups.filter(([plant]) => plant === selectedPlant)
  }, [groups, selectedPlant])

  async function setColor(siloId: number, color: string) {
    setColors(prev => ({ ...prev, [siloId]: color }))
    await supabase.from('cement_silos').update({ bg_color: color }).eq('id', siloId)
  }

  function onDrop(plant: string, targetSiloId: number) {
    const dragged = dragSilo.current
    dragSilo.current = null
    if (!dragged || dragged.plant !== plant || dragged.siloId === targetSiloId) return

    const next = groups.map(([p, silos]) => [p, [...silos]] as [string, SiloStock[]])
    const group = next.find(([p]) => p === plant)?.[1]
    if (!group) return
    const fromIdx = group.findIndex(s => s.silo_id === dragged.siloId)
    const toIdx = group.findIndex(s => s.silo_id === targetSiloId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = group.splice(fromIdx, 1)
    group.splice(toIdx, 0, moved)
    setGroups(next)

    // Persist the new global display_order
    const flat = next.flatMap(([, silos]) => silos)
    Promise.all(flat.map((s, i) => supabase.from('cement_silos').update({ display_order: i }).eq('id', s.silo_id)))
      .catch(err => console.error('Failed to save silo order:', err))
  }

  return (
    <div className="space-y-4">
      {/* Plant Filter Pills (Visible on mobile & desktop if > 1 plant) */}
      {groups.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedPlant('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              selectedPlant === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>All Plants</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                selectedPlant === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {totalSilosCount}
            </span>
          </button>

          {groups.map(([plant, silos]) => {
            const isSelected = selectedPlant === plant
            return (
              <button
                key={plant}
                type="button"
                onClick={() => setSelectedPlant(plant)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Factory className="w-3 h-3" />
                <span>{plant}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {silos.length}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* MOBILE VIEW (md:hidden): Compact Grid designed to fit in 1 page width and height */}
      <div className="md:hidden space-y-3">
        {visibleGroups.map(([plant, silos]) => (
          <div key={plant}>
            {visibleGroups.length > 1 && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-3 bg-blue-600 rounded-full" />
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{plant}</h3>
                <span className="text-[10px] text-slate-400 font-medium">({silos.length} silos)</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {silos.map(s => {
                const capacity = s.capacity || 100
                const percent = Math.min((s.current_stock / capacity) * 100, 100)
                const fillColor =
                  percent < 15
                    ? 'bg-gradient-to-t from-red-600 to-rose-400'
                    : percent < 30
                    ? 'bg-gradient-to-t from-amber-500 to-yellow-300'
                    : 'bg-gradient-to-t from-emerald-600 to-teal-400'
                const textColor =
                  percent < 15 ? 'text-red-600' : percent < 30 ? 'text-amber-600' : 'text-emerald-600'
                const bg = colors[s.silo_id] ?? s.bg_color

                return (
                  <div
                    key={s.silo_id}
                    className="rounded-xl border border-slate-200/90 p-2 shadow-2xs flex items-center gap-2 relative overflow-hidden"
                    style={{ backgroundColor: bg || '#ffffff' }}
                  >
                    {/* Mini Silo Cylinder Tube */}
                    <div className="relative w-4.5 h-12 rounded-full bg-slate-200/90 overflow-hidden flex-shrink-0 border border-slate-300/60 shadow-inner">
                      <div
                        className={`absolute bottom-0 left-0 w-full transition-all duration-500 ${fillColor}`}
                        style={{ height: `${percent}%` }}
                      />
                    </div>

                    {/* Silo Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 leading-none mb-0.5">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{s.silo}</h4>
                        <span className={`text-[11px] font-black ${textColor}`}>
                          {percent.toFixed(0)}%
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-500 font-medium truncate leading-tight mb-1">
                        {s.material || '—'}
                      </p>

                      <div className="flex items-baseline justify-between text-[10px] leading-none mb-1">
                        <span className="font-bold text-slate-800">{s.current_stock.toFixed(1)}</span>
                        <span className="text-slate-400">/ {capacity} MT</span>
                      </div>

                      {/* Days of cover */}
                      <div className="leading-none">
                        <span
                          className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                            s.days_of_cover == null
                              ? 'bg-slate-100 text-slate-500'
                              : s.days_of_cover < 3
                              ? 'bg-red-100 text-red-700 font-bold'
                              : s.days_of_cover < 7
                              ? 'bg-amber-100 text-amber-800 font-bold'
                              : 'bg-emerald-100 text-emerald-800 font-bold'
                          }`}
                        >
                          {s.days_of_cover == null ? 'No usage' : `${s.days_of_cover.toFixed(1)}d cover`}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* DESKTOP VIEW (hidden md:block): Standard Full-sized Cylinder Cards */}
      <div className="hidden md:block space-y-8">
        {visibleGroups.map(([plant, silos]) => (
          <div key={plant}>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-l-4 border-blue-600 pl-2.5 mb-4">
              {plant}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {silos.map(s => {
                const capacity = s.capacity || 100
                const percent = Math.min((s.current_stock / capacity) * 100, 100)
                const fillColor =
                  percent < 15
                    ? 'bg-gradient-to-t from-red-500 to-rose-400'
                    : percent < 30
                    ? 'bg-gradient-to-t from-amber-400 to-yellow-300'
                    : 'bg-gradient-to-t from-green-500 to-emerald-400'
                const bg = colors[s.silo_id] ?? s.bg_color

                return (
                  <div
                    key={s.silo_id}
                    draggable
                    onDragStart={() => {
                      dragSilo.current = { plant, siloId: s.silo_id }
                    }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(plant, s.silo_id)}
                    className="rounded-2xl border p-4 flex flex-col items-center shadow-xs hover:shadow-md hover:-translate-y-0.5 transition cursor-grab active:cursor-grabbing"
                    style={{ backgroundColor: bg || '#ffffff' }}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 truncate flex-1 text-center">
                        {s.silo}
                      </h4>
                      <input
                        type="color"
                        value={bg || '#ffffff'}
                        onChange={e => setColor(s.silo_id, e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 border-0 bg-transparent cursor-pointer flex-shrink-0"
                        title="Change card color"
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-3 py-0.5 mb-3 truncate max-w-full">
                      {s.material || '—'}
                    </span>

                    <div className="relative w-14 h-36 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`absolute bottom-0 left-0 w-full transition-all duration-700 ${fillColor}`}
                        style={{ height: `${percent}%` }}
                      />
                    </div>

                    <div className="text-xl font-bold text-slate-900 mt-2">{s.current_stock.toFixed(1)}</div>
                    <div className="text-xs text-gray-500">
                      {s.current_stock.toFixed(1)} / {capacity} MT
                    </div>
                    <div className="text-xs text-gray-500">{percent.toFixed(1)}%</div>
                    <div
                      className={`text-[11px] font-semibold rounded-full px-2 py-0.5 mt-1.5 ${
                        s.days_of_cover == null
                          ? 'bg-gray-100 text-gray-400'
                          : s.days_of_cover < 3
                          ? 'bg-red-100 text-red-700'
                          : s.days_of_cover < 7
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                      title="This material's total stock ÷ its total average daily usage over the trailing 14 days, across all its silos at this plant"
                    >
                      {s.days_of_cover == null ? 'No recent usage' : `${s.days_of_cover.toFixed(1)}d cover`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
