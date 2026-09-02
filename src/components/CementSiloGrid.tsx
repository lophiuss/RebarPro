'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { GripVertical } from 'lucide-react'

export type SiloStock = {
  silo_id: number
  silo: string
  plant: string
  material: string | null
  capacity: number | null
  current_stock: number
  bg_color: string
}

export default function CementSiloGrid({ silosByPlant }: { silosByPlant: [string, SiloStock[]][] }) {
  const supabase = createClient()
  const [colors, setColors] = useState<Record<number, string>>({})
  const [groups, setGroups] = useState(silosByPlant)
  const dragSilo = useRef<{ plant: string; siloId: number } | null>(null)

  useEffect(() => setGroups(silosByPlant), [silosByPlant])

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

    // Persist the new global display_order (cards are numbered in on-screen
    // order across every plant group, same as the legacy app's savePreferences()).
    // supabase-js builders are lazy — they only fire once awaited/`.then()`-ed.
    const flat = next.flatMap(([, silos]) => silos)
    Promise.all(flat.map((s, i) => supabase.from('cement_silos').update({ display_order: i }).eq('id', s.silo_id)))
      .catch(err => console.error('Failed to save silo order:', err))
  }

  return (
    <div className="space-y-8">
      {groups.map(([plant, silos]) => (
        <div key={plant}>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-l-4 border-blue-600 pl-2.5 mb-4">
            {plant}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {silos.map(s => {
              const capacity = s.capacity || 100
              const percent = Math.min((s.current_stock / capacity) * 100, 100)
              const fillColor = percent < 15 ? 'bg-gradient-to-t from-red-500 to-rose-400'
                : percent < 30 ? 'bg-gradient-to-t from-amber-400 to-yellow-300'
                : 'bg-gradient-to-t from-green-500 to-emerald-400'
              const bg = colors[s.silo_id] ?? s.bg_color

              return (
                <div
                  key={s.silo_id}
                  draggable
                  onDragStart={() => { dragSilo.current = { plant, siloId: s.silo_id } }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(plant, s.silo_id)}
                  className="rounded-2xl border p-4 flex flex-col items-center shadow-sm hover:shadow-md hover:-translate-y-0.5 transition cursor-grab active:cursor-grabbing"
                  style={{ backgroundColor: bg || '#ffffff' }}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700 truncate flex-1 text-center">{s.silo}</h4>
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
                    <div className={`absolute bottom-0 left-0 w-full transition-all duration-700 ${fillColor}`} style={{ height: `${percent}%` }} />
                  </div>

                  <div className="text-xl font-bold text-slate-900 mt-2">{s.current_stock.toFixed(0)}</div>
                  <div className="text-xs text-gray-500">{s.current_stock.toFixed(0)} / {capacity} kg</div>
                  <div className="text-xs text-gray-500">{percent.toFixed(1)}%</div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
