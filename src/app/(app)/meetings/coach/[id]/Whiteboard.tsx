'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, MousePointer2, Hand, Pencil, Highlighter, Minus, MoveUpRight, Square, Circle, StickyNote, Type, Eraser,
  Undo2, Redo2, Trash2, ZoomIn, ZoomOut, Download, Users, Check, Loader2, AlertCircle, ImagePlus, Crop, BringToFront, SendToBack, ArrowUp, ArrowDown, Presentation, X as XIcon, Eraser as EraserIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { saveWhiteboard, renameWhiteboard } from '../actions'
import ImageEditor from './ImageEditor'

const BUCKET = 'meeting-docs'

// ------------------------------------------------------------------ model

type Stroke = { t: 'stroke'; id: string; color: string; w: number; a: number; pts: number[] }
type Shape = { t: 'shape'; id: string; kind: 'line' | 'arrow' | 'rect' | 'ellipse'; color: string; w: number; x1: number; y1: number; x2: number; y2: number }
type Sticky = { t: 'sticky'; id: string; x: number; y: number; w: number; h: number; color: string; text: string; size?: number; font?: string }
type TextItem = { t: 'text'; id: string; x: number; y: number; color: string; size: number; text: string; font?: string; bold?: boolean; italic?: boolean }
// A picture stored in the private `meeting-docs` bucket under wb/<board id>/.
type Img = { t: 'image'; id: string; x: number; y: number; w: number; h: number; rot: number; path: string }
type Item = Stroke | Shape | Sticky | TextItem | Img

type Tool = 'select' | 'hand' | 'pen' | 'highlighter' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'sticky' | 'text' | 'eraser'
type Op = { k: 'set'; item: Item } | { k: 'del'; id: string }

const W = 3200
const H = 2000
const COLORS = ['#111827', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#db2777']
const WIDTHS = [2, 4, 8]

// Ten fonts that ship with every computer, so text looks the same for everyone.
const FONTS: { key: string; label: string; css: string }[] = [
  { key: 'Arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { key: 'Verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { key: 'Tahoma', label: 'Tahoma', css: 'Tahoma, Geneva, sans-serif' },
  { key: 'Trebuchet', label: 'Trebuchet', css: '"Trebuchet MS", Helvetica, sans-serif' },
  { key: 'Georgia', label: 'Georgia', css: 'Georgia, serif' },
  { key: 'Times', label: 'Times New Roman', css: '"Times New Roman", Times, serif' },
  { key: 'Courier', label: 'Courier New', css: '"Courier New", Courier, monospace' },
  { key: 'Comic', label: 'Comic Sans', css: '"Comic Sans MS", "Comic Neue", cursive' },
  { key: 'Impact', label: 'Impact', css: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { key: 'Script', label: 'Handwriting', css: '"Brush Script MT", "Segoe Script", cursive' },
]
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 96]
const fontCss = (key?: string) => FONTS.find(f => f.key === key)?.css ?? FONTS[0].css

const TOOLS: { key: Tool; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'select', label: 'Select and move', icon: MousePointer2 },
  { key: 'hand', label: 'Pan', icon: Hand },
  { key: 'pen', label: 'Pen', icon: Pencil },
  { key: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { key: 'line', label: 'Line', icon: Minus },
  { key: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { key: 'rect', label: 'Rectangle', icon: Square },
  { key: 'ellipse', label: 'Ellipse', icon: Circle },
  { key: 'sticky', label: 'Sticky note', icon: StickyNote },
  { key: 'text', label: 'Text', icon: Type },
  { key: 'eraser', label: 'Eraser', icon: Eraser },
]

const uid = () => crypto.randomUUID()

function moved(i: Item, dx: number, dy: number): Item {
  if (i.t === 'stroke') return { ...i, pts: i.pts.map((v, idx) => v + (idx % 2 === 0 ? dx : dy)) }
  if (i.t === 'shape') return { ...i, x1: i.x1 + dx, y1: i.y1 + dy, x2: i.x2 + dx, y2: i.y2 + dy }
  return { ...i, x: i.x + dx, y: i.y + dy }
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hit(i: Item, x: number, y: number): boolean {
  if (i.t === 'stroke') {
    const tol = i.w / 2 + 8
    if (i.pts.length < 4) return Math.hypot(x - i.pts[0], y - i.pts[1]) < tol
    for (let k = 0; k + 3 < i.pts.length; k += 2) if (distToSeg(x, y, i.pts[k], i.pts[k + 1], i.pts[k + 2], i.pts[k + 3]) < tol) return true
    return false
  }
  if (i.t === 'shape') {
    const tol = i.w / 2 + 8
    if (i.kind === 'line' || i.kind === 'arrow') return distToSeg(x, y, i.x1, i.y1, i.x2, i.y2) < tol
    const x0 = Math.min(i.x1, i.x2), x3 = Math.max(i.x1, i.x2), y0 = Math.min(i.y1, i.y2), y3 = Math.max(i.y1, i.y2)
    if (i.kind === 'rect') {
      const inside = x >= x0 - tol && x <= x3 + tol && y >= y0 - tol && y <= y3 + tol
      const inner = x > x0 + tol && x < x3 - tol && y > y0 + tol && y < y3 - tol
      return inside && !inner
    }
    const cx = (x0 + x3) / 2, cy = (y0 + y3) / 2, rx = Math.max((x3 - x0) / 2, 1), ry = Math.max((y3 - y0) / 2, 1)
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry)
    return Math.abs(d - 1) * Math.min(rx, ry) < tol
  }
  if (i.t === 'sticky' || i.t === 'image') return x >= i.x && x <= i.x + i.w && y >= i.y && y <= i.y + i.h
  const lines = i.text.split('\n')
  const w = Math.max(40, ...lines.map(l => l.length * i.size * 0.6))
  return x >= i.x && x <= i.x + w && y >= i.y && y <= i.y + lines.length * i.size * 1.35
}

function apply(items: Item[], op: Op): Item[] {
  if (op.k === 'del') return items.filter(i => i.id !== op.id)
  const at = items.findIndex(i => i.id === op.item.id)
  if (at === -1) return [...items, op.item]
  const next = items.slice()
  next[at] = op.item
  return next
}

// Only known drawing fields are kept from stored or received data.
function clean(raw: unknown): Item | null {
  const r = raw as any
  if (!r || typeof r !== 'object' || typeof r.id !== 'string') return null
  const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const color = typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#111827'
  if (r.t === 'stroke' && Array.isArray(r.pts)) return { t: 'stroke', id: r.id, color, w: n(r.w, 4), a: n(r.a, 1), pts: r.pts.map((v: unknown) => n(v)).slice(0, 20000) }
  if (r.t === 'shape' && ['line', 'arrow', 'rect', 'ellipse'].includes(r.kind)) return { t: 'shape', id: r.id, kind: r.kind, color, w: n(r.w, 4), x1: n(r.x1), y1: n(r.y1), x2: n(r.x2), y2: n(r.y2) }
  if (r.t === 'sticky') return { t: 'sticky', id: r.id, x: n(r.x), y: n(r.y), w: Math.max(100, n(r.w, 200)), h: Math.max(80, n(r.h, 160)), color, text: String(r.text ?? '').slice(0, 2000), size: r.size === undefined ? undefined : Math.min(72, Math.max(10, n(r.size, 16))), font: FONTS.some(f => f.key === r.font) ? r.font : undefined }
  if (r.t === 'image' && typeof r.path === 'string' && /^wb\/[0-9a-f-]{36}\/[\w.\-]+$/i.test(r.path)) {
    return { t: 'image', id: r.id, x: n(r.x), y: n(r.y), w: Math.max(30, n(r.w, 300)), h: Math.max(30, n(r.h, 200)), rot: n(r.rot), path: r.path }
  }
  if (r.t === 'text') return { t: 'text', id: r.id, x: n(r.x), y: n(r.y), color, size: Math.min(120, Math.max(10, n(r.size, 22))), text: String(r.text ?? '').slice(0, 2000), font: FONTS.some(f => f.key === r.font) ? r.font : undefined, bold: !!r.bold, italic: !!r.italic }
  return null
}

function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number) {
  const a = Math.atan2(y2 - y1, x2 - x1)
  const s = Math.max(12, size * 3.2)
  const p = (ang: number) => `${x2 - s * Math.cos(a + ang)},${y2 - s * Math.sin(a + ang)}`
  return `${p(-0.45)} ${x2},${y2} ${p(0.45)}`
}

// ---------------------------------------------------------------- component

export default function Whiteboard({ id, initialTitle, initialItems, meetingId, myName, embedded }: {
  id: string; initialTitle: string; initialItems: unknown[]; meetingId: string | null; myName: string
  // Shown inside a meeting's Whiteboard tab (no back link, shorter)
  embedded?: boolean
}) {
  const [items, setItemsState] = useState<Item[]>(() => initialItems.map(clean).filter((i): i is Item => !!i))
  const [title, setTitle] = useState(initialTitle)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(4)
  const [textSize, setTextSize] = useState(22)
  const [textFont, setTextFont] = useState('Arial')
  const [zoom, setZoom] = useState(0.6)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Item | null>(null)
  const [past, setPast] = useState<Item[][]>([])
  const [future, setFuture] = useState<Item[][]>([])
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [here, setHere] = useState<string[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [editingImgId, setEditingImgId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const requested = useRef<Set<string>>(new Set())

  const itemsRef = useRef(items)
  const draftRef = useRef<Item | null>(null)
  const world = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gesture = useRef<null | {
    kind: 'draw' | 'drag' | 'resize' | 'pan' | 'erase' | 'iresize' | 'irotate'
    snap: Item[]; sx: number; sy: number; id?: string; orig?: Item; scrollL?: number; scrollT?: number
  }>(null)
  const channel = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const clientId = useRef('')

  const setItems = useCallback((next: Item[]) => { itemsRef.current = next; setItemsState(next) }, [])

  // ----- saving
  const flushSave = useCallback(async () => {
    saveTimer.current = null
    setSaveState('saving')
    try {
      await saveWhiteboard(id, { items: itemsRef.current })
      setSaveState(s => (saveTimer.current ? s : 'saved'))
    } catch {
      setSaveState('error')
    }
  }, [id])
  const markDirty = useCallback(() => {
    setSaveState('dirty')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 1200)
  }, [flushSave])

  // ----- live sharing
  const emit = useCallback((op: Op) => {
    channel.current?.send({ type: 'broadcast', event: 'op', payload: { from: clientId.current, op } })
  }, [])
  const emitDiff = useCallback((before: Item[], after: Item[]) => {
    const prev = new Map(before.map(i => [i.id, i]))
    const now = new Set(after.map(i => i.id))
    for (const i of after) { const p = prev.get(i.id); if (!p || p !== i && JSON.stringify(p) !== JSON.stringify(i)) emit({ k: 'set', item: i }) }
    for (const i of before) if (!now.has(i.id)) emit({ k: 'del', id: i.id })
  }, [emit])

  useEffect(() => {
    clientId.current = uid()
    const supabase = createClient()
    const ch = supabase.channel(`wb:${id}`, { config: { broadcast: { self: false }, presence: { key: clientId.current } } })
    ch.on('broadcast', { event: 'op' }, ({ payload }) => {
      const op = payload?.op as Op | undefined
      if (!op || payload.from === clientId.current) return
      if (op.k === 'del' && typeof op.id === 'string') setItems(apply(itemsRef.current, op))
      else if (op.k === 'set') { const item = clean(op.item); if (item) setItems(apply(itemsRef.current, { k: 'set', item })) }
    })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, { name?: string }[]>
      setHere(Object.values(state).map(v => v[0]?.name ?? 'Someone'))
    })
    ch.subscribe(status => { if (status === 'SUBSCRIBED') ch.track({ name: myName }) })
    channel.current = ch
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveWhiteboard(id, { items: itemsRef.current }).catch(() => {}) }
      supabase.removeChannel(ch)
      channel.current = null
    }
  }, [id, myName, setItems])

  // ----- pictures: downloaded through the signed-in session (the bucket is private)
  useEffect(() => {
    const supabase = createClient()
    for (const i of items) {
      if (i.t !== 'image' || requested.current.has(i.path)) continue
      requested.current.add(i.path)
      supabase.storage.from(BUCKET).download(i.path).then(({ data }) => {
        if (data) setImageUrls(prev => ({ ...prev, [i.path]: URL.createObjectURL(data) }))
      })
    }
  }, [items])

  // New text / sticky notes: focus the box once it exists on screen.
  useEffect(() => {
    if (!focusId) return
    const t = requestAnimationFrame(() => {
      const el = world.current?.querySelector<HTMLTextAreaElement>(`[data-item="${focusId}"] textarea`)
      el?.focus()
      setFocusId(null)
    })
    return () => cancelAnimationFrame(t)
  }, [focusId, items])

  // Shrinks big photos before upload (max 1600 px) and returns the file to store.
  async function prepare(file: File): Promise<{ blob: Blob; w: number; h: number; ext: string }> {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    const png = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'
    const blob: Blob | null = await new Promise(res => c.toBlob(res, png ? 'image/png' : 'image/jpeg', 0.88))
    if (!blob) throw new Error('Could not read that picture')
    return { blob, w, h, ext: png ? 'png' : 'jpg' }
  }

  async function upload(blob: Blob, ext: string) {
    const path = `wb/${id}/${uid()}.${ext}`
    const { error } = await createClient().storage.from(BUCKET).upload(path, blob, { contentType: blob.type })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    return path
  }

  async function addImage(file: File) {
    if (!file.type.startsWith('image/')) { alert('Please choose a picture file.'); return }
    if (file.size > 15 * 1024 * 1024) { alert('That picture is larger than 15 MB.'); return }
    setUploading(true)
    try {
      const { blob, w, h, ext } = await prepare(file)
      const path = await upload(blob, ext)
      setImageUrls(prev => ({ ...prev, [path]: URL.createObjectURL(blob) }))
      requested.current.add(path)
      const fit = Math.min(1, 520 / w)
      const sc = scroller.current
      const cx = sc ? (sc.scrollLeft + sc.clientWidth / 2) / zoom : 400
      const cy = sc ? (sc.scrollTop + sc.clientHeight / 2) / zoom : 300
      const item: Img = { t: 'image', id: uid(), x: Math.max(0, cx - (w * fit) / 2), y: Math.max(0, cy - (h * fit) / 2), w: w * fit, h: h * fit, rot: 0, path }
      commit([...itemsRef.current, item])
      setSelectedId(item.id)
      setTool('select')
    } catch (err: any) {
      alert(err?.message ?? 'Could not add the picture')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  // The edited picture replaces the old one (the original file is left in storage).
  async function applyEditedImage(blob: Blob) {
    const cur = itemsRef.current.find(i => i.id === editingImgId)
    if (!cur || cur.t !== 'image') return
    const bmp = await createImageBitmap(blob)
    const path = await upload(blob, 'png')
    setImageUrls(prev => ({ ...prev, [path]: URL.createObjectURL(blob) }))
    requested.current.add(path)
    // Keep the width, adjust the height to the new shape (a crop changes it).
    commit(itemsRef.current.map(i => (i.id === cur.id && i.t === 'image' ? { ...i, path, h: (i.w * bmp.height) / bmp.width } : i)))
    setEditingImgId(null)
  }

  // ----- history
  function commit(next: Item[]) {
    const before = itemsRef.current
    setPast(p => [...p.slice(-60), before])
    setFuture([])
    setItems(next)
    emitDiff(before, next)
    markDirty()
  }
  function finishGesture(snap: Item[]) {
    const now = itemsRef.current
    if (now === snap) return
    setPast(p => [...p.slice(-60), snap])
    setFuture([])
    emitDiff(snap, now)
    markDirty()
  }
  function undo() {
    const prev = past[past.length - 1]
    if (!prev) return
    setPast(past.slice(0, -1))
    setFuture(f => [...f, itemsRef.current])
    emitDiff(itemsRef.current, prev)
    setItems(prev)
    markDirty()
  }
  function redo() {
    const next = future[future.length - 1]
    if (!next) return
    setFuture(future.slice(0, -1))
    setPast(p => [...p, itemsRef.current])
    emitDiff(itemsRef.current, next)
    setItems(next)
    markDirty()
  }

  const selected = items.find(i => i.id === selectedId) ?? null
  const [editMode, setEditMode] = useState<'crop' | 'bg'>('crop')
  const [presenting, setPresenting] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Zooms and scrolls so everything on the board fits the screen.
  function fitToContent() {
    const sc = scroller.current
    if (!sc) return
    const list = itemsRef.current
    let minX = 0, minY = 0, maxX = 1200, maxY = 800
    if (list.length) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
      const grow = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      for (const i of list) {
        if (i.t === 'stroke') for (let k = 0; k < i.pts.length; k += 2) grow(i.pts[k], i.pts[k + 1])
        else if (i.t === 'shape') { grow(i.x1, i.y1); grow(i.x2, i.y2) }
        else if (i.t === 'sticky' || i.t === 'image') { grow(i.x, i.y); grow(i.x + i.w, i.y + i.h) }
        else { grow(i.x, i.y); grow(i.x + Math.max(...i.text.split('\n').map(l => l.length)) * i.size * 0.6, i.y + i.text.split('\n').length * i.size * 1.4) }
      }
    }
    minX = Math.max(0, minX - 40); minY = Math.max(0, minY - 40); maxX += 40; maxY += 40
    const z = Math.min(2, Math.max(0.25, Math.min((sc.clientWidth - 32) / (maxX - minX), (sc.clientHeight - 32) / (maxY - minY))))
    setZoom(+z.toFixed(2))
    requestAnimationFrame(() => { sc.scrollLeft = minX * z; sc.scrollTop = minY * z })
  }

  const zoomBefore = useRef(0.6)
  function startPresenting() {
    zoomBefore.current = zoom
    setSelectedId(null)
    setTool('hand')
    setPresenting(true)
    rootRef.current?.requestFullscreen?.().catch(() => {})
    setTimeout(fitToContent, 150)
  }
  const stopPresenting = useCallback(() => {
    setPresenting(false)
    setZoom(zoomBefore.current)
    setTool('select')
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])
  useEffect(() => {
    if (!presenting) return
    const onFs = () => { if (!document.fullscreenElement) stopPresenting() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopPresenting() }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onFs); window.removeEventListener('keydown', onKey) }
  }, [presenting, stopPresenting])

  // Stacking order (like any drawing tool): later in the list is in front.
  function reorder(where: 'front' | 'forward' | 'backward' | 'back') {
    if (!selectedId) return
    const cur = itemsRef.current
    const idx = cur.findIndex(i => i.id === selectedId)
    if (idx < 0) return
    const next = cur.slice()
    const [it] = next.splice(idx, 1)
    const to = where === 'front' ? next.length : where === 'back' ? 0 : where === 'forward' ? Math.min(next.length, idx + 1) : Math.max(0, idx - 1)
    if (to === idx) return
    next.splice(to, 0, it)
    commit(next)
  }

  function deleteSelected() {
    if (!selectedId) return
    commit(itemsRef.current.filter(i => i.id !== selectedId))
    setSelectedId(null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteSelected() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ----- pointer helpers
  function pos(e: { clientX: number; clientY: number }) {
    const r = world.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(W, (e.clientX - r.left) / zoom)), y: Math.max(0, Math.min(H, (e.clientY - r.top) / zoom)) }
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const p = pos(e)
    const snap = itemsRef.current

    if (tool === 'hand') {
      gesture.current = { kind: 'pan', snap, sx: e.clientX, sy: e.clientY, scrollL: scroller.current?.scrollLeft, scrollT: scroller.current?.scrollTop }
      world.current?.setPointerCapture(e.pointerId)
      return
    }
    if (tool === 'select') { setSelectedId(null); return }

    if (tool === 'sticky' || tool === 'text') {
      // Without this the browser moves focus to the page after this click and the
      // brand-new, still empty box would be removed again as soon as it loses focus.
      e.preventDefault()
      const item: Item = tool === 'sticky'
        ? { t: 'sticky', id: uid(), x: p.x - 100, y: p.y - 70, w: 200, h: 150, color: color === COLORS[0] ? COLORS[3] : color, text: '', size: Math.min(textSize, 40), font: textFont }
        : { t: 'text', id: uid(), x: p.x, y: p.y, color, size: textSize, font: textFont, text: '' }
      commit([...snap, item])
      setSelectedId(item.id)
      setFocusId(item.id)
      setTool('select')
      return
    }

    world.current?.setPointerCapture(e.pointerId)
    if (tool === 'eraser') {
      gesture.current = { kind: 'erase', snap, sx: p.x, sy: p.y }
      eraseAt(p.x, p.y)
      return
    }
    const start: Item = tool === 'pen' || tool === 'highlighter'
      ? { t: 'stroke', id: uid(), color, w: tool === 'highlighter' ? width * 4 : width, a: tool === 'highlighter' ? 0.35 : 1, pts: [p.x, p.y] }
      : { t: 'shape', id: uid(), kind: tool as Shape['kind'], color, w: width, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    draftRef.current = start
    setDraft(start)
    gesture.current = { kind: 'draw', snap, sx: p.x, sy: p.y }
  }

  function eraseAt(x: number, y: number) {
    const cur = itemsRef.current
    for (let k = cur.length - 1; k >= 0; k--) {
      if (hit(cur[k], x, y)) { setItems(cur.filter((_, idx) => idx !== k)); return }
    }
  }

  function onMove(e: React.PointerEvent) {
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pan') {
      if (scroller.current) { scroller.current.scrollLeft = (g.scrollL ?? 0) - (e.clientX - g.sx); scroller.current.scrollTop = (g.scrollT ?? 0) - (e.clientY - g.sy) }
      return
    }
    const p = pos(e)
    if (g.kind === 'erase') { eraseAt(p.x, p.y); return }
    if (g.kind === 'draw' && draftRef.current) {
      const d = draftRef.current
      let next: Item = d
      if (d.t === 'stroke') {
        const n = d.pts.length
        if (Math.hypot(p.x - d.pts[n - 2], p.y - d.pts[n - 1]) < 2) return
        next = { ...d, pts: [...d.pts, p.x, p.y] }
      } else if (d.t === 'shape') next = { ...d, x2: p.x, y2: p.y }
      draftRef.current = next
      setDraft(next)
      return
    }
    if (g.kind === 'drag' && g.orig && g.id) {
      const dx = p.x - g.sx, dy = p.y - g.sy
      setItems(g.snap.map(i => (i.id === g.id ? moved(g.orig!, dx, dy) : i)))
      return
    }
    if (g.kind === 'iresize' && g.orig?.t === 'image' && g.id) {
      const o = g.orig
      // Measure the drag along the picture's own (rotated) axes; keep its proportions.
      const a = (-o.rot * Math.PI) / 180
      const dx = p.x - g.sx, dy = p.y - g.sy
      const local = dx * Math.cos(a) - dy * Math.sin(a)
      const w = Math.max(40, o.w + local)
      setItems(g.snap.map(i => (i.id === g.id && i.t === 'image' ? { ...o, w, h: (w * o.h) / o.w } : i)))
      return
    }
    if (g.kind === 'irotate' && g.orig?.t === 'image' && g.id) {
      const o = g.orig
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2
      let deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90
      if (e.shiftKey) deg = Math.round(deg / 15) * 15
      setItems(g.snap.map(i => (i.id === g.id && i.t === 'image' ? { ...o, rot: Math.round(deg * 10) / 10 } : i)))
      return
    }
    if (g.kind === 'resize' && g.orig?.t === 'sticky' && g.id) {
      const o = g.orig
      setItems(g.snap.map(i => (i.id === g.id ? { ...o, w: Math.max(100, o.w + (p.x - g.sx)), h: Math.max(80, o.h + (p.y - g.sy)) } : i)))
    }
  }

  function onUp() {
    const g = gesture.current
    gesture.current = null
    if (!g) return
    if (g.kind === 'draw' && draftRef.current) {
      const d = draftRef.current
      draftRef.current = null
      setDraft(null)
      const tiny = d.t === 'shape' && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 4
      if (d.t === 'stroke' && d.pts.length === 2) d.pts = [...d.pts, d.pts[0] + 0.1, d.pts[1]]
      if (!tiny) { setItems([...g.snap, d]); finishGesture(g.snap) }
      return
    }
    if (g.kind === 'pan') return
    finishGesture(g.snap)
  }

  function startDrag(e: React.PointerEvent, item: Item) {
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    setSelectedId(item.id)
    const p = pos(e)
    gesture.current = { kind: 'drag', snap: itemsRef.current, sx: p.x, sy: p.y, id: item.id, orig: item }
    world.current?.setPointerCapture(e.pointerId)
  }
  function startResize(e: React.PointerEvent, item: Sticky) {
    e.stopPropagation()
    const p = pos(e)
    gesture.current = { kind: 'resize', snap: itemsRef.current, sx: p.x, sy: p.y, id: item.id, orig: item }
    world.current?.setPointerCapture(e.pointerId)
  }

  function startImageGesture(e: React.PointerEvent, item: Img, kind: 'iresize' | 'irotate') {
    e.stopPropagation()
    e.preventDefault()
    const p = pos(e)
    gesture.current = { kind, snap: itemsRef.current, sx: p.x, sy: p.y, id: item.id, orig: item }
    world.current?.setPointerCapture(e.pointerId)
  }

  function editText(item: Sticky | TextItem, text: string) {
    setItems(itemsRef.current.map(i => (i.id === item.id ? { ...i, text } : i)))
  }
  function commitText(item: Sticky | TextItem) {
    const cur = itemsRef.current.find(i => i.id === item.id)
    if (!cur) return
    // An empty note/text that was never filled in is removed again.
    if ((cur.t === 'sticky' || cur.t === 'text') && !cur.text.trim() && item.text === '') {
      commit(itemsRef.current.filter(i => i.id !== item.id))
      return
    }
    // Typing is not an undo step; the finished text is shared and saved.
    emit({ k: 'set', item: cur })
    markDirty()
  }

  function recolor(c: string) {
    setColor(c)
    if (selected && selected.t !== 'image') commit(itemsRef.current.map(i => (i.id === selected.id ? { ...i, color: c } : i)))
  }

  // Pen / line thickness by number. Also changes the selected drawing, if any.
  function applyWidth(raw: number) {
    const n = Math.max(1, Math.min(80, Math.round(raw) || 1))
    setWidth(n)
    if (selected && (selected.t === 'stroke' || selected.t === 'shape')) {
      const w = selected.t === 'stroke' && selected.a < 1 ? n * 4 : n
      commit(itemsRef.current.map(i => (i.id === selected.id ? { ...i, w } : i)))
    }
  }
  // Font, size, bold, italic for the selected text or sticky note (and the next one you add).
  function applyTextStyle(patch: { size?: number; font?: string; bold?: boolean; italic?: boolean }) {
    if (patch.size !== undefined) { patch.size = Math.max(10, Math.min(120, Math.round(patch.size) || 22)); setTextSize(patch.size) }
    if (patch.font) setTextFont(patch.font)
    if (selected && (selected.t === 'text' || selected.t === 'sticky')) {
      const p = selected.t === 'sticky' ? { size: patch.size && Math.min(patch.size, 72), font: patch.font } : patch
      const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))
      commit(itemsRef.current.map(i => (i.id === selected.id ? { ...i, ...clean } : i)))
    }
  }

  function clearAll() {
    if (!itemsRef.current.length || !confirm('Clear the whole whiteboard for everyone? You can still undo.')) return
    commit([])
    setSelectedId(null)
  }

  // ----- export
  async function exportPng() {
    const list = itemsRef.current
    let minX = 0, minY = 0, maxX = 1200, maxY = 800
    if (list.length) {
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
      const grow = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
      for (const i of list) {
        if (i.t === 'stroke') for (let k = 0; k < i.pts.length; k += 2) grow(i.pts[k], i.pts[k + 1])
        else if (i.t === 'shape') { grow(i.x1, i.y1); grow(i.x2, i.y2) }
        else if (i.t === 'sticky' || i.t === 'image') { grow(i.x, i.y); grow(i.x + i.w, i.y + i.h) }
        else { grow(i.x, i.y); grow(i.x + Math.max(...i.text.split('\n').map(l => l.length)) * i.size * 0.6, i.y + i.text.split('\n').length * i.size * 1.4) }
      }
      minX -= 40; minY -= 40; maxX += 40; maxY += 40
    }
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((maxX - minX) * scale))
    canvas.height = Math.max(1, Math.round((maxY - minY) * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.translate(-minX, -minY)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const i of list) {
      ctx.globalAlpha = 1
      if (i.t === 'stroke') {
        ctx.globalAlpha = i.a; ctx.strokeStyle = i.color; ctx.lineWidth = i.w
        ctx.beginPath(); ctx.moveTo(i.pts[0], i.pts[1])
        for (let k = 2; k < i.pts.length; k += 2) ctx.lineTo(i.pts[k], i.pts[k + 1])
        ctx.stroke()
      } else if (i.t === 'shape') {
        ctx.strokeStyle = i.color; ctx.lineWidth = i.w
        ctx.beginPath()
        if (i.kind === 'rect') ctx.rect(Math.min(i.x1, i.x2), Math.min(i.y1, i.y2), Math.abs(i.x2 - i.x1), Math.abs(i.y2 - i.y1))
        else if (i.kind === 'ellipse') ctx.ellipse((i.x1 + i.x2) / 2, (i.y1 + i.y2) / 2, Math.abs(i.x2 - i.x1) / 2, Math.abs(i.y2 - i.y1) / 2, 0, 0, Math.PI * 2)
        else { ctx.moveTo(i.x1, i.y1); ctx.lineTo(i.x2, i.y2) }
        ctx.stroke()
        if (i.kind === 'arrow') {
          const a = Math.atan2(i.y2 - i.y1, i.x2 - i.x1), s = Math.max(12, i.w * 3.2)
          ctx.beginPath()
          ctx.moveTo(i.x2 - s * Math.cos(a - 0.45), i.y2 - s * Math.sin(a - 0.45)); ctx.lineTo(i.x2, i.y2); ctx.lineTo(i.x2 - s * Math.cos(a + 0.45), i.y2 - s * Math.sin(a + 0.45))
          ctx.stroke()
        }
      } else if (i.t === 'sticky') {
        ctx.fillStyle = i.color + '33'; ctx.strokeStyle = i.color; ctx.lineWidth = 2
        ctx.fillRect(i.x, i.y, i.w, i.h); ctx.strokeRect(i.x, i.y, i.w, i.h)
        const fs = i.size ?? 16
        ctx.fillStyle = '#111827'; ctx.font = `${fs}px ${fontCss(i.font)}`; ctx.textBaseline = 'top'
        let yy = i.y + 10
        for (const para of i.text.split('\n')) {
          let line = ''
          for (const word of para.split(' ')) {
            const test = line ? `${line} ${word}` : word
            if (ctx.measureText(test).width > i.w - 20 && line) { ctx.fillText(line, i.x + 10, yy); yy += fs * 1.3; line = word } else line = test
          }
          ctx.fillText(line, i.x + 10, yy); yy += fs * 1.3
        }
      } else if (i.t === 'image') {
        const src = imageUrls[i.path]
        if (!src) continue
        const img = await new Promise<HTMLImageElement | null>(res => { const el = new Image(); el.onload = () => res(el); el.onerror = () => res(null); el.src = src })
        if (!img) continue
        ctx.save()
        ctx.translate(i.x + i.w / 2, i.y + i.h / 2)
        ctx.rotate((i.rot * Math.PI) / 180)
        ctx.drawImage(img, -i.w / 2, -i.h / 2, i.w, i.h)
        ctx.restore()
      } else {
        ctx.fillStyle = i.color; ctx.font = `${i.italic ? 'italic ' : ''}${i.bold ? 'bold ' : ''}${i.size}px ${fontCss(i.font)}`; ctx.textBaseline = 'top'
        i.text.split('\n').forEach((l, k) => ctx.fillText(l, i.x, i.y + k * i.size * 1.35))
      }
    }
    canvas.toBlob(blob => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${title.replace(/[^\w\- ]+/g, '').trim() || 'whiteboard'}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    })
  }

  const drawable = useMemo(() => (draft ? [...items, draft] : items), [items, draft])
  // Everything is painted in list order, so the order of the list is the stacking order: runs of
  // strokes/shapes share one SVG layer, and every note, text box or picture is its own layer.
  const segments = useMemo(() => {
    const out: ({ key: string; svg: Item[] } | { key: string; item: Item })[] = []
    for (const i of drawable) {
      if (i.t === 'stroke' || i.t === 'shape') {
        const last = out[out.length - 1]
        if (last && 'svg' in last) last.svg.push(i)
        else out.push({ key: `svg-${i.id}`, svg: [i] })
      } else out.push({ key: i.id, item: i })
    }
    return out
  }, [drawable])
  const interactive = tool === 'select'
  const cursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair'
  const btn = 'p-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-40'

  // One drawn thing (stroke or shape) as SVG
  const drawNode = (i: Item) => {
                const sel = i.id === selectedId
                const common = { onPointerDown: (e: React.PointerEvent) => startDrag(e, i), style: { pointerEvents: interactive ? 'stroke' as const : 'none' as const, cursor: interactive ? 'move' : undefined } }
                if (i.t === 'stroke') {
                  const d = `M${i.pts[0]},${i.pts[1]}` + Array.from({ length: (i.pts.length - 2) / 2 }, (_, k) => `L${i.pts[2 + k * 2]},${i.pts[3 + k * 2]}`).join('')
                  return <path key={i.id} d={d} fill="none" stroke={i.color} strokeOpacity={i.a} strokeWidth={i.w} strokeLinecap="round" strokeLinejoin="round" {...common} className={sel ? 'drop-shadow-[0_0_3px_rgba(37,99,235,.9)]' : ''} />
                }
                if (i.t === 'shape') {
                  const props = { stroke: i.color, strokeWidth: i.w, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
                  const glow = sel ? 'drop-shadow-[0_0_3px_rgba(37,99,235,.9)]' : ''
                  if (i.kind === 'rect') return <rect key={i.id} x={Math.min(i.x1, i.x2)} y={Math.min(i.y1, i.y2)} width={Math.abs(i.x2 - i.x1)} height={Math.abs(i.y2 - i.y1)} rx={4} {...props} {...common} className={glow} />
                  if (i.kind === 'ellipse') return <ellipse key={i.id} cx={(i.x1 + i.x2) / 2} cy={(i.y1 + i.y2) / 2} rx={Math.abs(i.x2 - i.x1) / 2} ry={Math.abs(i.y2 - i.y1) / 2} {...props} {...common} className={glow} />
                  return (
                    <g key={i.id} className={glow}>
                      <line x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2} {...props} {...common} />
                      {i.kind === 'arrow' && <polyline points={arrowHead(i.x1, i.y1, i.x2, i.y2, i.w)} {...props} {...common} />}
                    </g>
                  )
                }
                return null
  }

  return (
    <div ref={rootRef} className={presenting ? 'fixed inset-0 z-[80] flex flex-col bg-slate-900' : `flex flex-col min-h-[34rem] ${embedded ? 'h-[calc(100dvh-13rem)]' : 'h-[calc(100dvh-5rem)]'}`}>
      {presenting && (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-lg bg-slate-800/90 text-white p-1 shadow-lg">
          <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))} className="p-2 rounded hover:bg-slate-700" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className="p-2 rounded hover:bg-slate-700" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
          <button onClick={fitToContent} className="px-2 py-1.5 text-xs font-semibold rounded hover:bg-slate-700">Fit</button>
          <button onClick={stopPresenting} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded bg-white text-slate-900 hover:bg-gray-200"><XIcon className="w-3.5 h-3.5" /> Exit</button>
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-2 px-3 py-2 border-b bg-white ${presenting ? 'hidden' : ''}`}>
        {!embedded && <Link href="/meetings/coach" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="w-4 h-4" /> Boards</Link>}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() && title !== initialTitle) renameWhiteboard(id, title).catch(() => {}) }}
          className="font-bold text-lg bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 rounded px-2 py-0.5 min-w-40"
          aria-label="Whiteboard name"
        />
        {meetingId && !embedded && <Link href={`/meetings/${meetingId}`} className="text-xs font-semibold text-blue-600 hover:underline">Meeting</Link>}
        <span className="text-xs text-gray-500 inline-flex items-center gap-1 ml-1">
          {saveState === 'saved' && <><Check className="w-3.5 h-3.5 text-green-600" /> Saved</>}
          {(saveState === 'dirty' || saveState === 'saving') && <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>}
          {saveState === 'error' && <button onClick={flushSave} className="inline-flex items-center gap-1 text-red-600"><AlertCircle className="w-3.5 h-3.5" /> Not saved. Retry</button>}
        </span>
        <button onClick={startPresenting} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700" title="Show this board full screen"><Presentation className="w-4 h-4" /> Present</button>
        <span className="inline-flex items-center gap-1 text-xs text-gray-500" title={here.join(', ')}><Users className="w-4 h-4" /> {here.length || 1} here{here.length > 1 ? `: ${here.slice(0, 3).join(', ')}${here.length > 3 ? '…' : ''}` : ''}</span>
      </div>

      <div className={`flex flex-wrap items-center gap-1.5 px-3 py-2 border-b bg-gray-50 ${presenting ? 'hidden' : ''}`}>
        {TOOLS.map(t => (
          <button key={t.key} onClick={() => setTool(t.key)} title={t.label} aria-label={t.label} aria-pressed={tool === t.key}
            className={`p-2 rounded-lg border ${tool === t.key ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}><t.icon className="w-4 h-4" /></button>
        ))}
        <span className="w-px h-6 bg-gray-300 mx-1" />
        {COLORS.map(c => (
          <button key={c} onClick={() => recolor(c)} aria-label={`Colour ${c}`} style={{ background: c }}
            className={`w-6 h-6 rounded-full border-2 ${(selected && 'color' in selected ? selected.color : color) === c ? 'border-blue-500 ring-2 ring-blue-200' : 'border-white shadow'}`} />
        ))}
        <span className="w-px h-6 bg-gray-300 mx-1" />
        {WIDTHS.map(w => (
          <button key={w} onClick={() => applyWidth(w)} aria-label={`Line width ${w}`} aria-pressed={width === w}
            className={`w-8 h-8 rounded-lg border inline-flex items-center justify-center ${width === w ? 'bg-slate-900 border-slate-900' : 'bg-white hover:bg-gray-50'}`}>
            <span className="rounded-full" style={{ width: w + 4, height: w + 4, background: width === w ? '#fff' : '#111827' }} />
          </button>
        ))}
        <label className="inline-flex items-center gap-1 text-xs text-gray-600" title="Pen / line thickness in pixels">
          Size
          <input type="number" min={1} max={80} value={selected && (selected.t === 'stroke' || selected.t === 'shape') ? (selected.t === 'stroke' && selected.a < 1 ? Math.round(selected.w / 4) : selected.w) : width}
            onChange={e => applyWidth(Number(e.target.value))} className="w-14 border rounded-lg px-1.5 py-1 text-sm" aria-label="Pen size in pixels" />
        </label>
        {(selected?.t === 'text' || selected?.t === 'sticky' || tool === 'text' || tool === 'sticky') && (
          <>
            <select value={(selected?.t === 'text' || selected?.t === 'sticky' ? selected.font : undefined) ?? textFont} onChange={e => applyTextStyle({ font: e.target.value })}
              className="border rounded-lg px-1.5 py-1.5 text-sm bg-white" aria-label="Font" style={{ fontFamily: fontCss((selected?.t === 'text' || selected?.t === 'sticky' ? selected.font : undefined) ?? textFont) }}>
              {FONTS.map(f => <option key={f.key} value={f.key} style={{ fontFamily: f.css }}>{f.label}</option>)}
            </select>
            <select value={SIZES.includes((selected?.t === 'text' ? selected.size : selected?.t === 'sticky' ? selected.size ?? 16 : textSize) as number) ? (selected?.t === 'text' ? selected.size : selected?.t === 'sticky' ? selected.size ?? 16 : textSize) : ''}
              onChange={e => e.target.value && applyTextStyle({ size: Number(e.target.value) })} className="border rounded-lg px-1.5 py-1.5 text-sm bg-white" aria-label="Text size presets">
              <option value="">Size…</option>
              {SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <input type="number" min={10} max={120} value={selected?.t === 'text' ? selected.size : selected?.t === 'sticky' ? selected.size ?? 16 : textSize}
              onChange={e => applyTextStyle({ size: Number(e.target.value) })} className="w-14 border rounded-lg px-1.5 py-1 text-sm" aria-label="Text size in pixels" />
            {selected?.t === 'text' && (
              <>
                <button onClick={() => applyTextStyle({ bold: !selected.bold })} aria-pressed={!!selected.bold} aria-label="Bold" className={`w-8 h-8 rounded-lg border font-bold ${selected.bold ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-gray-50'}`}>B</button>
                <button onClick={() => applyTextStyle({ italic: !selected.italic })} aria-pressed={!!selected.italic} aria-label="Italic" className={`w-8 h-8 rounded-lg border italic ${selected.italic ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-gray-50'}`}>I</button>
              </>
            )}
          </>
        )}
        <span className="w-px h-6 bg-gray-300 mx-1" />
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) addImage(f) }} />
        <button onClick={() => fileInput.current?.click()} disabled={uploading} className={`${btn} inline-flex items-center gap-1 text-sm px-3`} title="Add a photo">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />} Photo
        </button>
        {selected?.t === 'image' && (
          <>
            <button onClick={() => { setEditMode('crop'); setEditingImgId(selected.id) }} className={`${btn} inline-flex items-center gap-1 text-sm px-3`} title="Crop the picture"><Crop className="w-4 h-4" /> Crop</button>
            <button onClick={() => { setEditMode('bg'); setEditingImgId(selected.id) }} className={`${btn} inline-flex items-center gap-1 text-sm px-3`} title="Remove the background"><EraserIcon className="w-4 h-4" /> Remove background</button>
          </>
        )}
        {selected && interactive && (
          <span className="inline-flex items-center gap-0.5" role="group" aria-label="Arrange">
            <button onClick={() => reorder('front')} className={btn} title="Bring to front" aria-label="Bring to front"><BringToFront className="w-4 h-4" /></button>
            <button onClick={() => reorder('forward')} className={btn} title="Bring forward one step" aria-label="Bring forward"><ArrowUp className="w-4 h-4" /></button>
            <button onClick={() => reorder('backward')} className={btn} title="Send backward one step" aria-label="Send backward"><ArrowDown className="w-4 h-4" /></button>
            <button onClick={() => reorder('back')} className={btn} title="Send to back" aria-label="Send to back"><SendToBack className="w-4 h-4" /></button>
          </span>
        )}
        <span className="w-px h-6 bg-gray-300 mx-1" />
        <button onClick={undo} disabled={!past.length} className={btn} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="w-4 h-4" /></button>
        <button onClick={redo} disabled={!future.length} className={btn} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="w-4 h-4" /></button>
        <button onClick={deleteSelected} disabled={!selectedId} className={btn} title="Delete selected (Delete key)" aria-label="Delete selected"><Trash2 className="w-4 h-4" /></button>
        <span className="w-px h-6 bg-gray-300 mx-1" />
        <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))} className={btn} aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
        <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} className={btn} aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={exportPng} className={`${btn} inline-flex items-center gap-1 text-sm px-3`}><Download className="w-4 h-4" /> PNG</button>
        <button onClick={clearAll} className="px-3 py-2 text-sm rounded-lg border bg-white hover:bg-red-50 text-red-600">Clear</button>
      </div>

      <div ref={scroller} className="flex-1 overflow-auto bg-slate-200 p-4">
        <div style={{ width: W * zoom, height: H * zoom }} className="relative mx-auto">
          <div
            ref={world}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ width: W, height: H, transform: `scale(${zoom})`, transformOrigin: '0 0', cursor, touchAction: 'none' }}
            className="absolute left-0 top-0 bg-white shadow-lg select-none"
          >
            <svg width={W} height={H} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
              <defs>
                <pattern id="wb-grid" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#cbd5e1" /></pattern>
              </defs>
              <rect width={W} height={H} fill="url(#wb-grid)" />
            </svg>

            {segments.map(seg => {
              if ('svg' in seg) {
                return (
                  <svg key={seg.key} width={W} height={H} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    {seg.svg.map(drawNode)}
                  </svg>
                )
              }
              const i = seg.item
              if (i.t === 'sticky') {
                const sel = i.id === selectedId
                return (
                  <div key={i.id} data-item={i.id} onPointerDown={e => { if (interactive) e.stopPropagation() }} style={{ left: i.x, top: i.y, width: i.w, height: i.h, background: `${i.color}33`, borderColor: i.color, pointerEvents: tool === 'eraser' || interactive ? 'auto' : 'none' }}
                    className={`absolute border-2 rounded-md shadow-sm flex flex-col ${sel ? 'ring-2 ring-blue-500' : ''}`}>
                    <div onPointerDown={e => startDrag(e, i)} className={`h-4 shrink-0 rounded-t-sm ${interactive ? 'cursor-move' : ''}`} style={{ background: `${i.color}55` }} title="Drag to move" />
                    <textarea
                      value={i.text}
                      autoFocus={focusId === i.id}
                      onFocus={() => setSelectedId(i.id)}
                      onChange={e => editText(i, e.target.value)}
                      onBlur={() => commitText({ ...i })}
                      placeholder="Type here…"
                      className="flex-1 w-full resize-none bg-transparent p-2 leading-snug text-gray-900 outline-none"
                      style={{ pointerEvents: interactive ? 'auto' : 'none', fontSize: i.size ?? 16, fontFamily: fontCss(i.font) }}
                      aria-label="Sticky note text"
                    />
                    {sel && <div onPointerDown={e => startResize(e, i)} className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-blue-500 cursor-nwse-resize" title="Resize" />}
                  </div>
                )
              }
              if (i.t === 'text') {
                const sel = i.id === selectedId
                return (
                  <div key={i.id} data-item={i.id} onPointerDown={e => { if (interactive) e.stopPropagation() }} style={{ left: i.x, top: i.y, pointerEvents: tool === 'eraser' || interactive ? 'auto' : 'none' }} className={`absolute flex items-start ${sel ? 'outline outline-2 outline-blue-500 rounded' : ''}`}>
                    <div onPointerDown={e => startDrag(e, i)} className={`w-3 self-stretch bg-gray-200 rounded-l ${interactive ? 'cursor-move' : ''}`} title="Drag to move" />
                    <textarea
                      value={i.text}
                      autoFocus={focusId === i.id}
                      onFocus={() => setSelectedId(i.id)}
                      onChange={e => editText(i, e.target.value)}
                      onBlur={() => commitText({ ...i })}
                      rows={Math.max(1, i.text.split('\n').length)}
                      cols={Math.max(8, ...i.text.split('\n').map(l => l.length + 1))}
                      placeholder="Text"
                      className="resize-none bg-transparent outline-none overflow-hidden"
                      style={{ color: i.color, fontSize: i.size, fontFamily: fontCss(i.font), fontWeight: i.bold ? 700 : 400, fontStyle: i.italic ? 'italic' : 'normal', lineHeight: 1.35, pointerEvents: interactive ? 'auto' : 'none' }}
                      aria-label="Text"
                    />
                  </div>
                )
              }
              if (i.t === 'image') {
                const sel = i.id === selectedId
                const src = imageUrls[i.path]
                return (
                  <div key={i.id} data-item={i.id} onPointerDown={e => { if (interactive) e.stopPropagation() }}
                    style={{ left: i.x, top: i.y, width: i.w, height: i.h, transform: `rotate(${i.rot}deg)`, transformOrigin: 'center', pointerEvents: tool === 'eraser' || interactive ? 'auto' : 'none' }}
                    className={`absolute ${sel ? 'outline outline-2 outline-blue-500' : ''}`}>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" draggable={false} onPointerDown={e => startDrag(e, i)} className={`w-full h-full select-none ${interactive ? 'cursor-move' : ''}`} />
                    ) : <div className="w-full h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">Loading picture…</div>}
                    {sel && interactive && (
                      <>
                        <div onPointerDown={e => startImageGesture(e, i, 'iresize')} className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-blue-500 cursor-nwse-resize" title="Resize (keeps proportions)" />
                        <div onPointerDown={e => startImageGesture(e, i, 'irotate')} className="absolute left-1/2 -top-8 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 cursor-grab ring-2 ring-white" title="Rotate (hold Shift to snap to 15°)" />
                        <div className="absolute left-1/2 -top-4 h-4 w-px bg-blue-500 -translate-x-1/2" />
                      </>
                    )}
                  </div>
                )
              }
              return null
            })}
          </div>
        </div>
      </div>
      {editingImgId && (() => {
        const cur = items.find(i => i.id === editingImgId)
        const src = cur && cur.t === 'image' ? imageUrls[cur.path] : null
        return src ? <ImageEditor url={src} initialMode={editMode} onApply={applyEditedImage} onClose={() => setEditingImgId(null)} /> : null
      })()}
    </div>
  )
}
