'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Minus, Search, Pencil, Trash2, Printer, Maximize2, X, UserRound, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { saveSeat, deleteSeat, moveSeat } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'
import { PeopleChecklist } from '../PersonPicker'
import { useLocalPref } from '../usePref'
import type { Person } from '@/lib/meetings'

type Seat = { id: string; parent_id: string | null; title: string; subtitle: string | null; roles: string[]; position: number }
type SeatPerson = { seat_id: string; user_id: string }
type Node = Seat & { children: Node[]; people: Person[] }

const input = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'
const LINE = '#94a3b8'

// One header colour per level, so the structure reads at a glance.
const LEVEL_COLOURS = ['#0f172a', '#1d4ed8', '#0f766e', '#7c3aed', '#b45309', '#be123c']

// Org tree drawn with CSS. Every seat gets a short stem under it (.ot-down);
// every child gets its own bar pieces and drop (::before/::after), so no line
// depends on a neighbour. Vertical: children in a row. Horizontal: a column.
const TREE_CSS = `
.orgtree{--c:${LINE}}
.orgtree .ot-ul{display:flex;justify-content:center;margin:0;padding:0}
.orgtree .ot-li{list-style:none;position:relative;text-align:center;padding:22px 9px 12px}
.orgtree .ot-li::before{content:'';position:absolute;top:0;left:0;width:50%;height:0;border-top:2px solid var(--c)}
.orgtree .ot-li::after{content:'';position:absolute;top:0;left:50%;width:50%;height:22px;border-top:2px solid var(--c);border-left:2px solid var(--c)}
.orgtree .ot-li:first-child::before{display:none}
.orgtree .ot-li:last-child::after{border-top:0}
.orgtree .ot-li:only-child::before{display:none}
.orgtree > .ot-ul > .ot-li{padding-top:0}
.orgtree > .ot-ul > .ot-li::before,.orgtree > .ot-ul > .ot-li::after{display:none}
.orgtree .ot-down{display:block;width:0;height:22px;margin:0 auto;border-left:2px solid var(--c)}

.orgtree.h .ot-ul{flex-direction:column;justify-content:flex-start;align-items:flex-start}
.orgtree.h .ot-li{display:flex;align-items:center;text-align:left;padding:9px 0 9px 24px}
.orgtree.h .orgtree-card{margin:0;flex:none}
.orgtree.h .ot-li::before{top:0;left:0;width:0;height:50%;border-top:0;border-left:2px solid var(--c)}
.orgtree.h .ot-li::after{top:50%;left:0;width:24px;height:50%;border-top:2px solid var(--c);border-left:2px solid var(--c)}
.orgtree.h .ot-li:last-child::after{border-left:0}
.orgtree.h .ot-li:only-child::after{border-left:0}
.orgtree.h > .ot-ul > .ot-li{padding-left:0}
.orgtree.h .ot-down{width:24px;height:0;margin:0;border-left:0;border-top:2px solid var(--c)}
.orgtree.s{width:max-content}
.orgtree.s .ot-ul{display:block;margin:0;padding:0 0 0 38px;position:relative}
.orgtree.s > .ot-ul{padding-left:0}
.orgtree.s .ot-li{display:block;text-align:left;padding:16px 0 0 0;position:relative}
.orgtree.s > .ot-ul > .ot-li{padding-top:0}
.orgtree.s > .ot-ul > .ot-li + .ot-li{padding-top:28px}
/* the vertical spine runs down the left of a group of children; each child has an elbow into its card */
.orgtree.s .ot-li::before{content:'';position:absolute;display:block;left:-24px;top:0;width:0;height:100%;border-top:0;border-left:2px solid var(--c)}
.orgtree.s .ot-li:last-child::before{height:42px}
.orgtree.s .ot-li:first-child::before{display:block}
.orgtree.s .ot-li::after{content:'';position:absolute;display:block;left:-24px;top:42px;width:22px;height:0;border-left:0;border-top:2px solid var(--c)}
.orgtree.s > .ot-ul > .ot-li::before,.orgtree.s > .ot-ul > .ot-li::after{display:none}
.orgtree.s .orgtree-card{margin:0}
.orgtree.s .ot-down{display:none}
@media print{.orgtree-scroll{overflow:visible !important}.orgtree-card .ot-tools{display:none !important}}
`

type SeatContact = { seat_id: string; id: string; name: string }

function buildTree(seats: Seat[], seatPeople: SeatPerson[], peopleById: Map<string, Person>, seatContacts: SeatContact[]): Node[] {
  const byParent = new Map<string | null, Seat[]>()
  for (const s of seats) byParent.set(s.parent_id, [...(byParent.get(s.parent_id) ?? []), s])
  const make = (s: Seat, depth: number): Node => ({
    ...s,
    roles: Array.isArray(s.roles) ? s.roles : [],
    // Logins first, then people from an import who have no login here.
    people: [
      ...seatPeople.filter(sp => sp.seat_id === s.id).map(sp => peopleById.get(sp.user_id)).filter((p): p is Person => !!p),
      ...seatContacts.filter(c => c.seat_id === s.id).map(c => ({ id: 'contact:' + c.id, full_name: c.name, avatar_url: null })),
    ],
    children: depth > 50 ? [] : (byParent.get(s.id) ?? []).sort((a, b) => a.position - b.position).map(c => make(c, depth + 1)),
  })
  return (byParent.get(null) ?? []).sort((a, b) => a.position - b.position).map(r => make(r, 0))
}

function leafCount(nodes: Node[]): number {
  return nodes.reduce((sum, n) => sum + (n.children.length ? leafCount(n.children) : 1), 0)
}

function depthOf(nodes: Node[]): number {
  return nodes.length === 0 ? 0 : 1 + Math.max(...nodes.map(n => depthOf(n.children)))
}

function descendantIds(node: Node): string[] {
  return node.children.flatMap(c => [c.id, ...descendantIds(c)])
}

function matches(n: Node, q: string) {
  return n.title.toLowerCase().includes(q) || (n.subtitle ?? '').toLowerCase().includes(q) || n.people.some(p => (p.full_name ?? '').toLowerCase().includes(q))
}

function Tool({ onClick, label, children, danger }: { onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={`p-1 rounded text-white/80 hover:bg-white/20 hover:text-white ${danger ? 'hover:!bg-red-500/60' : ''}`}>{children}</button>
  )
}

export default function OrgChartView({ seats, seatPeople, seatContacts, people, canEdit }: { seats: Seat[]; seatPeople: SeatPerson[]; seatContacts: SeatContact[]; people: Person[]; canEdit: boolean }) {
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const tree = useMemo(() => buildTree(seats, seatPeople, peopleById, seatContacts), [seats, seatPeople, peopleById, seatContacts])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(100)
  // A chart with many seats side by side is far wider than the page; start it sideways (a column
  // of branches) so it fits without shrinking the text.
  const [layout, setLayout] = useState<'v' | 'h' | 's'>(() => (leafCount(tree) > 10 ? 's' : 'v'))
  const horizontal = layout === 'h'
  const [query, setQuery] = useState('')
  const [rolesPref, setRolesPref] = useLocalPref('av-org-roles', '1')
  const [peoplePref, setPeoplePref] = useLocalPref('av-org-people', '1')
  const [levelsPref, setLevelsPref] = useLocalPref('av-org-levels', '0')
  const showRoles = rolesPref === '1'
  const showPeople = peoplePref === '1'
  const [editing, setEditing] = useState<{ id?: string; parent_id: string | null; title: string; subtitle: string; roles: string; people_ids: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const [printing, setPrinting] = useState<{ paper: 'A4' | 'A3'; landscape: boolean; fit: 'page' | 'width' } | null>(null)
  const [printBusy, setPrintBusy] = useState(false)

  // A tall sideways chart puts the top seat in the middle of the page; bring it into view on load.
  useEffect(() => {
    if (!horizontal) return
    const id = requestAnimationFrame(() => scroller.current?.querySelector('.orgtree-card')?.scrollIntoView({ block: 'center' }))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const q = query.trim().toLowerCase()
  const usersInSeats = new Set(seatPeople.map(sp => sp.user_id)).size + new Set(seatContacts.map(c => c.id)).size
  const levels = depthOf(tree)
  // 0 = every level; otherwise show only this many levels from the top.
  const maxLevels = Math.min(Number(levelsPref) || 0, levels) || 0
  const allNodes = useMemo(() => {
    const out: Node[] = []
    const walk = (ns: Node[]) => ns.forEach(n => { out.push(n); walk(n.children) })
    walk(tree)
    return out
  }, [tree])

  function openAdd(parent: string | null) {
    setEditing({ parent_id: parent, title: '', subtitle: '', roles: '', people_ids: [] })
  }
  function openEdit(n: Node) {
    setEditing({ id: n.id, parent_id: n.parent_id, title: n.title, subtitle: n.subtitle ?? '', roles: n.roles.join('\n'), people_ids: n.people.filter(p => !p.id.startsWith('contact:')).map(p => p.id) })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setSaving(true)
    const ok = await act(async () => {
      await saveSeat({
        id: editing.id, parent_id: editing.parent_id, title: editing.title, subtitle: editing.subtitle,
        roles: editing.roles.split('\n'), people_ids: editing.people_ids,
      })
      return true
    })
    setSaving(false)
    if (ok) setEditing(null)
  }

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Prints the WHOLE chart as it is on screen (collapsed branches stay collapsed), sized to the paper.
  // It is printed from its own hidden page, not from the scrolling app page, so nothing is cut off.
  async function printChart(opts: { paper: 'A4' | 'A3'; landscape: boolean; fit: 'page' | 'width' }) {
    const el = treeRef.current
    if (!el) return
    setPrintBusy(true)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument!
    const head = [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`).join('')
      + [...document.querySelectorAll('style')].map(x => x.outerHTML).join('')
    const sheet = opts.paper === 'A3' ? { w: 420, h: 297 } : { w: 297, h: 210 }
    const [pw, ph] = opts.landscape ? [sheet.w, sheet.h] : [sheet.h, sheet.w]
    const mm = (v: number) => (v * 96) / 25.4
    const availW = mm(pw - 16), availH = mm(ph - 16 - 10)
    const stamp = new Date().toLocaleDateString('en-GB', { dateStyle: 'long' })
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Organizational chart</title>${head}<style>
      @page{size:${opts.paper} ${opts.landscape ? 'landscape' : 'portrait'};margin:8mm}
      html,body{background:#fff!important;margin:0;padding:0}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .ot-tools,button{display:none!important}
      .orgtree-card{break-inside:avoid;box-shadow:none!important}
      #pt{font:600 15px Arial,sans-serif;margin:0 0 4px;color:#0f172a} #pt span{font-weight:400;color:#64748b;font-size:11px;margin-left:8px}
    </style></head><body><div id="pt">Organizational Chart<span>${stamp}</span></div><div id="tree" class="orgtree ${layout === 'v' ? '' : layout}" style="width:max-content;margin:0 auto">${el.innerHTML}</div></body></html>`)
    doc.close()
    // Let the style sheets and fonts arrive, then measure the chart and shrink it to the page.
    await new Promise(r => setTimeout(r, 900))
    try { await doc.fonts?.ready } catch { /* fonts are optional */ }
    const tree = doc.getElementById('tree') as HTMLElement
    const natW = tree.scrollWidth, natH = tree.scrollHeight
    const z = opts.fit === 'page' ? Math.min(availW / natW, availH / natH, 1) : Math.min(availW / natW, 1)
    ;(tree.style as unknown as { zoom: string }).zoom = String(z)
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setPrintBusy(false)
    setPrinting(null)
    setTimeout(() => iframe.remove(), 60000)
  }

  // Zoom so the whole chart fits the width of the page.
  function fit() {
    const box = scroller.current
    if (!box) return
    const visibleLeaves = (nodes: Node[], depth: number): number =>
      nodes.reduce((sum, n) => {
        const open = n.children.length > 0 && !collapsed.has(n.id) && !(maxLevels && depth + 1 >= maxLevels)
        return sum + (open ? visibleLeaves(n.children, depth + 1) : 1)
      }, 0)
    const shownDepth = maxLevels || levels
    const natural = layout === 's' ? shownDepth * 38 + 300 : horizontal ? shownDepth * 300 : visibleLeaves(tree, 0) * 270
    setZoom(Math.max(30, Math.min(100, Math.floor(((box.clientWidth - 48) / Math.max(natural, 1)) * 100))))
  }

  const renderSeat = (n: Node, depth: number) => {
    const hit = !!q && matches(n, q)
    const dim = !!q && !hit
    const hiddenByLevel = !!maxLevels && depth + 1 >= maxLevels
    const isCollapsed = collapsed.has(n.id) || hiddenByLevel
    const count = descendantIds(n).length
    const colour = LEVEL_COLOURS[depth % LEVEL_COLOURS.length]
    return (
      <div className={`orgtree-card group relative block mx-auto text-left w-60 rounded-xl border border-slate-300 bg-white shadow-md ${hit ? 'ring-4 ring-amber-300' : ''} ${dim ? 'opacity-35' : ''}`}>
        <div className="px-3 py-2 rounded-t-xl text-white" style={{ background: colour }}>
          <div className="font-bold leading-tight">{n.title}</div>
          {n.subtitle && <div className="text-xs text-white/80">{n.subtitle}</div>}
          {canEdit && (
            <div className="ot-tools mt-1 -mx-1 hidden group-hover:flex group-focus-within:flex items-center gap-0.5 print:hidden">
              <Tool onClick={() => act(() => moveSeat(n.id, 'up'))} label="Move up a level"><ArrowUp className="w-3.5 h-3.5" /></Tool>
              <Tool onClick={() => act(() => moveSeat(n.id, 'down'))} label="Move down under the seat beside it"><ArrowDown className="w-3.5 h-3.5" /></Tool>
              <Tool onClick={() => act(() => moveSeat(n.id, 'left'))} label="Move left"><ArrowLeft className="w-3.5 h-3.5" /></Tool>
              <Tool onClick={() => act(() => moveSeat(n.id, 'right'))} label="Move right"><ArrowRight className="w-3.5 h-3.5" /></Tool>
              <span className="flex-1" />
              <Tool onClick={() => openEdit(n)} label="Edit seat"><Pencil className="w-3.5 h-3.5" /></Tool>
              <Tool danger onClick={() => confirm(`Delete "${n.title}"${count ? ` and its ${count} sub-seat${count === 1 ? '' : 's'}` : ''}?`) && act(() => deleteSeat(n.id))} label="Delete seat"><Trash2 className="w-3.5 h-3.5" /></Tool>
            </div>
          )}
        </div>
        {(showPeople || (showRoles && n.roles.length > 0)) && (
          <div className="px-3 pt-2 pb-4 text-slate-900">
            {showPeople && (n.people.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 font-semibold"><UserRound className="w-4 h-4" /> Open seat</div>
            ) : (
              <ul className="space-y-1">
                {n.people.map(p => (
                  <li key={p.id} className="flex items-center gap-2 text-sm font-medium"><Avatar person={p} size="sm" /> <span className="truncate">{p.full_name}</span></li>
                ))}
              </ul>
            ))}
            {showRoles && n.roles.length > 0 && (
              <ul className={`${showPeople ? 'mt-2 pt-2 border-t' : ''} space-y-0.5 text-xs text-slate-700 list-disc list-inside`}>
                {n.roles.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
        {/* Bottom edge: add a branch (+) and fold/unfold the branch. */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 flex items-center gap-1 print:hidden">
          {canEdit && (
            <button onClick={() => openAdd(n.id)} aria-label={`Add a seat under ${n.title}`} title="Add a seat below" className="w-6 h-6 rounded-full bg-blue-600 text-white shadow ring-2 ring-white hover:bg-blue-700 inline-flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          )}
          {n.children.length > 0 && (
            <button onClick={() => toggle(n.id)} aria-label={isCollapsed ? 'Show branch' : 'Hide branch'} title={isCollapsed ? `Show ${count} below` : 'Hide this branch'} className="h-6 min-w-6 px-1 rounded-full bg-white text-slate-700 text-[11px] font-semibold shadow ring-1 ring-slate-300 hover:bg-slate-50 inline-flex items-center justify-center gap-0.5">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{isCollapsed ? count : ''}
            </button>
          )}
        </div>
      </div>
    )
  }

  const renderNodes = (nodes: Node[], depth: number) => (
    <ul className="ot-ul">
      {nodes.map(n => {
        const showKids = n.children.length > 0 && !collapsed.has(n.id) && !(maxLevels && depth + 1 >= maxLevels)
        return (
          <li key={n.id} className="ot-li">
            {renderSeat(n, depth)}
            {showKids && <><span className="ot-down" />{renderNodes(n.children, depth + 1)}</>}
          </li>
        )
      })}
    </ul>
  )

  const parentOptions = editing
    ? allNodes.filter(n => {
        if (!editing.id) return true
        const self = allNodes.find(x => x.id === editing.id)
        return n.id !== editing.id && !(self && descendantIds(self).includes(n.id))
      })
    : []

  const btn = 'px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50'

  return (
    <div>
      <style>{TREE_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <div className="mr-2 text-sm text-gray-600"><b>{usersInSeats}</b> users in seats · <b>{levels}</b> level{levels === 1 ? '' : 's'}</div>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          Levels
          <select value={maxLevels} onChange={e => { setLevelsPref(e.target.value); setCollapsed(new Set()) }} className="border rounded-lg px-2 py-1.5 text-sm bg-white" aria-label="Levels to show">
            <option value={0}>All</option>
            {Array.from({ length: Math.max(levels - 1, 0) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button onClick={() => setRolesPref(showRoles ? '0' : '1')} className={`${btn} inline-flex items-center gap-1`} aria-pressed={showRoles}>{showRoles ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showRoles ? 'Hide roles' : 'Show roles'}</button>
        <button onClick={() => setPeoplePref(showPeople ? '0' : '1')} className={`${btn} inline-flex items-center gap-1`} aria-pressed={showPeople}>{showPeople ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {showPeople ? 'Hide people' : 'Show people'}</button>
        <button onClick={() => setCollapsed(new Set(allNodes.filter(n => n.children.length).map(n => n.id)))} className={btn}>Collapse all</button>
        <button onClick={() => { setCollapsed(new Set()); setLevelsPref('0') }} className={btn}>Expand all</button>
        <div className="inline-flex items-center rounded-lg border bg-white text-sm overflow-hidden">
          <button onClick={() => setZoom(z => Math.max(30, z - 10))} aria-label="Zoom out" className="px-2.5 py-1.5 hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
          <span className="px-2 tabular-nums w-24 text-center">{zoom}% Zoom</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 10))} aria-label="Zoom in" className="px-2.5 py-1.5 hover:bg-gray-50"><Plus className="w-4 h-4" /></button>
        </div>
        <button onClick={fit} className={`${btn} inline-flex items-center gap-1`}><Maximize2 className="w-4 h-4" /> Fit screen</button>
        <button onClick={() => setPrinting({ paper: 'A3', landscape: true, fit: layout === 'v' ? 'page' : 'width' })} className={`${btn} inline-flex items-center gap-1`}><Printer className="w-4 h-4" /> Print…</button>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          Layout
          <select value={layout} onChange={e => setLayout(e.target.value as 'v' | 's' | 'h')} className="border rounded-lg px-2 py-1.5 text-sm bg-white" aria-label="Chart layout">
            <option value="s">Stacked (narrow)</option>
            <option value="v">Vertical (wide)</option>
            <option value="h">Sideways</option>
          </select>
        </label>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="pl-8 pr-3 py-1.5 border rounded-lg text-sm bg-white w-40" />
        </div>
        {canEdit && <button onClick={() => openAdd(null)} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"><Plus className="w-4 h-4" /> Add top seat</button>}
      </div>

      {tree.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
          No seats yet. {canEdit ? 'Add the first seat (for example Visionary or Integrator) to start your accountability chart.' : 'A manager can set up the chart.'}
        </div>
      ) : (
        <div
          ref={scroller}
          className="orgtree-scroll overflow-auto border rounded-xl shadow-inner p-8 bg-slate-100"
          style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        >
          {/* margin auto (not flex centring) keeps the chart centred when it is
              narrower than the page, yet scrollable from its left edge when wider. */}
          <div ref={treeRef} style={{ zoom: zoom / 100, width: 'max-content', margin: '0 auto' }} className={`orgtree ${layout === 'v' ? '' : layout}`}>
            {renderNodes(tree, 0)}
          </div>
        </div>
      )}
      {canEdit && tree.length > 0 && <p className="text-xs text-gray-500 mt-2 print:hidden">Hover a box to move it (↑ up a level, ↓ under its neighbour, ← → reorder), edit or delete it. Use the blue + under a box to add a seat beneath it.</p>}

      {printing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">Print the chart</h2>
              <button type="button" onClick={() => setPrinting(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <p className="text-gray-600">Prints exactly what is shown now (hidden branches stay hidden), from its own page so nothing is cut off. Choose “Save as PDF” in the print window to make a file.</p>
              <label className="block font-medium">Paper
                <select value={printing.paper} onChange={e => setPrinting({ ...printing, paper: e.target.value as 'A4' | 'A3' })} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-normal">
                  <option value="A3">A3</option><option value="A4">A4</option>
                </select>
              </label>
              <label className="block font-medium">Orientation
                <select value={printing.landscape ? 'l' : 'p'} onChange={e => setPrinting({ ...printing, landscape: e.target.value === 'l' })} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-normal">
                  <option value="l">Landscape</option><option value="p">Portrait</option>
                </select>
              </label>
              <label className="block font-medium">Size
                <select value={printing.fit} onChange={e => setPrinting({ ...printing, fit: e.target.value as 'page' | 'width' })} className="mt-1 w-full border rounded-lg px-3 py-2 bg-white font-normal">
                  <option value="page">Fit everything on one page</option>
                  <option value="width">Fit the width, continue on more pages if tall</option>
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setPrinting(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button type="button" disabled={printBusy} onClick={() => printChart(printing)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{printBusy ? 'Preparing…' : 'Print'}</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:hidden">
          <form onSubmit={submit} className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-lg">{editing.id ? 'Edit seat' : 'Add seat'}</h2>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm font-medium">Seat title
                <input required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className={`${input} mt-1 font-normal`} placeholder="e.g. Integrator" autoFocus />
              </label>
              <label className="block text-sm font-medium">Department / subtitle <span className="text-gray-400 font-normal">(optional)</span>
                <input value={editing.subtitle} onChange={e => setEditing({ ...editing, subtitle: e.target.value })} className={`${input} mt-1 font-normal`} />
              </label>
              <label className="block text-sm font-medium">Reports to
                <select value={editing.parent_id ?? ''} onChange={e => setEditing({ ...editing, parent_id: e.target.value || null })} className={`${input} mt-1 font-normal`}>
                  <option value="">(top level)</option>
                  {parentOptions.map(n => <option key={n.id} value={n.id}>{n.title}{n.people.length ? ` — ${n.people.map(p => p.full_name).join(', ')}` : ''}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Roles &amp; responsibilities <span className="text-gray-400 font-normal">(one per line)</span>
                <textarea value={editing.roles} onChange={e => setEditing({ ...editing, roles: e.target.value })} rows={5} className={`${input} mt-1 font-normal`} />
              </label>
              <div>
                <div className="text-sm font-medium mb-1">People in this seat <span className="text-gray-400 font-normal">(leave empty for an open seat)</span></div>
                <PeopleChecklist
                  people={people}
                  selected={editing.people_ids}
                  maxHeight="max-h-44"
                  onToggle={id => setEditing({ ...editing, people_ids: editing.people_ids.includes(id) ? editing.people_ids.filter(x => x !== id) : [...editing.people_ids, id] })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border bg-white">Cancel</button>
              <button disabled={saving || !editing.title.trim()} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save seat'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
