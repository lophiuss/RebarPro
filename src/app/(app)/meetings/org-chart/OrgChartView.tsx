'use client'

import { useMemo, useState } from 'react'
import { Plus, Minus, Search, Pencil, Trash2, ChevronDown, ChevronRight, Printer, Maximize2, X, UserRound } from 'lucide-react'
import { saveSeat, deleteSeat } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'
import type { Person } from '@/lib/meetings'

type Seat = { id: string; parent_id: string | null; title: string; subtitle: string | null; roles: string[]; position: number }
type SeatPerson = { seat_id: string; user_id: string }
type Node = Seat & { children: Node[]; people: Person[] }

const input = 'w-full border rounded-lg px-3 py-2 text-sm bg-white'

// Classic CSS org-tree. Vertical: children in a row under the parent.
// Horizontal: children in a column to the right of the parent.
const TREE_CSS = `
.orgtree ul{display:flex;justify-content:center;padding-top:22px;position:relative;margin:0}
.orgtree li{list-style:none;text-align:center;position:relative;padding:22px 8px 0}
.orgtree li::before,.orgtree li::after{content:'';position:absolute;top:0;right:50%;border-top:1px solid #cbd5e1;width:50%;height:22px}
.orgtree li::after{right:auto;left:50%;border-left:1px solid #cbd5e1}
.orgtree li:only-child::before,.orgtree li:only-child::after{display:none}
.orgtree li:only-child{padding-top:0}
.orgtree li:first-child::before,.orgtree li:last-child::after{border:0 none}
.orgtree li:last-child::before{border-right:1px solid #cbd5e1;border-radius:0 6px 0 0}
.orgtree li:first-child::after{border-radius:6px 0 0 0}
.orgtree ul ul::before{content:'';position:absolute;top:0;left:50%;border-left:1px solid #cbd5e1;height:22px}
.orgtree > ul > li{padding-top:0}
.orgtree > ul{padding-top:0}
.orgtree > ul > li::before,.orgtree > ul > li::after{display:none}

.orgtree.h ul{flex-direction:column;justify-content:flex-start;align-items:flex-start;padding:0 0 0 30px}
.orgtree.h > ul{padding-left:0}
.orgtree.h li{display:flex;align-items:center;text-align:left;padding:8px 0 8px 30px}
.orgtree.h > ul > li{padding-left:0}
.orgtree.h li::before{content:'';position:absolute;left:0;top:0;right:auto;width:0;height:50%;border:0;border-left:1px solid #cbd5e1;border-radius:0}
.orgtree.h li::after{content:'';position:absolute;left:0;top:50%;right:auto;width:30px;height:0;border:0;border-top:1px solid #cbd5e1;border-radius:0}
.orgtree.h li:first-child::before{border-left:0;height:0}
.orgtree.h li:not(:first-child):not(:last-child)::before{height:100%}
.orgtree.h li:last-child::before{height:50%;border-right:0;border-radius:0}
.orgtree.h li:only-child::before{display:none}
.orgtree.h li:only-child::after{display:block}
.orgtree.h li:only-child{padding:8px 0 8px 30px}
.orgtree.h ul ul::before{display:none}
.orgtree.h > ul > li::before,.orgtree.h > ul > li::after{display:none}
@media print{.orgtree-scroll{overflow:visible !important}}
`

function buildTree(seats: Seat[], seatPeople: SeatPerson[], peopleById: Map<string, Person>): Node[] {
  const byParent = new Map<string | null, Seat[]>()
  for (const s of seats) byParent.set(s.parent_id, [...(byParent.get(s.parent_id) ?? []), s])
  const make = (s: Seat, depth: number): Node => ({
    ...s,
    roles: Array.isArray(s.roles) ? s.roles : [],
    people: seatPeople.filter(sp => sp.seat_id === s.id).map(sp => peopleById.get(sp.user_id)).filter((p): p is Person => !!p),
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

export default function OrgChartView({ seats, seatPeople, people, canEdit }: { seats: Seat[]; seatPeople: SeatPerson[]; people: Person[]; canEdit: boolean }) {
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const tree = useMemo(() => buildTree(seats, seatPeople, peopleById), [seats, seatPeople, peopleById])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState(100)
  const [horizontal, setHorizontal] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id?: string; parent_id: string | null; title: string; subtitle: string; roles: string; people_ids: string[] } | null>(null)
  const [saving, setSaving] = useState(false)

  const q = query.trim().toLowerCase()
  const usersInSeats = new Set(seatPeople.map(sp => sp.user_id)).size
  const levels = depthOf(tree)
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
    setEditing({ id: n.id, parent_id: n.parent_id, title: n.title, subtitle: n.subtitle ?? '', roles: n.roles.join('\n'), people_ids: n.people.map(p => p.id) })
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

  const renderSeat = (n: Node) => {
    const hit = !!q && matches(n, q)
    const dim = !!q && !hit
    const isCollapsed = collapsed.has(n.id)
    const count = descendantIds(n).length
    return (
      <div className={`inline-block align-top text-left w-64 rounded-xl border bg-white shadow-sm ${hit ? 'ring-2 ring-amber-400' : ''} ${dim ? 'opacity-40' : ''}`}>
        <div className="px-3 py-2 border-b bg-slate-50 rounded-t-xl flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-900 leading-tight">{n.title}</div>
            {n.subtitle && <div className="text-xs text-gray-500">{n.subtitle}</div>}
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 print:hidden">
              <button onClick={() => openAdd(n.id)} aria-label="Add seat below" title="Add seat below" className="text-gray-400 hover:text-blue-600"><Plus className="w-3.5 h-3.5" /></button>
              <button onClick={() => openEdit(n)} aria-label="Edit seat" className="text-gray-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
              <button
                onClick={() => confirm(`Delete "${n.title}"${count ? ` and its ${count} sub-seat${count === 1 ? '' : 's'}` : ''}?`) && act(() => deleteSeat(n.id))}
                aria-label="Delete seat" className="text-gray-400 hover:text-red-500"
              ><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        <div className="px-3 py-2">
          {n.people.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-amber-700 font-semibold"><UserRound className="w-4 h-4" /> Open</div>
          ) : (
            <ul className="space-y-1">
              {n.people.map(p => (
                <li key={p.id} className="flex items-center gap-2 text-sm"><Avatar person={p} size="sm" /> <span className="truncate">{p.full_name}</span></li>
              ))}
            </ul>
          )}
          {n.roles.length > 0 && (
            <ul className="mt-2 pt-2 border-t space-y-0.5 text-xs text-gray-600 list-disc list-inside">
              {n.roles.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
        {n.children.length > 0 && (
          <button onClick={() => toggle(n.id)} className="w-full flex items-center justify-center gap-1 py-1 border-t text-xs text-gray-500 hover:bg-gray-50 rounded-b-xl print:hidden">
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {count}
          </button>
        )}
      </div>
    )
  }

  const renderNodes = (nodes: Node[]) => (
    <ul>
      {nodes.map(n => (
        <li key={n.id}>
          {renderSeat(n)}
          {n.children.length > 0 && !collapsed.has(n.id) && renderNodes(n.children)}
        </li>
      ))}
    </ul>
  )

  const parentOptions = editing
    ? allNodes.filter(n => {
        if (!editing.id) return true
        const self = allNodes.find(x => x.id === editing.id)
        return n.id !== editing.id && !(self && descendantIds(self).includes(n.id))
      })
    : []

  return (
    <div>
      <style>{TREE_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <div className="mr-2 text-sm text-gray-600"><b>{usersInSeats}</b> users in seats · <b>{levels}</b> level{levels === 1 ? '' : 's'}</div>
        <button onClick={() => setCollapsed(new Set(allNodes.filter(n => n.children.length).map(n => n.id)))} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50">Collapse all</button>
        <button onClick={() => setCollapsed(new Set())} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50">Expand all</button>
        <div className="inline-flex items-center rounded-lg border bg-white text-sm overflow-hidden">
          <button onClick={() => setZoom(z => Math.max(30, z - 10))} aria-label="Zoom out" className="px-2.5 py-1.5 hover:bg-gray-50"><Minus className="w-4 h-4" /></button>
          <span className="px-2 tabular-nums w-24 text-center">{zoom}% Zoom</span>
          <button onClick={() => setZoom(z => Math.min(200, z + 10))} aria-label="Zoom in" className="px-2.5 py-1.5 hover:bg-gray-50"><Plus className="w-4 h-4" /></button>
        </div>
        <button onClick={() => setZoom(100)} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"><Maximize2 className="w-4 h-4" /> Fit screen</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50"><Printer className="w-4 h-4" /> Print visible</button>
        <button onClick={() => setHorizontal(h => !h)} className="px-3 py-1.5 text-sm rounded-lg border bg-white hover:bg-gray-50">{horizontal ? 'Horizontal' : 'Vertical'}</button>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" className="pl-8 pr-3 py-1.5 border rounded-lg text-sm bg-white w-44" />
        </div>
        {canEdit && <button onClick={() => openAdd(null)} className="ml-auto inline-flex items-center gap-1 px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700"><Plus className="w-4 h-4" /> Add seat</button>}
      </div>

      {tree.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
          No seats yet. {canEdit ? 'Add the first seat (for example Visionary or Integrator) to start your accountability chart.' : 'A manager can set up the chart.'}
        </div>
      ) : (
        <div className="orgtree-scroll overflow-auto border rounded-xl bg-white p-6">
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', width: 'max-content' }} className={`orgtree ${horizontal ? 'h' : ''}`}>
            {renderNodes(tree)}
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
                <input required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className={`${input} mt-1 font-normal`} placeholder="e.g. Integrator" />
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
                <div className="border rounded-lg max-h-40 overflow-y-auto divide-y">
                  {people.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={editing.people_ids.includes(p.id)}
                        onChange={() => setEditing({ ...editing, people_ids: editing.people_ids.includes(p.id) ? editing.people_ids.filter(x => x !== p.id) : [...editing.people_ids, p.id] })}
                      />
                      {p.full_name || p.id.slice(0, 8)}
                    </label>
                  ))}
                </div>
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
