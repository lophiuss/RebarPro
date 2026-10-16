'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

// Every seat is placed at computed coordinates (so each branch can use its own layout, like
// Word's organization chart) and the connectors are drawn as SVG lines under the cards.
const TREE_CSS = `
@media print{.orgtree-scroll{overflow:visible !important}.orgtree-card .ot-tools{display:none !important}}
`

// ---- layout ------------------------------------------------------------------------------
// standard: children in a row below. both: children in two columns either side of a centre
// line. left / right hanging: children stacked on one side of a line under the parent.
// horizontal: children in a column to the right.
type Mode = 'auto' | 'v' | 'both' | 'l' | 'r' | 'h'
const MODE_LABEL: Record<Mode, string> = { auto: 'Compact (recommended)', v: 'Standard', both: 'Both', l: 'Left hanging', r: 'Right hanging', h: 'Horizontal' }
const MODES: Mode[] = ['auto', 'v', 'both', 'l', 'r', 'h']

const CW = 240        // card width (w-60)
const DEFAULT_H = 120 // card height until it has been measured
const SIB = 24        // gap between side-by-side branches
const DROP = 44       // vertical gap parent -> children (standard)
const INDENT = 30     // card edge to the centre line (hanging)
const STACK = 14      // gap between stacked cards
const ROWGAP = 16     // gap between rows in the horizontal layout

type Lay = { cards: { id: string; x: number; y: number }[]; lines: string[]; minX: number; maxX: number; minY: number; maxY: number }

const shiftLay = (l: Lay, dx: number, dy: number): Lay => ({
  cards: l.cards.map(c => ({ ...c, x: c.x + dx, y: c.y + dy })),
  lines: l.lines.map(d => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_m, x, y) => `${+x + dx},${+y + dy}`)),
  minX: l.minX + dx, maxX: l.maxX + dx, minY: l.minY + dy, maxY: l.maxY + dy,
})
const join = (parts: Lay[]): Lay => ({
  cards: parts.flatMap(p => p.cards), lines: parts.flatMap(p => p.lines),
  minX: Math.min(...parts.map(p => p.minX)), maxX: Math.max(...parts.map(p => p.maxX)),
  minY: Math.min(...parts.map(p => p.minY)), maxY: Math.max(...parts.map(p => p.maxY)),
})

type LayCtx = { h: (id: string) => number; mode: (id: string) => Mode; open: (n: Node, depth: number) => boolean }

function layoutNode(n: Node, depth: number, ctx: LayCtx): Lay {
  const H = ctx.h(n.id)
  const self: Lay = { cards: [{ id: n.id, x: 0, y: 0 }], lines: [], minX: 0, maxX: CW, minY: 0, maxY: H }
  if (!ctx.open(n, depth) || n.children.length === 0) return self
  const kids = n.children.map(c => layoutNode(c, depth + 1, ctx))
  let mode = ctx.mode(n.id)
  const compact = mode === 'auto'
  // Compact: a group of end seats hangs on both sides of a line (narrow), anything with seats under
  // it spreads out in the standard way.
  if (mode === 'auto') mode = n.children.length >= 3 && n.children.every(c => !ctx.open(c, depth + 1)) ? 'both' : 'v'
  const cx = CW / 2

  if (mode === 'v') {
    // Compact charts wrap a long row of branches onto several rows (at most 4 per row), hung off one
    // line down the middle, so the chart stays about as wide as a screen.
    const perRow = compact ? 4 : Infinity
    const rows: Lay[][] = []
    for (let i = 0; i < kids.length; i += perRow === Infinity ? kids.length : perRow) rows.push(kids.slice(i, i + (perRow === Infinity ? kids.length : perRow)))
    const multi = rows.length > 1
    const parts: Lay[] = [self]
    const lines: string[] = []
    let rowTop = H + DROP
    let lastBus = H + DROP / 2
    for (const row of rows) {
      const placed: { k: Lay; dx: number }[] = []
      if (!multi) {
        // one row: centre the parent over its first and last child
        let cursor = 0
        for (const k of row) { placed.push({ k, dx: cursor - k.minX }); cursor += k.maxX - k.minX + SIB }
        const c0 = placed[0].dx + cx, cN = placed[placed.length - 1].dx + cx
        const sx = cx - (c0 + cN) / 2
        placed.forEach(p => { p.dx += sx })
      } else {
        // several rows: half the row on each side of the centre line, leaving a gap for the line
        const half = Math.ceil(row.length / 2)
        let right = cx - SIB
        for (const k of row.slice(0, half).reverse()) { placed.unshift({ k, dx: right - k.maxX }); right -= k.maxX - k.minX + SIB }
        let left = cx + SIB
        for (const k of row.slice(half)) { placed.push({ k, dx: left - k.minX }); left += k.maxX - k.minX + SIB }
      }
      const busY = rowTop - DROP / 2
      const cs = placed.map(p => p.dx + cx)
      lines.push(`M${Math.min(cs[0], cx)},${busY} L${Math.max(cs[cs.length - 1], cx)},${busY}`)
      cs.forEach(c => lines.push(`M${c},${busY} L${c},${rowTop}`))
      let bottom = rowTop
      for (const p of placed) {
        parts.push(shiftLay(p.k, p.dx, rowTop - p.k.minY))
        bottom = Math.max(bottom, rowTop + (p.k.maxY - p.k.minY))
      }
      lastBus = busY
      rowTop = bottom + DROP
    }
    lines.unshift(`M${cx},${H} L${cx},${lastBus}`)
    return join([...parts, { cards: [], lines, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }])
  }

  if (mode === 'h') {
    const x0 = CW + 44, spineX = CW + 22
    let cursor = 0
    const placed: Lay[] = [], centers: number[] = []
    kids.forEach(k => {
      const dy = cursor - k.minY
      placed.push(shiftLay(k, x0, dy))
      centers.push(dy + ctx.h(k.cards[0].id) / 2)
      cursor += k.maxY - k.minY + ROWGAP
    })
    const pcy = (centers[0] + centers[centers.length - 1]) / 2
    const sy = H / 2 - pcy // put the parent card at y = 0
    const kidsL = placed.map(k => shiftLay(k, 0, sy))
    const cs = centers.map(c => c + sy)
    const lines = [`M${CW},${H / 2} L${spineX},${H / 2}`]
    if (cs.length > 1) lines.push(`M${spineX},${cs[0]} L${spineX},${cs[cs.length - 1]}`)
    cs.forEach(c => lines.push(`M${spineX},${c} L${x0},${c}`))
    return join([self, ...kidsL, { cards: [], lines, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }])
  }

  // hanging layouts: right = cards to the right of the centre line, left = to the left, both = alternate
  // left and right in rows. A whole branch (with everything under it) stays on its own side of the
  // line, so branches never run into each other or across the line.
  const place = (k: Lay, sd: 'l' | 'r', y: number) => {
    const dx = sd === 'r' ? cx + INDENT - k.minX : cx - INDENT - k.maxX
    const dy = y - k.minY
    placed.push(shiftLay(k, dx, dy))
    const mid = dy + ctx.h(k.cards[0].id) / 2
    lastMid = Math.max(lastMid, mid)
    lines.push(sd === 'r' ? `M${cx},${mid} L${dx},${mid}` : `M${cx},${mid} L${dx + CW},${mid}`)
    return k.maxY - k.minY
  }
  const placed: Lay[] = []
  const lines: string[] = []
  let lastMid = H
  let cursor = H + 18
  if (mode === 'both') {
    for (let i = 0; i < kids.length; i += 2) {
      const hl = place(kids[i], 'l', cursor)
      const hr = kids[i + 1] ? place(kids[i + 1], 'r', cursor) : 0
      cursor += Math.max(hl, hr) + STACK
    }
  } else {
    kids.forEach(k => { cursor += place(k, mode as 'l' | 'r', cursor) + STACK })
  }
  lines.unshift(`M${cx},${H} L${cx},${lastMid}`)
  return join([self, ...placed, { cards: [], lines, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }])
}

// Lays out every top seat side by side and returns positions relative to the chart's top-left corner.
function layoutForest(tree: Node[], ctx: LayCtx) {
  let cursor = 0
  const parts: Lay[] = []
  for (const r of tree) {
    const l = layoutNode(r, 0, ctx)
    parts.push(shiftLay(l, cursor - l.minX, 0))
    cursor += l.maxX - l.minX + 56
  }
  if (parts.length === 0) return { cards: [] as Lay['cards'], lines: [] as string[], w: 0, h: 0 }
  const all = join(parts)
  const pad = 16
  const moved = shiftLay(all, pad - all.minX, pad - all.minY)
  return { cards: moved.cards, lines: moved.lines, w: moved.maxX + pad, h: moved.maxY + pad + 12 }
}

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
  // The layout for every branch (a branch can be given its own from its card). A chart with many seats
  // side by side is far wider than the page, so it starts sideways.
  const [layoutPref, setLayoutPref] = useLocalPref('av-org-layout', '')
  const layout: Mode = (MODES as string[]).includes(layoutPref) ? (layoutPref as Mode) : 'auto'
  const setLayout = (m: Mode) => { setLayoutPref(m); setNodeModesPref('{}') }
  const [nodeModesPref, setNodeModesPref] = useLocalPref('av-org-node-modes', '{}')
  const nodeModes = useMemo<Record<string, Mode>>(() => { try { return JSON.parse(nodeModesPref) ?? {} } catch { return {} } }, [nodeModesPref])
  const setNodeMode = (id: string, m: Mode | '') => {
    const next = { ...nodeModes }
    if (m) next[id] = m; else delete next[id]
    setNodeModesPref(JSON.stringify(next))
  }
  const modeOf = (id: string): Mode => (MODES as string[]).includes(nodeModes[id]) ? nodeModes[id] : layout
  const [heights, setHeights] = useState<Record<string, number>>({})
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

  const isOpen = (n: Node, depth: number) => n.children.length > 0 && !collapsed.has(n.id) && !(maxLevels && depth + 1 >= maxLevels)
  const placement = useMemo(() => {
    const ctx: LayCtx = { h: id => heights[id] ?? DEFAULT_H, mode: modeOf, open: isOpen }
    return layoutForest(tree, ctx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, heights, collapsed, maxLevels, layout, nodeModes])

  // Card heights depend on their text, so measure them once drawn (before paint) and lay out again if
  // any changed. Converges in one extra pass.
  useLayoutEffect(() => {
    const root = treeRef.current
    if (!root) return
    let changed = false
    const next = { ...heights }
    root.querySelectorAll<HTMLElement>('[data-seat]').forEach(el => {
      const sid = el.dataset.seat as string
      const h = el.offsetHeight
      if (h > 0 && Math.abs((next[sid] ?? -1) - h) > 0.5) { next[sid] = h; changed = true }
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (changed) setHeights(next)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  // Bring the top seat into view when the chart opens or its layout changes (a sideways chart centres it).
  useEffect(() => {
    const t = setTimeout(() => {
      const root = tree[0] && treeRef.current?.querySelector<HTMLElement>(`[data-seat="${tree[0].id}"]`)
      if (!root) return
      const sc = scroller.current
      if (sc) sc.scrollTo({ left: Math.max(0, (root.offsetLeft + CW / 2) * (zoom / 100) - sc.clientWidth / 2) })
      if (layout === 'h') root.scrollIntoView({ block: 'center' })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

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
    </style></head><body><div id="pt">Organizational Chart<span>${stamp}</span></div><div id="tree" class="orgtree" style="width:max-content;margin:0 auto">${el.innerHTML}</div></body></html>`)
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
    if (!box || !placement.w) return
    setZoom(Math.max(30, Math.min(100, Math.floor(((box.clientWidth - 48) / placement.w) * 100))))
  }

  const renderSeat = (n: Node, depth: number) => {
    const hit = !!q && matches(n, q)
    const dim = !!q && !hit
    const hiddenByLevel = !!maxLevels && depth + 1 >= maxLevels
    const isCollapsed = collapsed.has(n.id) || hiddenByLevel
    const count = descendantIds(n).length
    const colour = LEVEL_COLOURS[depth % LEVEL_COLOURS.length]
    return (
      <div className={`orgtree-card group relative block text-left w-60 rounded-xl border border-slate-300 bg-white shadow-md ${hit ? 'ring-4 ring-amber-300' : ''} ${dim ? 'opacity-35' : ''}`}>
        <div className="px-3 py-2 rounded-t-xl text-white" style={{ background: colour }}>
          <div className="font-bold leading-tight">{n.title}</div>
          {n.subtitle && <div className="text-xs text-white/80">{n.subtitle}</div>}
          {n.children.length > 0 && (
            <select
              value={nodeModes[n.id] ?? ''}
              onChange={e => setNodeMode(n.id, e.target.value as Mode | '')}
              onClick={e => e.stopPropagation()}
              aria-label={`Layout of the branch under ${n.title}`}
              title="Layout of this branch"
              className="ot-tools absolute top-1.5 right-1.5 hidden group-hover:block group-focus-within:block max-w-[7.5rem] rounded bg-white/20 text-white text-[11px] py-0.5 px-1 border border-white/30 print:hidden"
            >
              <option value="" className="text-slate-900">Layout: same as chart</option>
              {MODES.map(m => <option key={m} value={m} className="text-slate-900">{MODE_LABEL[m]}</option>)}
            </select>
          )}
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

  const nodeById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes])
  const depthById = useMemo(() => {
    const m = new Map<string, number>()
    const walk = (ns: Node[], d: number) => ns.forEach(n => { m.set(n.id, d); walk(n.children, d + 1) })
    walk(tree, 0)
    return m
  }, [tree])

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
        <button onClick={() => setPrinting({ paper: 'A3', landscape: true, fit: 'page' })} className={`${btn} inline-flex items-center gap-1`}><Printer className="w-4 h-4" /> Print…</button>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700">
          Layout
          <select value={layout} onChange={e => setLayout(e.target.value as Mode)} className="border rounded-lg px-2 py-1.5 text-sm bg-white" aria-label="Chart layout">
            {MODES.map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
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
          <div ref={treeRef} style={{ zoom: zoom / 100, width: placement.w, margin: '0 auto' }} className="orgtree">
            <div className="relative" style={{ width: placement.w, height: placement.h }}>
              <svg width={placement.w} height={placement.h} className="absolute inset-0 pointer-events-none" aria-hidden="true">
                {placement.lines.map((d, i) => <path key={i} d={d} fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="square" />)}
              </svg>
              {placement.cards.map(c => {
                const n = nodeById.get(c.id)
                return n ? <div key={c.id} data-seat={c.id} className="absolute" style={{ left: c.x, top: c.y, width: CW }}>{renderSeat(n, depthById.get(c.id) ?? 0)}</div> : null
              })}
            </div>
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
