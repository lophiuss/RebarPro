'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Unlock, RotateCcw, GripVertical, X, Plus, LayoutGrid } from 'lucide-react'
import { savePref } from './actions'

// The configurable panel grid shared by My Workspace and a meeting's Workspace
// tab: drag a panel's handle to reorder, drag its corner to resize, remove
// panels you don't need, add them back from "Add panel", lock the layout. Each
// person's layout is saved to their own account under `prefKey`.

export type TileDef = { id: string; title: string; count?: number; node: React.ReactNode }
type Size = { w: number; h: number }
export type Layout = { order: string[]; size: Record<string, Size>; hidden: string[]; locked: boolean }

export type TileDefaults = { order: string[]; size: Record<string, Size>; hidden?: string[] }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// Whatever was saved is checked before use, so an old or damaged layout can
// never hide a panel by accident or break the page.
export function cleanLayout(saved: any, ids: string[], d: TileDefaults): Layout {
  const base: Layout = { order: d.order.filter(i => ids.includes(i)), size: { ...d.size }, hidden: (d.hidden ?? []).filter(i => ids.includes(i)), locked: false }
  if (!saved || typeof saved !== 'object') {
    for (const id of ids) if (!base.order.includes(id)) base.order.push(id)
    return base
  }
  const order: string[] = []
  for (const id of Array.isArray(saved.order) ? saved.order : []) if (ids.includes(id) && !order.includes(id)) order.push(id)
  const hidden: string[] = Array.isArray(saved.hidden) ? saved.hidden.filter((id: string) => ids.includes(id)) : base.hidden
  // A panel added to the app later appears at the end (unless it is hidden by default).
  for (const id of ids) if (!order.includes(id)) { order.push(id); if ((d.hidden ?? []).includes(id) && !hidden.includes(id) && !Array.isArray(saved.hidden)) hidden.push(id) }
  const size = { ...d.size }
  for (const id of ids) {
    const s = saved.size?.[id]
    if (s && Number.isFinite(s.w) && Number.isFinite(s.h)) size[id] = { w: clamp(Math.round(s.w), 3, 12), h: clamp(Math.round(s.h / 20) * 20, 200, 1000) }
    if (!size[id]) size[id] = { w: 6, h: 400 }
  }
  return { order, size, hidden, locked: !!saved.locked }
}

function Tile({ tile, layout, onLayout, gridRef, dragging, setDragging }: {
  tile: TileDef
  layout: Layout; onLayout: (next: Layout) => void
  gridRef: React.RefObject<HTMLDivElement | null>
  dragging: string | null; setDragging: (id: string | null) => void
}) {
  const { id, title, count } = tile
  const [armed, setArmed] = useState(false)
  const [over, setOver] = useState(false)
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const size = layout.size[id]
  const locked = layout.locked

  return (
    <section
      draggable={!locked && armed}
      onDragStart={e => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }}
      onDragEnd={() => { setDragging(null); setArmed(false); setOver(false) }}
      onDragOver={e => { if (!locked && dragging && dragging !== id) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault()
        setOver(false)
        if (locked || !dragging || dragging === id) return
        const order = layout.order.filter(x => x !== dragging)
        order.splice(order.indexOf(id), 0, dragging)
        onLayout({ ...layout, order })
        setDragging(null)
      }}
      style={{ '--span': size.w, '--h': `${size.h}px` } as React.CSSProperties}
      className={`relative col-span-12 lg:col-span-(--span) lg:h-(--h) flex flex-col rounded-xl border bg-white shadow-sm ${dragging === id ? 'opacity-50' : ''} ${over ? 'ring-2 ring-blue-400' : ''}`}
    >
      <header className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0">
        {!locked && (
          <button
            type="button"
            onPointerDown={() => setArmed(true)}
            onPointerUp={() => setArmed(false)}
            title="Drag to move this panel"
            aria-label={`Move ${title}`}
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 touch-none -ml-1 p-0.5"
          ><GripVertical className="w-4 h-4" /></button>
        )}
        <h2 className="font-bold text-slate-900">{title}{count != null && <span className="ml-1.5 text-gray-400 font-normal text-sm">({count})</span>}</h2>
        {!locked && <span className="ml-auto text-[11px] text-gray-400 tabular-nums hidden lg:inline">{size.w}/12 cols</span>}
        {!locked && (
          <button
            type="button"
            onClick={() => onLayout({ ...layout, hidden: [...layout.hidden, id] })}
            title="Remove this panel (add it back from “Add panel”)"
            aria-label={`Remove ${title}`}
            className="text-gray-300 hover:text-red-500"
          ><X className="w-4 h-4" /></button>
        )}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 max-h-[34rem] lg:max-h-none">{tile.node}</div>

      {!locked && (
        <div
          role="separator"
          aria-label={`Resize ${title}`}
          title="Drag to resize"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); resize.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h } }}
          onPointerMove={e => {
            const r = resize.current
            const grid = gridRef.current
            if (!r || !grid) return
            const colWidth = (grid.clientWidth + 16) / 12
            const w = clamp(Math.round(r.w + (e.clientX - r.x) / colWidth), 3, 12)
            const h = clamp(Math.round((r.h + (e.clientY - r.y)) / 20) * 20, 200, 1000)
            if (w !== size.w || h !== size.h) onLayout({ ...layout, size: { ...layout.size, [id]: { w, h } } })
          }}
          onPointerUp={() => { resize.current = null }}
          className="hidden lg:block absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none"
        >
          <svg viewBox="0 0 20 20" className="w-5 h-5 text-gray-300 hover:text-blue-500"><path d="M18 6 6 18M18 12l-6 6M18 17l-1 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>
        </div>
      )}
    </section>
  )
}

export default function TileGrid({ tiles, prefKey, savedLayout, defaults, children }: {
  tiles: TileDef[]
  prefKey: string
  savedLayout: unknown
  defaults: TileDefaults
  /** Extra content shown above the grid, e.g. a hint. */
  children?: React.ReactNode
}) {
  const ids = tiles.map(t => t.id)
  const [layout, setLayout] = useState<Layout>(() => cleanLayout(savedLayout, ids, defaults))
  const [dragging, setDragging] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const lastSaved = useRef<string>(JSON.stringify(cleanLayout(savedLayout, ids, defaults)))
  const byId = new Map(tiles.map(t => [t.id, t]))

  // Save the layout shortly after it stops changing (and not on first load).
  useEffect(() => {
    const json = JSON.stringify(layout)
    if (json === lastSaved.current) return
    const t = setTimeout(() => { lastSaved.current = json; savePref(prefKey, layout).catch(() => { /* a failed save just means it isn't remembered */ }) }, 600)
    return () => clearTimeout(t)
  }, [layout, prefKey])

  const visible = layout.order.filter(id => byId.has(id) && !layout.hidden.includes(id))
  const hidden = layout.order.filter(id => byId.has(id) && layout.hidden.includes(id))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <button
          onClick={() => setLayout(l => ({ ...l, locked: !l.locked }))}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${layout.locked ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-gray-50'}`}
          aria-pressed={layout.locked}
        >
          {layout.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {layout.locked ? 'Layout locked' : 'Lock layout'}
        </button>
        {!layout.locked && (
          <>
            <div className="relative">
              <button onClick={() => setMenu(m => !m)} disabled={hidden.length === 0} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50" aria-expanded={menu}>
                <Plus className="w-4 h-4" /> Add panel{hidden.length ? ` (${hidden.length})` : ''}
              </button>
              {menu && hidden.length > 0 && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <ul className="absolute z-40 mt-1 w-56 rounded-lg border bg-white shadow-lg py-1">
                    {hidden.map(id => (
                      <li key={id}>
                        <button
                          onClick={() => { setLayout(l => ({ ...l, hidden: l.hidden.filter(x => x !== id) })); setMenu(false) }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 inline-flex items-center gap-2"
                        ><LayoutGrid className="w-3.5 h-3.5 text-gray-400" /> {byId.get(id)!.title}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <button onClick={() => { if (confirm('Put all panels back to the default layout?')) setLayout(cleanLayout(null, ids, defaults)) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium hover:bg-gray-50">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          </>
        )}
        <p className="text-xs text-gray-500">
          {layout.locked ? 'Panels stay where they are. Unlock to move, resize, add or remove them.' : 'Drag a panel’s handle to move it, its bottom-right corner to resize it, × to remove it. Lock the layout to keep it.'}
        </p>
      </div>
      {children}

      {visible.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">All panels are removed. Unlock the layout and use “Add panel”.</div>
      ) : (
        <div ref={gridRef} className="grid grid-cols-12 gap-4 items-start">
          {visible.map(id => (
            <Tile key={id} tile={byId.get(id)!} layout={layout} onLayout={setLayout} gridRef={gridRef} dragging={dragging} setDragging={setDragging} />
          ))}
        </div>
      )}
    </div>
  )
}
