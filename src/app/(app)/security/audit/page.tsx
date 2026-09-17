'use client'

import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { ClipboardList, AlertOctagon, Download, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Activity } from 'lucide-react'
import PhotoLightbox from '@/components/PhotoLightbox'
import ActivityLogFeed from '@/components/ActivityLogFeed'
import { buildActivityLog, ActivityEvent } from '@/lib/security/activityLog'
import { useLang } from '@/lib/i18n/useLang'
import { makeT } from '@/lib/i18n/languages'
import { securityDict } from '@/lib/i18n/dict/security'
import LanguageSwitcher from '@/components/LanguageSwitcher'

// Local-date arithmetic only — .toISOString() converts to UTC, which silently
// shifts the date by a day for any timezone ahead of UTC (e.g. the "forward"
// button did nothing for a UTC+8 user: local tomorrow at local midnight is
// still "today" in UTC until 16:00 UTC).
function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoToday() { return toLocalYMD(new Date()) }
function addDays(dateStr: string, n: number) {
  const [y, m, day] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, day)
  d.setDate(d.getDate() + n)
  return toLocalYMD(d)
}

type Section = { title: string; icon?: string; rows: any[]; columns: { key: string; label: string; fmt?: (v: any, row: any) => string }[] }
type Entry = { id: number; category: string; person_name: string; company: string | null; photo_drive_id: string | null; time_in: string; time_out: string | null; purpose: string | null; looking_for: string | null; vehicle_no: string | null; badge_no: string | null; reference_no: string | null; notes: string | null; created_by: string | null }
type PostLog = { guard_name: string; post_name: string; time_in: string; time_out: string | null }
type Checkpoint = { id: number; name: string; sequence_order: number }
type ClockRecord = { id: number; checkpoint_name: string; guard_name: string; clocked_at: string; distance_meters: number; photo_drive_id: string; remark: string | null }

// One row per guard/post, one cell per hour of the day — a cell is filled if
// that guard/post had an active shift covering that hour. Mirrors the
// legacy app's Guard Movements / Post Duty timelines.
function buildTimelineRows(logs: PostLog[], groupKey: 'guard_name' | 'post_name', dateStr: string) {
  const groups = Array.from(new Set(logs.map(l => l[groupKey]))).sort()
  const dayStart = new Date(dateStr + 'T00:00:00')
  return groups.map(name => {
    const groupLogs = logs.filter(l => l[groupKey] === name)
    const cells = Array.from({ length: 24 }, (_, h) => {
      const hourStart = new Date(dayStart); hourStart.setHours(h, 0, 0, 0)
      const hourEnd = new Date(dayStart); hourEnd.setHours(h, 59, 59, 999)
      const active = groupLogs.filter(l => {
        const tin = new Date(l.time_in)
        const tout = l.time_out ? new Date(l.time_out) : new Date()
        return tin <= hourEnd && tout >= hourStart
      })
      if (active.length === 0) return null
      return groupKey === 'guard_name'
        ? active[0].post_name.split(' ').filter(w => w !== '-' && w !== '&').map(w => w[0]).join('').slice(0, 3).toUpperCase() || active[0].post_name.slice(0, 3).toUpperCase()
        : active.map(l => l.guard_name.split(' ')[0]).join(', ')
    })
    return { name, cells }
  })
}

export default function AuditPage() {
  const supabase = createClient()
  const [date, setDate] = useState(isoToday())
  const [loading, setLoading] = useState(true)
  const [anomalySections, setAnomalySections] = useState<Section[]>([])
  const [historySections, setHistorySections] = useState<Section[]>([])
  const [photoEntries, setPhotoEntries] = useState<Entry[]>([])
  const [entryDetail, setEntryDetail] = useState<Entry | null>(null)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  // zoomList/zoomIndex are set only when the lightbox was opened from a
  // browsable gallery (session matrix or the Visitor/Delivery Photos grid)
  // — drives the prev/next arrows and caption. Left null for every other
  // photo click on this page (plain single-photo view, no sequence).
  const [zoomList, setZoomList] = useState<'matrix' | 'entries' | null>(null)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)
  const [guardTimeline, setGuardTimeline] = useState<{ name: string; cells: (string | null)[] }[]>([])
  const [postTimeline, setPostTimeline] = useState<{ name: string; cells: (string | null)[] }[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const [showRangeExport, setShowRangeExport] = useState(false)
  const [rangeFrom, setRangeFrom] = useState(isoToday())
  const [rangeTo, setRangeTo] = useState(isoToday())
  const [rangeExporting, setRangeExporting] = useState(false)
  const [rangeExportProgress, setRangeExportProgress] = useState<string | null>(null)
  const [lang, setLang] = useLang()
  const t = makeT(securityDict, lang)
  // Long, rarely-needed history tables/timelines stay collapsed by default
  // and render only once expanded — keyed by section title, which already
  // changes per-date, so switching days naturally starts collapsed again.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [clockingRecords, setClockingRecords] = useState<ClockRecord[]>([])

  function toggle(key: string) { setExpanded(e => ({ ...e, [key]: !e[key] })) }

  useEffect(() => { load() }, [date, lang])
  // Checkpoints rarely change — load once rather than on every date switch.
  useEffect(() => { loadCheckpoints() }, [])

  async function loadCheckpoints() {
    const { data } = await supabase.from('security_checkpoints').select('id, name, sequence_order').order('sequence_order')
    setCheckpoints(data || [])
  }

  async function load() {
    setLoading(true)
    const dayStart = new Date(date + 'T00:00:00')
    const dayEnd = new Date(date + 'T23:59:59.999')
    const now = new Date()
    const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    const [
      { data: abandonedKeys }, { data: shifts }, { data: dayEntries }, { data: overstayed },
      { data: todayIncidents }, { data: todayPanics }, { data: postLogs }, { data: keyLogs },
      { data: dayGateEvents }, { data: dayClocking },
    ] = await Promise.all([
      supabase.from('security_key_logs').select('*').eq('status', 'out').lt('time_issued', cutoff24h).order('time_issued'),
      supabase.from('security_post_logs').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()),
      supabase.from('security_entries').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()).order('time_in', { ascending: false }),
      supabase.from('security_entries').select('*').eq('status', 'in').lt('time_in', cutoff24h).order('time_in'),
      supabase.from('security_incidents').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_panic_logs').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_post_logs').select('*').gte('time_in', dayStart.toISOString()).lte('time_in', dayEnd.toISOString()).order('time_in', { ascending: false }),
      supabase.from('security_key_logs').select('*').gte('time_issued', dayStart.toISOString()).lte('time_issued', dayEnd.toISOString()).order('time_issued', { ascending: false }),
      supabase.from('security_gate_events').select('*').gte('created_at', dayStart.toISOString()).lte('created_at', dayEnd.toISOString()).order('created_at', { ascending: false }),
      supabase.from('security_clocking_records').select('*').gte('clocked_at', dayStart.toISOString()).lte('clocked_at', dayEnd.toISOString()).order('clocked_at', { ascending: false }),
    ])

    const suspiciousShifts = (shifts || []).filter(s => {
      const end = s.time_out ? new Date(s.time_out) : now
      const hours = (end.getTime() - new Date(s.time_in).getTime()) / 3600000
      return hours < 0.5 || hours > 14
    })
    // A still-pending self check-in (not yet reviewed/approved by a guard)
    // has no category/company/purpose yet by design — that's not the same
    // thing as an "incomplete" approved entry, so exclude it here. "Company"
    // is also not a meaningful field for in-house staff (they don't have an
    // external company), so only require it for Visitor/Delivery — flagging
    // every in-house entry over a field that doesn't apply to them was pure
    // noise, not a real anomaly.
    const incompleteEntries = (dayEntries || []).filter(e =>
      e.status !== 'pending' && (!e.purpose || (e.category !== 'inhouse' && !e.company))
    )

    const catLabel = (v: string) => t(`category.${v}`)

    setAnomalySections([
      { title: t('audit.sec.panicAlarms'), rows: todayPanics || [], columns: [{ key: 'triggered_by', label: t('audit.col.triggeredBy') }, { key: 'remark', label: t('audit.col.remark') }, { key: 'created_at', label: t('audit.col.time'), fmt: v => new Date(v).toLocaleString() }] },
      { title: t('audit.sec.incidentReports'), rows: todayIncidents || [], columns: [{ key: 'type', label: t('audit.col.type') }, { key: 'severity', label: t('audit.col.severity') }, { key: 'description', label: t('audit.col.description') }, { key: 'reported_by', label: t('audit.col.reporter') }, { key: 'created_at', label: t('audit.col.time'), fmt: v => new Date(v).toLocaleString() }] },
      { title: t('audit.sec.overstayed'), rows: overstayed || [], columns: [{ key: 'category', label: t('audit.col.type'), fmt: catLabel }, { key: 'person_name', label: t('audit.col.name') }, { key: 'time_in', label: t('audit.col.timeIn'), fmt: v => new Date(v).toLocaleString() }] },
      { title: t('audit.sec.overdueKeys'), rows: abandonedKeys || [], columns: [{ key: 'key_name', label: t('audit.col.key') }, { key: 'issued_to', label: t('audit.col.issuedTo') }, { key: 'issued_by', label: t('audit.col.issuedBy') }, { key: 'time_issued', label: t('audit.col.timeOut'), fmt: v => new Date(v).toLocaleString() }] },
      { title: t('audit.sec.suspiciousShifts'), rows: suspiciousShifts, columns: [{ key: 'guard_name', label: t('audit.col.guard') }, { key: 'post_name', label: t('audit.col.post') }, { key: 'time_in', label: t('audit.col.in'), fmt: v => new Date(v).toLocaleString() }, { key: 'time_out', label: t('audit.col.out'), fmt: v => v ? new Date(v).toLocaleString() : t('audit.col.stillActive') }] },
      { title: t('audit.sec.incompleteEntries'), rows: incompleteEntries, columns: [{ key: 'category', label: t('audit.col.type'), fmt: catLabel }, { key: 'person_name', label: t('audit.col.name') }, { key: 'created_by', label: t('audit.col.attendedBy') }] },
    ])

    setPhotoEntries((dayEntries || []).filter(e => e.photo_drive_id))
    setClockingRecords(dayClocking || [])

    setHistorySections([
      { title: `${t('audit.sec.visitorEntries')} (${(dayEntries || []).length})`, rows: dayEntries || [], columns: [{ key: 'category', label: t('audit.col.type'), fmt: catLabel }, { key: 'person_name', label: t('audit.col.name') }, { key: 'company', label: t('audit.col.company') }, { key: 'time_in', label: t('audit.col.in'), fmt: v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }, { key: 'time_out', label: t('audit.col.out'), fmt: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-' }] },
      { title: `${t('audit.sec.postLogs')} (${(postLogs || []).length})`, rows: postLogs || [], columns: [{ key: 'post_name', label: t('audit.col.post') }, { key: 'guard_name', label: t('audit.col.guard') }, { key: 'time_in', label: t('audit.col.in'), fmt: v => new Date(v).toLocaleString() }, { key: 'time_out', label: t('audit.col.out'), fmt: v => v ? new Date(v).toLocaleString() : '-' }] },
      { title: `${t('audit.sec.keyLogs')} (${(keyLogs || []).length})`, rows: keyLogs || [], columns: [{ key: 'key_name', label: t('audit.col.key') }, { key: 'issued_to', label: t('audit.col.issuedTo') }, { key: 'time_issued', label: t('audit.col.out'), fmt: v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }, { key: 'time_returned', label: t('audit.col.in'), fmt: v => v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-' }] },
      { title: `${t('audit.sec.gpsClocking')} (${(dayClocking || []).length})`, rows: dayClocking || [], columns: [{ key: 'checkpoint_name', label: t('audit.col.checkpoint') }, { key: 'guard_name', label: t('audit.col.guard') }, { key: 'clocked_at', label: t('audit.col.time'), fmt: v => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }, { key: 'distance_meters', label: t('audit.col.distance'), fmt: v => `${v}m` }, { key: 'remark', label: t('audit.col.remark') }] },
    ])

    setGuardTimeline(buildTimelineRows(postLogs || [], 'guard_name', date))
    setPostTimeline(buildTimelineRows(postLogs || [], 'post_name', date))

    setActivity(buildActivityLog({
      entries: dayEntries || [], postLogs: postLogs || [], gateEvents: dayGateEvents || [],
      panicLogs: todayPanics || [], incidents: todayIncidents || [], clockingRecords: dayClocking || [],
    }))

    setLoading(false)
  }

  function exportCSV() {
    if (!containerRef.current) return
    // Collapsed sections have no <table> in the DOM to scrape (they're not
    // rendered until expanded) — force everything open, scrape, then put
    // the user's collapsed/expanded state back exactly as it was.
    // flushSync forces the expand to actually commit to the DOM before the
    // very next line reads it, instead of waiting for React's own timing.
    const prevExpanded = expanded
    const allKeys = ['guardTimeline', 'postTimeline', 'gpsSessionMatrix', ...historySections.map(s => s.title)]
    flushSync(() => setExpanded(Object.fromEntries(allKeys.map(k => [k, true]))))

    let csv = `${t('audit.export.reportDate')},${date}\n\n`
    containerRef.current.querySelectorAll('[data-audit-card]').forEach(card => {
      const title = card.querySelector('[data-audit-title]')?.textContent?.trim() || ''
      csv += `"${title.replace(/"/g, '""')}"\n`
      const table = card.querySelector('table')
      if (table) {
        table.querySelectorAll('tr').forEach(row => {
          const cells = Array.from(row.querySelectorAll('th, td')).map(c => `"${(c.textContent || '').trim().replace(/"/g, '""')}"`)
          csv += cells.join(',') + '\n'
        })
      }
      csv += '\n'
    })

    flushSync(() => setExpanded(prevExpanded))

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Security_Audit_${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function csvCell(v: any) {
    return `"${String(v ?? '-').replace(/"/g, '""')}"`
  }
  function csvRow(cells: any[]) {
    return cells.map(csvCell).join(',') + '\n'
  }

  // Full log export for an arbitrary date range — separate from the daily
  // audit view above (which only covers `date`), and queried fresh rather
  // than reusing that day's already-loaded state. A real, styled .xlsx
  // (via ExcelJS) with embedded photos, not a plain CSV — one sheet per
  // log type plus a cover sheet.
  async function exportDateRange() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) { alert(t('audit.invalidRange')); return }
    setRangeExporting(true)
    setRangeExportProgress(null)
    try {
      const rangeStart = new Date(rangeFrom + 'T00:00:00').toISOString()
      const rangeEnd = new Date(rangeTo + 'T23:59:59.999').toISOString()

      const [
        { data: entries }, { data: postLogs }, { data: gateEvents }, { data: keyLogs }, { data: incidents }, { data: panics }, { data: clocking },
      ] = await Promise.all([
        supabase.from('security_entries').select('*').gte('time_in', rangeStart).lte('time_in', rangeEnd).order('time_in'),
        supabase.from('security_post_logs').select('*').gte('time_in', rangeStart).lte('time_in', rangeEnd).order('time_in'),
        supabase.from('security_gate_events').select('*').gte('created_at', rangeStart).lte('created_at', rangeEnd).order('created_at'),
        supabase.from('security_key_logs').select('*').gte('time_issued', rangeStart).lte('time_issued', rangeEnd).order('time_issued'),
        supabase.from('security_incidents').select('*').gte('created_at', rangeStart).lte('created_at', rangeEnd).order('created_at'),
        supabase.from('security_panic_logs').select('*').gte('created_at', rangeStart).lte('created_at', rangeEnd).order('created_at'),
        supabase.from('security_clocking_records').select('*').gte('clocked_at', rangeStart).lte('clocked_at', rangeEnd).order('clocked_at'),
      ])

      const catLabel = (v: string) => t(`category.${v}`)
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'AlphaVision'
      workbook.created = new Date()

      const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
      const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } }
      const THIN_BORDER = { top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }, bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } } }

      // Cover sheet
      const cover = workbook.addWorksheet('Report')
      cover.columns = [{ width: 26 }, { width: 40 }]
      cover.mergeCells('A1:B1')
      cover.getCell('A1').value = 'AlphaVision — Security Log Export'
      cover.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF1D4ED8' } }
      cover.addRow([])
      cover.addRow(['Date Range', `${rangeFrom} to ${rangeTo}`])
      cover.addRow(['Generated', new Date().toLocaleString()])
      cover.addRow([])
      const summaryHeaderRow = cover.addRow(['Section', 'Records'])
      summaryHeaderRow.font = HEADER_FONT
      summaryHeaderRow.fill = HEADER_FILL
      const sectionCounts: [string, number][] = [
        [t('audit.export.entries'), (entries || []).length],
        [t('audit.sec.postLogs'), (postLogs || []).length],
        [t('audit.export.gateEvents'), (gateEvents || []).length],
        [t('audit.sec.keyLogs'), (keyLogs || []).length],
        [t('audit.export.incidentReports'), (incidents || []).length],
        [t('audit.export.panicAlarms'), (panics || []).length],
        [t('audit.export.gpsClocking'), (clocking || []).length],
      ]
      sectionCounts.forEach(([name, count]) => cover.addRow([name, count]))
      cover.getColumn(1).font = { bold: true }

      // Photos are fetched from our own authenticated proxy route (same
      // origin, session cookies included automatically) and embedded as
      // floating images anchored to each row. Capped across the whole
      // export so a huge date range doesn't take minutes / a huge file —
      // rows beyond the cap still export fully, just without a thumbnail.
      const PHOTO_CAP = 250
      let photoBudget = PHOTO_CAP
      let photosOmitted = 0
      let photosProcessed = 0
      const totalCandidatePhotos = (entries || []).filter(e => e.photo_drive_id).length
        + (incidents || []).filter(i => i.photo_drive_id).length
        + (clocking || []).filter(c => c.photo_drive_id).length

      async function fetchImageBuffer(fileId: string): Promise<ArrayBuffer | null> {
        try {
          const res = await fetch(`/api/security/photo/${fileId}`)
          if (!res.ok) return null
          return await res.arrayBuffer()
        } catch {
          return null
        }
      }

      // Simple bounded-concurrency map so photo fetches overlap (faster)
      // without firing dozens of requests at once.
      async function withConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = new Array(items.length)
        let next = 0
        async function worker() {
          while (next < items.length) {
            const i = next++
            results[i] = await fn(items[i])
            photosProcessed++
            if (totalCandidatePhotos > 0) setRangeExportProgress(`${t('audit.exportingPhotos')} ${photosProcessed}/${totalCandidatePhotos}`)
          }
        }
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
        return results
      }

      async function addSection<T>(
        sheetName: string,
        headers: string[],
        rows: T[],
        cellsOf: (row: T) => any[],
        photoIdOf?: (row: T) => string | null,
      ) {
        const ws = workbook.addWorksheet(sheetName)
        const hasPhoto = !!photoIdOf
        const cols = hasPhoto ? ['Photo', ...headers] : headers
        ws.columns = cols.map((h, i) => ({ header: h, width: hasPhoto && i === 0 ? 9 : Math.min(Math.max(h.length + 4, 12), 28) }))
        const headerRow = ws.getRow(1)
        headerRow.font = HEADER_FONT
        headerRow.fill = HEADER_FILL
        headerRow.height = 20
        ws.views = [{ state: 'frozen', ySplit: 1 }]

        if (rows.length === 0) {
          ws.addRow(hasPhoto ? ['', 'No records for this range'] : ['No records for this range'])
          return
        }

        const buffers = hasPhoto
          ? await withConcurrency(rows, 4, async row => {
              const fileId = photoIdOf!(row)
              if (!fileId || photoBudget <= 0) { if (fileId) photosOmitted++; return null }
              photoBudget--
              return fetchImageBuffer(fileId)
            })
          : []

        rows.forEach((row, i) => {
          const cells = cellsOf(row)
          const r = ws.addRow(hasPhoto ? ['', ...cells] : cells)
          r.alignment = { vertical: 'middle', wrapText: true }
          r.border = THIN_BORDER
          if (hasPhoto) {
            r.height = 42
            const buf = buffers[i]
            if (buf) {
              const imageId = workbook.addImage({ buffer: buf as any, extension: 'jpeg' })
              ws.addImage(imageId, { tl: { col: 0.1, row: r.number - 1 + 0.08 }, ext: { width: 40, height: 40 } })
            }
          }
        })
      }

      await addSection(
        'Entries', [t('audit.col.type'), t('audit.col.name'), t('audit.col.company'), t('common.purpose'), t('entries.lookingFor'), t('entries.vehicleNo'), t('entries.badgeNo'), t('entries.referenceNo'), t('common.status'), t('audit.col.timeIn'), t('audit.col.timeOut'), t('audit.col.attendedBy'), 'Abnormal?', 'Abnormal Reason', t('common.notes')],
        entries || [],
        e => [catLabel(e.category) || e.category, e.person_name, e.company, e.purpose, e.looking_for, e.vehicle_no, e.badge_no, e.reference_no, e.status, new Date(e.time_in).toLocaleString(), e.time_out ? new Date(e.time_out).toLocaleString() : '-', e.created_by, e.abnormal_flag ? 'Yes' : 'No', e.abnormal_reason, e.notes],
        e => e.photo_drive_id,
      )
      await addSection(
        'Post Logs', [t('audit.col.post'), t('audit.col.guard'), t('audit.col.timeIn'), t('audit.col.timeOut'), t('common.notes'), 'Logged By'],
        postLogs || [],
        p => [p.post_name, p.guard_name, new Date(p.time_in).toLocaleString(), p.time_out ? new Date(p.time_out).toLocaleString() : '-', p.notes, p.created_by],
      )
      await addSection(
        'Gate Events', ['Gate', 'Action', 'By', t('audit.col.time')],
        gateEvents || [],
        g => [g.gate_name, g.action, g.username, new Date(g.created_at).toLocaleString()],
      )
      await addSection(
        'Key Logs', [t('audit.col.key'), t('audit.col.issuedTo'), t('audit.col.issuedBy'), t('common.purpose'), t('audit.col.timeOut'), t('audit.col.timeIn'), t('common.status'), 'Returned By'],
        keyLogs || [],
        k => [k.key_name, k.issued_to, k.issued_by, k.purpose, new Date(k.time_issued).toLocaleString(), k.time_returned ? new Date(k.time_returned).toLocaleString() : '-', k.status, k.returned_by],
      )
      await addSection(
        'Incidents', [t('audit.col.type'), t('audit.col.severity'), t('audit.col.description'), t('common.location'), t('audit.col.reporter'), t('common.status'), t('audit.col.time')],
        incidents || [],
        i => [i.type, i.severity, i.description, i.location, i.reported_by, i.status, new Date(i.created_at).toLocaleString()],
        i => i.photo_drive_id,
      )
      await addSection(
        'Panic Alarms', [t('audit.col.triggeredBy'), t('audit.col.remark'), t('audit.col.time')],
        panics || [],
        p => [p.triggered_by, p.remark, new Date(p.created_at).toLocaleString()],
      )
      await addSection(
        'GPS Clocking', [t('audit.col.checkpoint'), t('audit.col.guard'), t('audit.col.distance'), t('audit.col.remark'), t('audit.col.time')],
        clocking || [],
        c => [c.checkpoint_name, c.guard_name, `${c.distance_meters}m`, c.remark, new Date(c.clocked_at).toLocaleString()],
        c => c.photo_drive_id,
      )

      if (photosOmitted > 0) {
        cover.addRow([])
        cover.addRow(['Note', `${photosOmitted} photo(s) omitted — this export embeds up to ${PHOTO_CAP} photos per file. Narrow the date range to include more.`])
      }

      setRangeExportProgress(t('audit.exportingFinalizing'))
      const arrayBuffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Security_Log_Export_${rangeFrom}_to_${rangeTo}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setRangeExporting(false)
      setRangeExportProgress(null)
    }
  }

  const totalFlags = anomalySections.reduce((s, sec) => s + sec.rows.length, 0)
  const isToday = date === isoToday()

  // GPS Clocking session matrix — one row per guard's patrol that day, one
  // column per checkpoint (moved here from the GPS Clocking page itself,
  // which now only handles the live clock-in action). A checkpoint since
  // renamed/deleted still gets its own column (by whatever name history
  // recorded) rather than losing that data from the matrix.
  const sessionGuards = [...new Set(clockingRecords.map(h => h.guard_name))].sort()
  const sessionColumns = [
    ...checkpoints.map(c => c.name),
    ...[...new Set(clockingRecords.map(h => h.checkpoint_name))].filter(n => !checkpoints.some(c => c.name === n)).sort(),
  ]
  function sessionCell(guard: string, checkpointName: string): ClockRecord | null {
    const matches = clockingRecords.filter(h => h.guard_name === guard && h.checkpoint_name === checkpointName)
    if (matches.length === 0) return null
    return matches.reduce((latest, r) => (new Date(r.clocked_at) > new Date(latest.clocked_at) ? r : latest))
  }

  // Flat, reading-order (row by row, left to right) list of every photo
  // currently showing in the session matrix — lets the lightbox's
  // prev/next arrows step through the grid the same way your eye would.
  const sessionPhotoList = sessionGuards.flatMap(guard =>
    sessionColumns.map(name => sessionCell(guard, name)).filter((r): r is ClockRecord => !!r)
  )

  function openMatrixZoom(rec: ClockRecord) {
    const idx = sessionPhotoList.findIndex(r => r.id === rec.id)
    setZoomList('matrix')
    setZoomIndex(idx)
    setZoomSrc(`/api/security/photo/${rec.photo_drive_id}`)
  }
  function openEntryZoom(entry: Entry) {
    const idx = photoEntries.findIndex(e => e.id === entry.id)
    setZoomList('entries')
    setZoomIndex(idx)
    setZoomSrc(`/api/security/photo/${entry.photo_drive_id}`)
  }
  function stepZoom(delta: number) {
    if (zoomIndex === null || !zoomList) return
    const list = zoomList === 'matrix' ? sessionPhotoList : photoEntries
    const next = Math.min(Math.max(zoomIndex + delta, 0), list.length - 1)
    setZoomIndex(next)
    setZoomSrc(`/api/security/photo/${(list[next] as any).photo_drive_id}`)
  }

  function renderTable(section: Section) {
    return (
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>{section.columns.map(c => <th key={c.key} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">{c.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {section.rows.map((row, i) => (
            <tr key={i}>
              {section.columns.map(c => <td key={c.key} className="px-4 py-2">{c.fmt ? c.fmt(row[c.key], row) : (row[c.key] ?? '-')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  function renderTimeline(rows: { name: string; cells: (string | null)[] }[], rowLabel: string) {
    if (rows.length === 0) return null
    return (
      <div className="overflow-x-auto border rounded-lg">
        <table className="text-xs border-collapse w-full min-w-[800px] text-center">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left px-3 py-2 border-r sticky left-0 bg-gray-50 min-w-[110px]">{rowLabel}</th>
              {Array.from({ length: 24 }, (_, h) => <th key={h} className="px-1 py-2 border-r font-normal">{String(h).padStart(2, '0')}:00</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} className="border-b">
                <td className="text-left px-3 py-1.5 border-r font-semibold sticky left-0 bg-white whitespace-nowrap">{r.name}</td>
                {r.cells.map((c, h) => (
                  <td key={h} className={`border-r px-0.5 py-1.5 leading-tight ${c ? 'bg-indigo-100 text-indigo-800 font-bold' : ''}`} title={c || ''}>{c || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Header button for a collapsible history block — collapsed by default
  // (see `expanded` state), so a long day's worth of logs doesn't render
  // (or even get iterated over) until someone actually asks to see it.
  function renderSectionToggle(key: string, label: React.ReactNode) {
    const isOpen = !!expanded[key]
    return (
      <button onClick={() => toggle(key)} className="w-full flex items-center justify-between gap-2 text-left mb-2">
        <h3 className="text-xs font-bold text-slate-500 uppercase" data-audit-title>{label}</h3>
        <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 flex-shrink-0">
          {isOpen ? t('audit.collapse') : t('audit.expand')}
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" ref={containerRef}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList className="w-7 h-7 text-blue-600" /> {t('audit.title')}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <LanguageSwitcher lang={lang} onChange={setLang} />
          <button onClick={exportCSV} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-200" title={t('audit.exportTodayTitle')}><Download className="w-4 h-4" /> {t('audit.exportToday')}</button>
          <button onClick={() => setShowRangeExport(s => !s)} className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg ${showRangeExport ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}><Download className="w-4 h-4" /> {t('audit.exportByRange')}</button>
          <button onClick={() => setDate(d => addDays(d, -1))} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><ChevronLeft className="w-4 h-4" /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
          <button onClick={() => setDate(d => addDays(d, 1))} disabled={isToday} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {showRangeExport && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl shadow-sm p-5 mb-6 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-blue-800 mb-1">{t('audit.from')}</label>
            <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} max={isoToday()} className="border rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-blue-800 mb-1">{t('audit.to')}</label>
            <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)} max={isoToday()} className="border rounded-md px-3 py-2 text-sm bg-white" />
          </div>
          <button onClick={exportDateRange} disabled={rangeExporting} className="flex items-center gap-1.5 bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700">
            <Download className="w-4 h-4" /> {rangeExporting ? (rangeExportProgress || t('audit.exporting')) : t('audit.downloadExcel')}
          </button>
          <p className="text-xs text-blue-700 basis-full">{t('audit.rangeHint')}</p>
        </div>
      )}

      <div className="bg-white border rounded-xl shadow-sm p-5 mb-6" data-audit-card>
        <h2 className="text-sm font-bold text-slate-700 mb-3" data-audit-title>🚨 {isToday ? t('audit.todayAnomalies') : `${t('audit.anomaliesFor')} ${date}`}</h2>
        {!loading && totalFlags === 0 ? (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-5 py-4 text-sm font-medium">✅ {t('audit.noAnomalies')}</div>
        ) : (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm font-bold flex items-center gap-2">⚠️ {totalFlags} {t('audit.issuesDetected')}</div>
        )}
      </div>

      <div className="space-y-6 mb-8">
        {anomalySections.filter(s => s.rows.length > 0).map(s => (
          <div key={s.title} className="bg-white border rounded-xl shadow-sm overflow-hidden" data-audit-card>
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-700" data-audit-title>{s.title}</h2>
              <span className="text-xs text-gray-400">({s.rows.length})</span>
            </div>
            {renderTable(s)}
          </div>
        ))}
      </div>

      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-6" data-audit-card>
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2" data-audit-title><Activity className="w-4 h-4 text-indigo-500" /> {t('audit.activityLogFor')} {date}</h2>
          <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1 font-semibold">{activity.length}</span>
        </div>
        <ActivityLogFeed events={activity} emptyLabel={t('audit.noActivityForDate')} />
      </div>

      <div className="bg-white border rounded-xl shadow-sm p-5" data-audit-card>
        <h2 className="text-sm font-bold text-slate-700 mb-4" data-audit-title>📖 {t('audit.fullHistoryFor')} {date}</h2>

        {photoEntries.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-bold text-blue-600 uppercase mb-2">📸 {t('audit.visitorPhotos')}</h3>
            <div className="flex flex-wrap gap-3">
              {photoEntries.map(e => (
                <button key={e.id} onClick={() => setEntryDetail(e)} title="View check-in / check-out details" className="w-28 border rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition text-left flex-shrink-0">
                  <img src={`/api/security/photo/${e.photo_drive_id}`} className="w-full h-[85px] object-cover" />
                  <div className="px-2 py-1.5">
                    <div className="text-xs font-bold text-slate-800 truncate" title={e.person_name}>{e.person_name}</div>
                    <div className="text-[10px] text-gray-500">{new Date(e.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {guardTimeline.length > 0 && (
          <div className="mb-6" data-audit-card>
            {renderSectionToggle('guardTimeline', <>⏱️ {t('audit.guardMovements')}</>)}
            {expanded['guardTimeline'] && (<>
              <p className="text-[11px] text-gray-400 mb-2">{t('audit.guardMovementsHint')}</p>
              {renderTimeline(guardTimeline, t('audit.guardCol'))}
            </>)}
          </div>
        )}

        {postTimeline.length > 0 && (
          <div className="mb-6" data-audit-card>
            {renderSectionToggle('postTimeline', <>⏱️ {t('audit.postDuty')}</>)}
            {expanded['postTimeline'] && (<>
              <p className="text-[11px] text-gray-400 mb-2">{t('audit.postDutyHint')}</p>
              {renderTimeline(postTimeline, t('audit.postCol'))}
            </>)}
          </div>
        )}

        {sessionGuards.length > 0 && (
          <div className="mb-6" data-audit-card>
            {renderSectionToggle('gpsSessionMatrix', <>🧭 {t('gps.sessionMatrix')}</>)}
            {expanded['gpsSessionMatrix'] && (<>
              <p className="text-[11px] text-gray-400 mb-2">{t('gps.sessionMatrixHint')}</p>
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">{t('common.guard')}</th>
                      {sessionColumns.map(name => <th key={name} className="px-2 py-2 text-center font-medium text-gray-500 uppercase whitespace-nowrap">{name}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sessionGuards.map(guard => (
                      <tr key={guard}>
                        <td className="px-3 py-2 font-semibold whitespace-nowrap sticky left-0 bg-white">{guard}</td>
                        {sessionColumns.map(name => {
                          const rec = sessionCell(guard, name)
                          return (
                            <td key={name} className="px-2 py-2 text-center">
                              {rec ? (
                                <div className="flex flex-col items-center gap-0.5">
                                  <img src={`/api/security/photo/${rec.photo_drive_id}`} className="w-10 h-10 rounded object-cover cursor-zoom-in" onClick={() => openMatrixZoom(rec)} />
                                  <span className="text-[10px] text-gray-400">{new Date(rec.clocked_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>)}
          </div>
        )}

        {historySections.map(s => s.rows.length > 0 && (
          <div key={s.title} className="mb-6 last:mb-0" data-audit-card>
            {renderSectionToggle(s.title, s.title)}
            {expanded[s.title] && <div className="overflow-x-auto border rounded-lg">{renderTable(s)}</div>}
          </div>
        ))}

        {!loading && historySections.every(s => s.rows.length === 0) && photoEntries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">{t('audit.noRecordsForDate')}</p>
        )}
      </div>

      {entryDetail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{entryDetail.person_name}</h2>
              <button onClick={() => setEntryDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex gap-4 flex-wrap mb-4">
              {entryDetail.photo_drive_id && (
                <img
                  src={`/api/security/photo/${entryDetail.photo_drive_id}`}
                  className="w-28 h-28 rounded-xl object-cover border flex-shrink-0 cursor-zoom-in"
                  onClick={() => openEntryZoom(entryDetail)}
                />
              )}
              <div className="flex-1 min-w-[160px] text-sm">
                <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold uppercase rounded-full px-2.5 py-1 mb-2">{t(`category.${entryDetail.category}`)}</span>
                <div className="space-y-1">
                  <div><strong>{t('common.company')}:</strong> {entryDetail.company || '-'}</div>
                  <div><strong>{t('audit.detail.vehicle')}:</strong> {entryDetail.vehicle_no || '-'}</div>
                  <div><strong>{t('audit.detail.badge')}:</strong> {entryDetail.badge_no || '-'}</div>
                  <div><strong>{t('audit.detail.refDo')}:</strong> {entryDetail.reference_no || '-'}</div>
                  <div><strong>{t('audit.detail.in')}:</strong> {new Date(entryDetail.time_in).toLocaleString()}</div>
                  <div><strong>{t('audit.detail.out')}:</strong> {entryDetail.time_out ? new Date(entryDetail.time_out).toLocaleString() : '-'}</div>
                </div>
              </div>
            </div>
            {entryDetail.purpose && <div className="text-sm mb-2"><strong>{t('audit.detail.purpose')}:</strong> {entryDetail.purpose}</div>}
            {entryDetail.looking_for && <div className="text-sm mb-2"><strong>{t('audit.detail.lookingFor')}:</strong> {entryDetail.looking_for}</div>}
            {entryDetail.notes && <div className="text-sm bg-gray-50 border rounded-lg px-3 py-2 mb-3"><strong>{t('audit.detail.notes')}:</strong> {entryDetail.notes}</div>}
            <div className="text-xs text-gray-400 pt-2 border-t">{t('audit.detail.attendedBy')}: {entryDetail.created_by || '-'}</div>
          </div>
        </div>
      )}

      <PhotoLightbox
        src={zoomSrc}
        onClose={() => { setZoomSrc(null); setZoomIndex(null); setZoomList(null) }}
        onPrev={zoomIndex !== null && zoomIndex > 0 ? () => stepZoom(-1) : undefined}
        onNext={zoomIndex !== null && zoomList && zoomIndex < (zoomList === 'matrix' ? sessionPhotoList.length : photoEntries.length) - 1 ? () => stepZoom(1) : undefined}
        caption={zoomIndex !== null && zoomList === 'matrix' && sessionPhotoList[zoomIndex] ? (() => {
          const rec = sessionPhotoList[zoomIndex]
          return (
            <>
              <div className="font-semibold">{rec.guard_name} — {rec.checkpoint_name}</div>
              <div className="text-white/70">
                {new Date(rec.clocked_at).toLocaleString()} · {rec.distance_meters}m{rec.remark ? ` · ${rec.remark}` : ''}
              </div>
              <div className="text-white/50 text-xs mt-1">{zoomIndex + 1} / {sessionPhotoList.length}</div>
            </>
          )
        })() : zoomIndex !== null && zoomList === 'entries' && photoEntries[zoomIndex] ? (() => {
          const entry = photoEntries[zoomIndex]
          return (
            <>
              <div className="font-semibold">{entry.person_name}{entry.company ? ` — ${entry.company}` : ''}</div>
              <div className="text-white/70">
                {t(`category.${entry.category}`)} · {new Date(entry.time_in).toLocaleString()}
                {entry.time_out ? ` → ${new Date(entry.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
              <div className="text-white/50 text-xs mt-1">{zoomIndex + 1} / {photoEntries.length}</div>
            </>
          )
        })() : undefined}
      />
    </div>
  )
}
