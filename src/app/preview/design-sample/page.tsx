'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Building2,
  Factory,
  Layers,
  Users,
  ShieldCheck,
  Wrench,
  ClipboardCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Palette,
  SlidersHorizontal,
  ChevronRight,
  LayoutGrid,
  Sparkles,
  BarChart3,
  Calendar,
  Search,
  Bell,
  ChevronDown,
  ListTodo,
  Target,
  Flag,
  RotateCcw,
  Boxes,
  Truck,
  HardHat,
  Zap,
  Volume2,
  VolumeX,
  Crown,
  Check,
} from 'lucide-react'
import {
  SUPERHEROES,
  type Superhero,
  getRandomSuperhero,
  playHeroFanfare,
  SuperheroAnnouncementToast,
} from '@/components/SuperheroCheckin'

// KOMT Corporate Brand Design Tokens (Extracted directly from komt.com.my)
const KOMT = {
  primary: '#1A4377',       // KOMT Corporate Navy Blue
  primaryDark: '#123055',   // Deep Blue for active states & heavy contrast
  primaryLight: '#EBF2FA',  // Soft Navy tint for badges & card highlights
  teal: '#5CA599',          // KOMT Industrial Teal / Sea-Green
  tealDark: '#447C73',      // Dark teal for text on light teal
  tealLight: '#EDF6F5',     // Light teal surface tint
  accent: '#E05238',        // KOMT Safety Red / Orange Accent
  accentLight: '#FDF2E9',   // Warm safety tint
  charcoal: '#262B33',      // Deep steel charcoal headings
  textBody: '#58595B',      // Refined dark neutral body
  textMuted: '#7A7A7A',     // Secondary metadata
  border: '#E2E8F0',        // Subtle crisp border
  surfaceBg: '#F8FAFC',     // Clean precast factory background
  cardBg: '#FFFFFF',        // Pure white card surfaces
}

type SamplePage = 'superhero-demo' | 'command-centre' | 'bplant-ops' | 'direct-reports' | 'design-system'
type ThemeMode = 'komt' | 'original'

export default function DesignSamplePage() {
  const [activePage, setActivePage] = useState<SamplePage>('superhero-demo')
  const [themeMode, setThemeMode] = useState<ThemeMode>('komt')
  const [activeTabReports, setActiveTabReports] = useState<'todos' | 'goals' | 'milestones'>('todos')
  const [reportStatusFilter, setReportStatusFilter] = useState<'open' | 'done' | 'all'>('open')

  // Superhero Demo State
  const [heroAttendance, setHeroAttendance] = useState<Record<string, boolean>>({
    'user-1': false,
    'user-2': false,
    'user-3': false,
    'user-4': false,
    'user-5': false,
    'user-6': false,
  })
  const [assignedHeroes, setAssignedHeroes] = useState<Record<string, Superhero>>({})
  const [activeHeroToast, setActiveHeroToast] = useState<{ hero: Superhero; personName: string } | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const DEMO_ATTENDEES = [
    { id: 'user-1', name: 'David Then', role: 'Executive Director (Host)', avatar: 'DT' },
    { id: 'user-2', name: 'Ahmad Khairul', role: 'Head of Precast Batching', avatar: 'AK' },
    { id: 'user-3', name: 'Siti Aminah', role: 'Senior QA / Materials Lab', avatar: 'SA' },
    { id: 'user-4', name: 'Tan Wei Ming', role: 'Rebar Fabrication Lead', avatar: 'TW' },
    { id: 'user-5', name: 'Michael Wong', role: 'Plant Maintenance & Cranes', avatar: 'MW' },
    { id: 'user-6', name: 'Rajesh Kumar', role: 'Security & Logistics', avatar: 'RK' },
  ]

  function handleCheckInClick(id: string, name: string) {
    const isCurrentlyHere = heroAttendance[id]
    if (!isCurrentlyHere) {
      // Checking in! Random Superhero Ready-In Effect!
      const hero = getRandomSuperhero()
      setAssignedHeroes(prev => ({ ...prev, [id]: hero }))
      setHeroAttendance(prev => ({ ...prev, [id]: true }))
      setActiveHeroToast({ hero, personName: name })
      if (soundEnabled) {
        playHeroFanfare()
      }
    } else {
      // Unchecking (toggle out)
      setHeroAttendance(prev => ({ ...prev, [id]: false }))
    }
  }

  function handleAssembleAll() {
    const newAssigned: Record<string, Superhero> = { ...assignedHeroes }
    const newAttendance: Record<string, boolean> = {}
    DEMO_ATTENDEES.forEach(p => {
      newAttendance[p.id] = true
      if (!newAssigned[p.id]) {
        newAssigned[p.id] = getRandomSuperhero()
      }
    })
    setAssignedHeroes(newAssigned)
    setHeroAttendance(newAttendance)
    const randomPicked = newAssigned[DEMO_ATTENDEES[0].id] || getRandomSuperhero()
    setActiveHeroToast({ hero: randomPicked, personName: 'ALL ATTENDEES' })
    if (soundEnabled) {
      playHeroFanfare()
    }
  }

  function handleResetDemo() {
    setHeroAttendance({
      'user-1': false,
      'user-2': false,
      'user-3': false,
      'user-4': false,
      'user-5': false,
      'user-6': false,
    })
  }

  const isKomt = themeMode === 'komt'

  return (
    <div className={`min-h-screen ${isKomt ? 'bg-[#F8FAFC] text-[#58595B]' : 'bg-gray-50 text-gray-700'}`}>
      {/* Google Font Darker Grotesque stylesheet */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Darker+Grotesque:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap"
      />

      {/* TOP CONTROLLER & THEME SWITCHER BAR (Sticky) */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Preview Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shadow-xs"
                style={{ background: isKomt ? KOMT.primary : '#2563EB' }}
              >
                KOMT
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                    RebarPro × KOMT Design System Preview
                  </h1>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    Safe Preview (No Impact on Live App)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Inspired by <a href="https://komt.com.my" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">komt.com.my <ExternalLink className="w-2.5 h-2.5" /></a>
                </p>
              </div>
            </div>
          </div>

          {/* Sample Page Selector Tabs */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg text-xs font-semibold gap-1">
            <button
              onClick={() => setActivePage('superhero-demo')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activePage === 'superhero-demo'
                  ? 'bg-amber-500 text-white shadow-xs font-extrabold'
                  : 'text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold border border-amber-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
              <span>🦸 Superhero Check-in Demo</span>
            </button>
            <button
              onClick={() => setActivePage('command-centre')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activePage === 'command-centre'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Command Centre
            </button>
            <button
              onClick={() => setActivePage('bplant-ops')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activePage === 'bplant-ops'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. BPlant Production
            </button>
            <button
              onClick={() => setActivePage('direct-reports')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activePage === 'direct-reports'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              3. Direct Reports
            </button>
            <button
              onClick={() => setActivePage('design-system')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activePage === 'design-system'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Palette className="w-3 h-3 inline mr-1 text-emerald-600" />
              Brand Tokens
            </button>
          </div>

          {/* Theme Mode Toggle (KOMT Theme vs Original Blue) & Back button */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium border border-slate-200">
              <button
                onClick={() => setThemeMode('komt')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  isKomt
                    ? 'bg-[#1A4377] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-[#5CA599]" />
                KOMT Theme
              </button>
              <button
                onClick={() => setThemeMode('original')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  !isKomt
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-300" />
                Original Blue
              </button>
            </div>

            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              ← Back to App
            </Link>
          </div>
        </div>
      </div>

      {/* SUB-BANNER WITH BRAND SPECS HIGHLIGHT */}
      <div
        className="px-4 py-2 border-b text-xs transition-colors"
        style={{
          background: isKomt ? KOMT.tealLight : '#EFF6FF',
          borderColor: isKomt ? '#D2ECE7' : '#DBEAFE',
          color: isKomt ? KOMT.tealDark : '#1E40AF',
        }}
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold">Active Theme:</span>
            {isKomt ? (
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: KOMT.primary }} />
                KOMT Maritime Navy (<code>#1A4377</code>) +
                <span className="w-2.5 h-2.5 rounded-full inline-block ml-1" style={{ background: KOMT.teal }} />
                Industrial Teal (<code>#5CA599</code>) +
                <span className="w-2.5 h-2.5 rounded-full inline-block ml-1" style={{ background: KOMT.accent }} />
                Safety Coral (<code>#E05238</code>)
              </span>
            ) : (
              <span className="font-semibold text-blue-700">Generic Tailwind Indigo / Standard Blue (#2563EB)</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            Tip: Click the top tabs (1, 2, 3) to preview different pages; toggle "KOMT Theme" to see the direct contrast.
          </div>
        </div>
      </div>

      {/* MAIN SAMPLE CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">

        {/* Superhero Announcement Toast Pop-up */}
        {activeHeroToast && (
          <SuperheroAnnouncementToast
            hero={activeHeroToast.hero}
            personName={activeHeroToast.personName}
            onClose={() => setActiveHeroToast(null)}
          />
        )}

        {/* ========================================================================= */}
        {/* SUPERHERO CHECK-IN DEMO (会议签到“随机超级英雄” Ready-In 动效演示) */}
        {/* ========================================================================= */}
        {activePage === 'superhero-demo' && (
          <div className="space-y-6">
            {/* Superhero Banner Header */}
            <div
              className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg border-2"
              style={{
                background: isKomt
                  ? `linear-gradient(135deg, ${KOMT.primary} 0%, #173258 50%, #0d1e35 100%)`
                  : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                borderColor: isKomt ? KOMT.teal : '#6366F1',
              }}
            >
              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 shadow-xs flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 fill-current" /> Interactive Feature Demo
                    </span>
                    <span className="text-xs text-white/80 font-medium">
                      Meeting Check-In Ready-In Effect
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
                    <span>🦸 Superhero Meeting Check-In Effect</span>
                  </h2>
                  <p className="text-sm text-white/80 mt-1 max-w-2xl leading-relaxed">
                    Click any attendee below to check them in! Each check-in triggers a <b>random superhero persona</b>, arcade audio fanfare, celebratory comic-burst toast, and persistent hero status badge.
                  </p>
                </div>

                {/* Sound & Controls Toolbar */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20 flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-white/80 font-medium">Audio Fanfare:</span>
                    <button
                      type="button"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        soundEnabled ? 'bg-amber-400 text-slate-900' : 'bg-white/20 text-white'
                      }`}
                    >
                      {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                      <span>{soundEnabled ? 'Sound ON' : 'Muted'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAssembleAll}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-xs transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <Zap className="w-3 h-3 fill-current" /> Assemble All!
                    </button>
                    <button
                      type="button"
                      onClick={handleResetDemo}
                      className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* Attendance & Assembled Hero Progress Bar */}
              <div className="mt-6 pt-5 border-t border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-black text-amber-300">
                    {Object.values(heroAttendance).filter(Boolean).length} / {DEMO_ATTENDEES.length}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white uppercase tracking-wider">
                      {Object.values(heroAttendance).filter(Boolean).length === DEMO_ATTENDEES.length
                        ? '🎉 ALL HEROES ASSEMBLED & READY TO ROLL!'
                        : 'Heroes Checked In & Armed for Meeting'}
                    </div>
                    <div className="text-[11px] text-white/70">
                      {DEMO_ATTENDEES.length - Object.values(heroAttendance).filter(Boolean).length} awaiting check-in
                    </div>
                  </div>
                </div>

                <div className="w-full sm:max-w-xs bg-black/30 rounded-full h-3 p-0.5 overflow-hidden border border-white/20">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-emerald-400 shadow-sm"
                    style={{
                      width: `${(Object.values(heroAttendance).filter(Boolean).length / DEMO_ATTENDEES.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* INTERACTIVE ATTENDEE TILES GRID */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" /> Meeting Attendees (Click a tile to check in)
                </h3>
                <span className="text-xs text-slate-500 italic">
                  Tip: Click again to uncheck, or tap to get a new random hero!
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {DEMO_ATTENDEES.map(p => {
                  const isHere = heroAttendance[p.id]
                  const hero = assignedHeroes[p.id]

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleCheckInClick(p.id, p.name)}
                      className={`group relative rounded-2xl p-4 flex flex-col items-center text-center select-none transition-all duration-200 active:scale-95 text-left w-full border-2 ${
                        isHere && hero
                          ? 'bg-white shadow-md border-emerald-400 ring-2 ring-emerald-400/20'
                          : 'border-dashed border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
                      }`}
                      style={{
                        borderColor: isHere && hero ? hero.color : undefined,
                      }}
                    >
                      {/* Avatar with Status badge */}
                      <div className="relative mb-2.5">
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black text-white shadow-sm transition-transform duration-200 group-hover:scale-105 ${
                            isHere ? 'ring-4 ring-offset-2' : 'grayscale opacity-75 group-hover:grayscale-0'
                          }`}
                          style={{
                            background: isHere && hero ? hero.color : (isKomt ? KOMT.primary : '#3B82F6'),
                            boxShadow: isHere && hero ? `0 4px 14px ${hero.color}66` : undefined,
                          }}
                        >
                          {isHere && hero ? hero.emoji : p.avatar}
                        </div>

                        {/* Checkmark overlay badge */}
                        <div
                          className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center transition-all ${
                            isHere
                              ? 'bg-emerald-600 text-white scale-100'
                              : 'bg-slate-200 text-transparent scale-90 group-hover:bg-blue-200 group-hover:text-blue-700'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>

                      {/* Person Name & Role */}
                      <div className="text-xs font-bold text-slate-900 leading-snug line-clamp-1 break-words">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-slate-500 line-clamp-1 mb-2">
                        {p.role}
                      </div>

                      {/* SUPERHERO BADGE (Displayed once checked in!) */}
                      {isHere && hero ? (
                        <div className="w-full mt-auto pt-2 border-t border-slate-100 flex flex-col items-center gap-1">
                          <span
                            className="w-full text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white text-center shadow-2xs truncate"
                            style={{ background: hero.color }}
                            title={hero.heroName}
                          >
                            {hero.emoji} {hero.heroName}
                          </span>
                          <span
                            className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded"
                            style={{ background: `${hero.accentColor}22`, color: hero.color }}
                          >
                            READY!
                          </span>
                        </div>
                      ) : (
                        <div className="w-full mt-auto pt-2 border-t border-dashed border-slate-200 text-[11px] font-medium text-slate-400 group-hover:text-blue-600 flex items-center justify-center gap-1">
                          <Zap className="w-3 h-3" /> Tap to Check In
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* SUPERHERO ROSTER GALLERY (Preview All 12 Heroes) */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                    12
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Superhero Persona Roster Gallery
                    </h3>
                    <p className="text-xs text-slate-500">
                      Click any hero below to preview their sound fanfare, quote, and comic blast!
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-500">RebarPro Precast Universe</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {SUPERHEROES.map(h => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setActiveHeroToast({ hero: h, personName: 'HERO PREVIEW' })
                      if (soundEnabled) playHeroFanfare()
                    }}
                    className="p-3 rounded-lg border border-slate-200 text-left hover:border-amber-400 hover:shadow-xs transition-all flex items-start gap-3 bg-slate-50/40 hover:bg-white"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-2xs"
                      style={{ background: `${h.color}15`, border: `1px solid ${h.color}44` }}
                    >
                      {h.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-slate-900 leading-snug flex items-center gap-1">
                        <span className="truncate">{h.heroName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{h.title}</div>
                      <div className="text-[10px] font-semibold mt-1" style={{ color: h.color }}>
                        {h.comicBurst}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 1: EXECUTIVE COMMAND CENTRE & APP LAUNCHER (企业指挥舱 / 个人统一工作台) */}
        {/* ========================================================================= */}
        {activePage === 'command-centre' && (
          <div className="space-y-6">
            {/* Header Hero Section */}
            <div
              className="rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-md transition-all"
              style={{
                background: isKomt
                  ? `linear-gradient(135deg, ${KOMT.primary} 0%, #153760 65%, #0e2440 100%)`
                  : 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
              }}
            >
              {/* Decorative Subtle Grid / Precast Mesh Line */}
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />

              <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-md"
                      style={{
                        background: isKomt ? `${KOMT.teal}33` : 'rgba(255,255,255,0.2)',
                        color: isKomt ? '#9BE2D7' : '#FFFFFF',
                        border: isKomt ? `1px solid ${KOMT.teal}66` : 'none',
                      }}
                    >
                      KOM Technologies (M) Sdn. Bhd.
                    </span>
                    <span className="text-xs text-white/70">
                      Plant: Simpang Renggam, Johor
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    RebarPro Command Centre
                  </h2>
                  <p className="text-sm text-white/80 mt-1 max-w-xl">
                    Executive Operations & Production Cockpit — Unified control for Precast Concrete, Rebar Fabrication, Mould Logistics, and Operational Alignment.
                  </p>
                </div>

                {/* Director Profile / Shift Widget */}
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/15 flex items-center gap-3.5 min-w-[260px]">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-sm shrink-0"
                    style={{ background: isKomt ? KOMT.teal : '#3B82F6' }}
                  >
                    DT
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">David Then</div>
                    <div className="text-xs text-white/75 truncate">Executive Director</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[11px] text-white/90 font-medium">Day Shift Active</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Key Performance Metrics Ticker */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-white/15">
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-xs text-white/70">Today&apos;s Concrete Output</div>
                  <div className="text-2xl font-bold mt-0.5 tracking-tight">
                    428.5 <span className="text-xs font-normal text-white/70">Tons</span>
                  </div>
                  <div className="text-[11px] text-emerald-300 flex items-center gap-1 mt-1 font-medium">
                    <TrendingUp className="w-3 h-3" /> +12% vs target
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-xs text-white/70">Tunnel Segments Cast</div>
                  <div className="text-2xl font-bold mt-0.5 tracking-tight">
                    64 <span className="text-xs font-normal text-white/70">Rings</span>
                  </div>
                  <div className="text-[11px] text-emerald-300 flex items-center gap-1 mt-1 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> 100% QA Passed
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-xs text-white/70">Safety Zero-Harm Streak</div>
                  <div className="text-2xl font-bold mt-0.5 tracking-tight">
                    412 <span className="text-xs font-normal text-white/70">Days</span>
                  </div>
                  <div className="text-[11px] text-amber-200 flex items-center gap-1 mt-1 font-medium">
                    <ShieldCheck className="w-3 h-3" /> Zero lost time incidents
                  </div>
                </div>

                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-xs text-white/70">On-Time Dispatch</div>
                  <div className="text-2xl font-bold mt-0.5 tracking-tight">
                    98.4%
                  </div>
                  <div className="text-[11px] text-white/80 flex items-center gap-1 mt-1 font-medium">
                    <Truck className="w-3 h-3" /> 18 trailers dispatched
                  </div>
                </div>
              </div>
            </div>

            {/* Department Modules Launcher Grid (Clean Industrial Style) */}
            <div>
              <div className="flex items-center justify-between mb-3.5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <LayoutGrid
                      className="w-5 h-5"
                      style={{ color: isKomt ? KOMT.primary : '#2563EB' }}
                    />
                    Department & Module Operations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Direct access to specialized production, plant management, safety, and governance systems.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
                  8 Modules Active
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    title: 'BPlant (Batching Plant)',
                    desc: 'Concrete mix batching, slump checks, pouring cycles & silo inventories.',
                    icon: Factory,
                    tag: 'Precast C50/60',
                    color: isKomt ? KOMT.primary : '#2563EB',
                    badgeBg: isKomt ? KOMT.primaryLight : '#EFF6FF',
                    stats: '4 lines active',
                  },
                  {
                    title: 'Rebar Fabrication',
                    desc: 'Bar bending, mesh cutting schedules, scrap optimization & bar-lists.',
                    icon: Boxes,
                    tag: 'High-Tensile Steel',
                    color: isKomt ? KOMT.teal : '#0D9488',
                    badgeBg: isKomt ? KOMT.tealLight : '#F0FDFA',
                    stats: '142 tons queued',
                  },
                  {
                    title: 'Mould & Formwork',
                    desc: 'PPVC, Segmental Box Girder, and tunnel ring mould maintenance & assembly.',
                    icon: Layers,
                    tag: 'Precast Formwork',
                    color: isKomt ? KOMT.primary : '#3B82F6',
                    badgeBg: isKomt ? KOMT.primaryLight : '#EFF6FF',
                    stats: '36 moulds active',
                  },
                  {
                    title: 'QA / QC Inspections',
                    desc: 'Compressive cube tests, curing records, dimensional tolerances & non-conformance.',
                    icon: ClipboardCheck,
                    tag: 'ISO 9001 / BCA',
                    color: isKomt ? KOMT.teal : '#10B981',
                    badgeBg: isKomt ? KOMT.tealLight : '#ECFDF5',
                    stats: '99.2% pass rate',
                  },
                  {
                    title: 'Plant Maintenance',
                    desc: 'Batching tower hydraulics, overhead crane inspections, preventive work orders.',
                    icon: Wrench,
                    tag: 'Equipment Health',
                    color: isKomt ? KOMT.accent : '#F59E0B',
                    badgeBg: isKomt ? KOMT.accentLight : '#FEF3C7',
                    stats: '2 tasks pending',
                  },
                  {
                    title: 'Security & Logistics',
                    desc: 'Trailer weighbridge, driver gate check-in, trailer dispatch permits & escort.',
                    icon: ShieldCheck,
                    tag: 'Access & Weighbridge',
                    color: isKomt ? KOMT.primary : '#4F46E5',
                    badgeBg: isKomt ? KOMT.primaryLight : '#EEF2FF',
                    stats: 'All gates secure',
                  },
                  {
                    title: 'Strategic Meetings',
                    desc: 'Weekly Level 10 alignments, KPIs, quarterly priorities, and direct report 1-on-1s.',
                    icon: Users,
                    tag: 'Leadership Alignment',
                    color: isKomt ? KOMT.teal : '#059669',
                    badgeBg: isKomt ? KOMT.tealLight : '#ECFDF5',
                    stats: '3 meetings scheduled',
                  },
                  {
                    title: 'Project Engineering',
                    desc: 'RTS Link, Jurong Region Line, and HDB prefabricated element deliverables.',
                    icon: Building2,
                    tag: 'Contract Deliveries',
                    color: isKomt ? KOMT.primary : '#2563EB',
                    badgeBg: isKomt ? KOMT.primaryLight : '#EFF6FF',
                    stats: '6 active contracts',
                  },
                ].map((mod, i) => {
                  const Icon = mod.icon
                  return (
                    <div
                      key={i}
                      className="group bg-white rounded-xl p-4 border border-slate-200 shadow-2xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
                      style={{
                        borderTop: isKomt ? `3px solid ${mod.color}` : undefined,
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center"
                            style={{ background: mod.badgeBg, color: mod.color }}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{ background: mod.badgeBg, color: mod.color }}
                          >
                            {mod.tag}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {mod.title}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {mod.desc}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">{mod.stats}</span>
                        <span
                          className="font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform"
                          style={{ color: mod.color }}
                        >
                          Launch <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Urgent Action Items Feed */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: isKomt ? KOMT.accentLight : '#FEF2F2', color: isKomt ? KOMT.accent : '#DC2626' }}
                  >
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Priority Action Items Requiring Attention</h4>
                    <p className="text-xs text-slate-500">Live operational alerts filtered for Executive Management.</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-500">Updated 2 mins ago</span>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    type: 'Safety & Maintenance',
                    title: 'Crane Bay 3 Hoist Periodic Load Test Certification Due in 48 Hours',
                    time: 'Simpang Renggam Bay 3',
                    severity: 'High',
                    tagColor: isKomt ? KOMT.accent : '#DC2626',
                    bgColor: isKomt ? KOMT.accentLight : '#FEF2F2',
                  },
                  {
                    type: 'Concrete Quality',
                    title: 'Tunnel Segment Ring Batch #442: 28-Day Strength Test Ready for Verification (Target: 60 MPa)',
                    time: 'QA Laboratory',
                    severity: 'Ready',
                    tagColor: isKomt ? KOMT.teal : '#059669',
                    bgColor: isKomt ? KOMT.tealLight : '#ECFDF5',
                  },
                  {
                    type: 'Logistics',
                    title: 'Cross-Border Trailer Convoy SG-Customs Clearance Approved for RTS Link Beam Elements',
                    time: 'Dispatched 08:30 AM',
                    severity: 'On Track',
                    tagColor: isKomt ? KOMT.primary : '#2563EB',
                    bgColor: isKomt ? KOMT.primaryLight : '#EFF6FF',
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-slate-200 flex items-start justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 mt-0.5"
                        style={{ background: item.bgColor, color: item.tagColor }}
                      >
                        {item.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 break-words">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" /> {item.time}
                        </p>
                      </div>
                    </div>
                    <button
                      className="px-3 py-1 rounded-md text-xs font-semibold shrink-0 text-white shadow-2xs transition-all hover:opacity-95"
                      style={{ background: isKomt ? KOMT.primary : '#2563EB' }}
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 2: BPLANT & REBAR OPERATIONS MONITORING (工厂运作与生产监控) */}
        {/* ========================================================================= */}
        {activePage === 'bplant-ops' && (
          <div className="space-y-6">
            {/* Plant Header */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                  style={{ background: isKomt ? KOMT.primary : '#2563EB' }}
                >
                  <Factory className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">BPlant & Precast Production Floor</h2>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: isKomt ? KOMT.tealLight : '#ECFDF5', color: isKomt ? KOMT.tealDark : '#059669' }}
                    >
                      Batching Plant 1 & 2 Online
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Real-time pouring schedule, concrete temperature control, curing chamber metrics, and raw aggregate silos.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-2xs flex items-center gap-1.5"
                  style={{ background: isKomt ? KOMT.teal : '#0D9488' }}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" /> Start New Batch
                </button>
                <button className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                  Export Log
                </button>
              </div>
            </div>

            {/* Production Lines Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  line: 'Line A · Tunnel Segments',
                  project: 'Underground Metro MRT Contract',
                  concreteGrade: 'C50/60 Low Heat',
                  progress: 85,
                  poured: '48 / 56 m³',
                  slump: '160 mm (Optimal)',
                  status: 'Pouring in Progress',
                  statusColor: isKomt ? KOMT.primary : '#2563EB',
                  statusBg: isKomt ? KOMT.primaryLight : '#EFF6FF',
                },
                {
                  line: 'Line B · PPVC Volumetric Units',
                  project: 'Tengah HDB Housing Estate',
                  concreteGrade: 'C40/50 Self-Compacting',
                  progress: 60,
                  poured: '32 / 50 m³',
                  slump: '650 mm Spread',
                  status: 'Curing Steam Cycle',
                  statusColor: isKomt ? KOMT.teal : '#059669',
                  statusBg: isKomt ? KOMT.tealLight : '#ECFDF5',
                },
                {
                  line: 'Line C · Segmental Box Girders',
                  project: 'Highway Viaduct Package 2',
                  concreteGrade: 'C60/75 High Strength',
                  progress: 100,
                  poured: '64 / 64 m³ (Complete)',
                  slump: 'Passed Inspection',
                  status: 'Ready for De-moulding',
                  statusColor: isKomt ? '#059669' : '#059669',
                  statusBg: '#ECFDF5',
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-xl p-4.5 border border-slate-200 shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-sm text-slate-900">{item.line}</span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: item.statusBg, color: item.statusColor }}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mb-3">{item.project}</div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Concrete Spec:</span>
                        <span className="font-semibold text-slate-800">{item.concreteGrade}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Slump / Flow:</span>
                        <span className="font-semibold text-slate-800">{item.slump}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Volume Poured:</span>
                        <span className="font-semibold text-slate-800">{item.poured}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-600">Batch Progress</span>
                      <span style={{ color: item.statusColor }}>{item.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${item.progress}%`,
                          background: item.progress === 100
                            ? (isKomt ? KOMT.teal : '#059669')
                            : (isKomt ? KOMT.primary : '#2563EB'),
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Live Raw Materials Silo Levels */}
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Boxes className="w-4 h-4" style={{ color: isKomt ? KOMT.primary : '#2563EB' }} />
                Raw Material Silo Inventory & Aggregate Bins
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Automated continuous radar level sensors at Simpang Renggam Batching Tower.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { name: 'OPC Cement Silo 1', capacity: '180 Tons', level: 78, status: 'Healthy' },
                  { name: 'GGBS Slag Silo 2', capacity: '120 Tons', level: 64, status: 'Healthy' },
                  { name: 'Washed River Sand', capacity: '350 Tons', level: 42, status: 'Re-order Triggered' },
                  { name: '20mm Granite Aggregate', capacity: '400 Tons', level: 86, status: 'Healthy' },
                ].map((silo, idx) => (
                  <div key={idx} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/40">
                    <div className="text-xs font-bold text-slate-800 mb-1">{silo.name}</div>
                    <div className="text-xl font-bold tracking-tight text-slate-900">{silo.level}%</div>
                    <div className="text-[11px] text-slate-500 mb-2">Cap: {silo.capacity}</div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${silo.level}%`,
                          background: silo.level < 50
                            ? (isKomt ? KOMT.accent : '#EF4444')
                            : (isKomt ? KOMT.teal : '#0D9488'),
                        }}
                      />
                    </div>
                    <div className="text-[10px] font-semibold mt-1.5" style={{
                      color: silo.level < 50 ? (isKomt ? KOMT.accent : '#DC2626') : (isKomt ? KOMT.tealDark : '#059669')
                    }}>
                      {silo.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 3: STRATEGIC MEETINGS & DIRECT REPORTS (高管会议与直属下属看板) */}
        {/* ========================================================================= */}
        {activePage === 'direct-reports' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-6 h-6" style={{ color: isKomt ? KOMT.primary : '#2563EB' }} />
                  Direct Reports & Accountability
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Reskinned with KOMT brand visual tokens — spacious card layout with non-truncated tasks, priorities, and completed milestones.
                </p>
              </div>

              <button
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-white shadow-xs flex items-center gap-1.5"
                style={{ background: isKomt ? KOMT.primary : '#2563EB' }}
              >
                <Calendar className="w-4 h-4" /> Schedule Quarterly Alignment
              </button>
            </div>

            {/* Direct Report Sample Card (e.g. Production Manager) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              {/* Header inside Card */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div className="flex items-center gap-4">
                  {/* Initials Tile with KOMT Teal / Navy Accent */}
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-extrabold text-white shadow-xs"
                    style={{ background: isKomt ? KOMT.primary : '#3B82F6' }}
                  >
                    AK
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Ahmad Khairul</h3>
                    <div className="text-xs text-slate-600 font-medium">Head of Precast Production & Batching</div>
                    <div className="text-[11px] text-slate-400">Reports to: David Then (Executive Director)</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold px-3 py-1 rounded-full border"
                    style={{
                      background: isKomt ? KOMT.tealLight : '#ECFDF5',
                      color: isKomt ? KOMT.tealDark : '#059669',
                      borderColor: isKomt ? '#BFE2DC' : '#A7F3D0',
                    }}
                  >
                    Quarterly Alignment: Scheduled (Nov 12)
                  </span>
                </div>
              </div>

              {/* Items Section Toolbar (Redesigned with KOMT Palette) */}
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  {/* Tab Selector Buttons */}
                  <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg text-xs font-semibold gap-1">
                    <button
                      onClick={() => setActiveTabReports('todos')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                        activeTabReports === 'todos'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <ListTodo
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: isKomt ? KOMT.teal : '#10B981' }}
                      />
                      <span>To-dos</span>
                      <span
                        className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{
                          background: isKomt ? KOMT.tealLight : '#D1FAE5',
                          color: isKomt ? KOMT.tealDark : '#065F46',
                        }}
                      >
                        {reportStatusFilter === 'open' ? 3 : reportStatusFilter === 'done' ? 4 : 7}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveTabReports('goals')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                        activeTabReports === 'goals'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Target
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: isKomt ? KOMT.primary : '#2563EB' }}
                      />
                      <span>Quarter Priorities</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                        {reportStatusFilter === 'open' ? 2 : reportStatusFilter === 'done' ? 1 : 3}
                      </span>
                    </button>

                    <button
                      onClick={() => setActiveTabReports('milestones')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                        activeTabReports === 'milestones'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Flag
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: isKomt ? KOMT.accent : '#F59E0B' }}
                      />
                      <span>Milestones</span>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                        {reportStatusFilter === 'open' ? 4 : reportStatusFilter === 'done' ? 5 : 9}
                      </span>
                    </button>
                  </div>

                  {/* Status Segment Filter: Open · Completed · All */}
                  <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium">
                    <button
                      onClick={() => setReportStatusFilter('open')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        reportStatusFilter === 'open'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Open Only
                    </button>
                    <button
                      onClick={() => setReportStatusFilter('done')}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-all ${
                        reportStatusFilter === 'done'
                          ? 'text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      style={{
                        background: reportStatusFilter === 'done' ? (isKomt ? KOMT.teal : '#059669') : undefined,
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Completed
                    </button>
                    <button
                      onClick={() => setReportStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        reportStatusFilter === 'all'
                          ? 'bg-white text-slate-900 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* To-dos List Sample (Spacious, No Truncation) */}
                {activeTabReports === 'todos' && (
                  <div className="space-y-2.5">
                    {[
                      {
                        title: 'Verify silica fume dosage calibration on automated chemical admixture dispenser (Line 1)',
                        due: '2026-10-30',
                        done: false,
                        overdue: false,
                        dueToday: true,
                      },
                      {
                        title: 'Review Simpang Renggam night curing moisture log following ambient humidity drop',
                        due: '2026-10-28',
                        done: false,
                        overdue: true,
                        dueToday: false,
                      },
                      {
                        title: 'Confirm rebar cage delivery schedule with Johor warehouse for next week HDB PPVC modules',
                        due: '2026-11-03',
                        done: false,
                        overdue: false,
                        dueToday: false,
                      },
                      {
                        title: 'Conduct weekly precast segment dimensional tolerance audit with external testing authority',
                        due: '2026-10-24',
                        done: true,
                        doneAt: '2026-10-24',
                      },
                      {
                        title: 'Finalize concrete mix trial test report for RTS Link Pier Segments (BCA approval dossier)',
                        due: '2026-10-22',
                        done: true,
                        doneAt: '2026-10-22',
                      },
                    ]
                      .filter(t => (reportStatusFilter === 'open' ? !t.done : reportStatusFilter === 'done' ? t.done : true))
                      .map((t, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 transition-colors ${
                            t.done
                              ? (isKomt ? 'bg-[#5CA599]/5 border-[#5CA599]/30' : 'bg-emerald-50/30 border-emerald-200')
                              : t.overdue
                              ? (isKomt ? 'bg-[#E05238]/5 border-[#E05238]/30' : 'bg-rose-50/40 border-rose-200')
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            {t.done ? (
                              <CheckCircle2
                                className="w-4 h-4 mt-0.5 shrink-0"
                                style={{ color: isKomt ? KOMT.teal : '#059669' }}
                              />
                            ) : (
                              <div
                                className="w-4 h-4 rounded-full border-2 mt-0.5 shrink-0"
                                style={{ borderColor: isKomt ? KOMT.primary : '#94A3B8' }}
                              />
                            )}
                            <p
                              className={`text-sm font-medium break-words leading-relaxed ${
                                t.done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-800'
                              }`}
                            >
                              {t.title}
                            </p>
                          </div>

                          <div className="shrink-0 pt-0.5">
                            {t.done ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                style={{
                                  background: isKomt ? KOMT.tealLight : '#D1FAE5',
                                  color: isKomt ? KOMT.tealDark : '#065F46',
                                }}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Done {t.doneAt}
                              </span>
                            ) : t.overdue ? (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                                style={{
                                  background: isKomt ? KOMT.accentLight : '#FEE2E2',
                                  color: isKomt ? KOMT.accent : '#B91C1C',
                                  border: isKomt ? `1px solid ${KOMT.accent}33` : undefined,
                                }}
                              >
                                <AlertCircle className="w-3 h-3" /> Overdue: {t.due}
                              </span>
                            ) : t.dueToday ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3" /> Due Today
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                <Clock className="w-3 h-3 text-slate-400" /> {t.due}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Quarter Priorities Sample */}
                {activeTabReports === 'goals' && (
                  <div className="space-y-3">
                    {[
                      {
                        title: 'Achieve Zero Slag Segregation on C50 Self-Compacting Precast Mix Formulations',
                        status: 'On track',
                        progress: 75,
                        totalMs: 4,
                        doneMs: 3,
                        due: '2026-12-15',
                      },
                      {
                        title: 'Commission Automated Bar-Bender Line 4 and Train 8 CNC Steel Operators',
                        status: 'Off track',
                        progress: 40,
                        totalMs: 5,
                        doneMs: 2,
                        due: '2026-11-30',
                      },
                    ].map((g, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <Target
                              className="w-4 h-4 mt-0.5 shrink-0"
                              style={{ color: isKomt ? KOMT.primary : '#2563EB' }}
                            />
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 break-words leading-relaxed">
                                {g.title}
                              </h4>
                              <p className="text-xs text-slate-500 mt-0.5">Target Quarter Deadline: {g.due}</p>
                            </div>
                          </div>
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                            style={{
                              background: g.status === 'On track'
                                ? (isKomt ? KOMT.tealLight : '#ECFDF5')
                                : (isKomt ? KOMT.accentLight : '#FEF2F2'),
                              color: g.status === 'On track'
                                ? (isKomt ? KOMT.tealDark : '#059669')
                                : (isKomt ? KOMT.accent : '#DC2626'),
                            }}
                          >
                            {g.status}
                          </span>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100">
                          <div className="flex justify-between text-xs font-semibold mb-1 text-slate-600">
                            <span>Milestones Progress ({g.doneMs} of {g.totalMs} completed)</span>
                            <span style={{ color: isKomt ? KOMT.primary : '#2563EB' }}>{g.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${g.progress}%`,
                                background: isKomt ? KOMT.teal : '#2563EB',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Milestones Sample */}
                {activeTabReports === 'milestones' && (
                  <div className="space-y-2">
                    {[
                      {
                        title: 'Complete trial batch slump-flow test at 650mm with local sand gradings',
                        priority: 'Zero Slag Segregation',
                        done: true,
                      },
                      {
                        title: 'Secure formal approval from Resident Engineer for silica fume additive batch',
                        priority: 'Zero Slag Segregation',
                        done: false,
                      },
                      {
                        title: 'Install electrical power bus-duct for CNC Bar-Bender Line 4',
                        priority: 'Commission Automated Bar-Bender',
                        done: true,
                      },
                      {
                        title: 'Conduct safety lockout-tagout (LOTO) dry-run with plant maintenance lead',
                        priority: 'Commission Automated Bar-Bender',
                        done: false,
                      },
                    ].map((m, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-slate-200 bg-white flex items-start gap-2.5"
                      >
                        {m.done ? (
                          <CheckCircle2
                            className="w-4 h-4 mt-0.5 shrink-0"
                            style={{ color: isKomt ? KOMT.teal : '#059669' }}
                          />
                        ) : (
                          <Flag
                            className="w-4 h-4 mt-0.5 shrink-0"
                            style={{ color: isKomt ? KOMT.accent : '#F59E0B' }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${m.done ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                            {m.title}
                          </p>
                          <span
                            className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded"
                            style={{
                              background: isKomt ? KOMT.primaryLight : '#EFF6FF',
                              color: isKomt ? KOMT.primary : '#1E40AF',
                            }}
                          >
                            🎯 Priority: {m.priority}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAGE 4: DESIGN SYSTEM TOKENS & COMPONENT GUIDE (品牌色彩与组件规范) */}
        {/* ========================================================================= */}
        {activePage === 'design-system' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-2xs">
              <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Palette className="w-5 h-5 text-emerald-600" />
                KOM Technologies (M) Sdn. Bhd. Brand Palette
              </h2>
              <p className="text-xs text-slate-500 mb-6">
                Directly extracted from <code>komt.com.my</code> stylesheet & Elementor token definitions.
              </p>

              {/* Color Swatches Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  {
                    name: 'KOMT Corporate Navy',
                    role: 'Primary Brand Color',
                    hex: '#1A4377',
                    text: 'white',
                    usage: 'Primary buttons, active navbars, section headers, brand badges',
                  },
                  {
                    name: 'Industrial Teal',
                    role: 'Secondary Accent',
                    hex: '#5CA599',
                    text: 'white',
                    usage: 'Progress indicators, completion chips, secondary actions, KPIs',
                  },
                  {
                    name: 'Safety Coral / Orange',
                    role: 'Highlight / Alert',
                    hex: '#E05238',
                    text: 'white',
                    usage: 'Urgent notices, overdue warnings, maintenance alerts, safety tags',
                  },
                  {
                    name: 'Steel Charcoal',
                    role: 'Headings & Titles',
                    hex: '#262B33',
                    text: 'white',
                    usage: 'High-contrast typography, structural geometry, card headers',
                  },
                  {
                    name: 'Precast Slate Surface',
                    role: 'Background Canvas',
                    hex: '#F8FAFC',
                    text: 'black',
                    usage: 'Page background, container cards, table alternating rows',
                  },
                ].map((swatch, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 overflow-hidden shadow-2xs bg-white">
                    <div
                      className="h-24 p-3 flex flex-col justify-end"
                      style={{ background: swatch.hex, color: swatch.text }}
                    >
                      <span className="text-xs font-mono font-bold tracking-wider">{swatch.hex}</span>
                    </div>
                    <div className="p-3">
                      <div className="font-bold text-xs text-slate-900">{swatch.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium mb-1.5">{swatch.role}</div>
                      <p className="text-[10px] text-slate-400 leading-normal">{swatch.usage}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Typography & Buttons Guide */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Buttons Spec */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Interactive Buttons & Action Controls</h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-2xs transition-all hover:opacity-90"
                      style={{ background: isKomt ? KOMT.primary : '#2563EB' }}
                    >
                      Primary Action (#1A4377)
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-2xs transition-all hover:opacity-90"
                      style={{ background: isKomt ? KOMT.teal : '#0D9488' }}
                    >
                      Secondary Action (#5CA599)
                    </button>
                    <button
                      className="px-4 py-2 rounded-lg text-xs font-bold text-white shadow-2xs transition-all hover:opacity-90"
                      style={{ background: isKomt ? KOMT.accent : '#DC2626' }}
                    >
                      Safety Action (#E05238)
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                      Standard Outline
                    </button>
                    <button
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: isKomt ? KOMT.primaryLight : '#EFF6FF',
                        color: isKomt ? KOMT.primary : '#2563EB',
                      }}
                    >
                      Soft Navy Tint
                    </button>
                    <button
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        background: isKomt ? KOMT.tealLight : '#ECFDF5',
                        color: isKomt ? KOMT.tealDark : '#059669',
                      }}
                    >
                      Soft Teal Tint
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Chips Spec */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Industrial Status Badges & Pills</h3>
                <div className="flex flex-wrap gap-2.5">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                    style={{ background: isKomt ? KOMT.tealLight : '#ECFDF5', color: isKomt ? KOMT.tealDark : '#059669' }}
                  >
                    <CheckCircle2 className="w-3 h-3" /> QC Passed / Ready
                  </span>
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                    style={{ background: isKomt ? KOMT.primaryLight : '#EFF6FF', color: isKomt ? KOMT.primary : '#1E40AF' }}
                  >
                    <Clock className="w-3 h-3" /> Pouring in Progress
                  </span>
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1"
                    style={{ background: isKomt ? KOMT.accentLight : '#FEF2F2', color: isKomt ? KOMT.accent : '#DC2626' }}
                  >
                    <AlertCircle className="w-3 h-3" /> Safety Review Required
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Due Today
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
