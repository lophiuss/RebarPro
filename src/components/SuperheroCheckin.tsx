'use client'

import { useState, useEffect } from 'react'
import { Zap, Shield, Sparkles, Flame, Volume2, VolumeX, X, Trophy } from 'lucide-react'

export type Superhero = {
  id: string
  heroName: string
  title: string
  emoji: string
  color: string
  accentColor: string
  comicBurst: string
  superpower: string
  quote: string
}

export const SUPERHEROES: Superhero[] = [
  {
    id: 'iron-rebar',
    heroName: 'Iron Rebar',
    title: 'Billionaire Precast Genius',
    emoji: '🦾',
    color: '#E05238',
    accentColor: '#F59E0B',
    comicBurst: '⚡ CLANG! SYSTEM 100%!',
    superpower: 'Titanium Bending & Infinite Arc-Reactor Energy',
    quote: 'I am Iron Rebar. Ready to build the future.',
  },
  {
    id: 'captain-concrete',
    heroName: 'Captain Concrete',
    title: 'The First Precaster',
    emoji: '🛡️',
    color: '#1A4377',
    accentColor: '#3B82F6',
    comicBurst: '🛡️ WHAM! 60 MPa SHIELD!',
    superpower: 'Indestructible Quality & Zero Structural Creep',
    quote: 'I can do this all quarter. On target, on schedule.',
  },
  {
    id: 'thor-slump',
    heroName: 'Thor, God of High-Flow',
    title: 'Wielder of the Heavy Hammer',
    emoji: '⚡',
    color: '#6366F1',
    accentColor: '#FBBF24',
    comicBurst: '⚡ BOOM! LIGHTNING STRUCK!',
    superpower: 'Summons Perfect Slump & Zero Honeycombing',
    quote: 'By the Allfather, this meeting shall crush every KPI!',
  },
  {
    id: 'incredible-bulk',
    heroName: 'The Incredible Bulk',
    title: 'Supreme Tensile Champion',
    emoji: '🟢',
    color: '#059669',
    accentColor: '#34D399',
    comicBurst: '💥 SMASH! OBSTACLES CRUSHED!',
    superpower: 'Crushes Critical Bottlenecks With Raw Force',
    quote: 'BULK IS CHECKED IN! LET’S SOLVE EVERY ISSUE!',
  },
  {
    id: 'spider-caster',
    heroName: 'Spider-Caster',
    title: 'Your Friendly Precast Hero',
    emoji: '🕸️',
    color: '#DC2626',
    accentColor: '#2563EB',
    comicBurst: '🕸️ THWIP! CAGES TIED!',
    superpower: 'Rebar Tying at Mach 3 Reflex Speed',
    quote: 'With great precast power comes great dimensional accuracy.',
  },
  {
    id: 'the-flash-pourer',
    heroName: 'The Flash Pourer',
    title: 'The Fastest Builder Alive',
    emoji: '⚡',
    color: '#EA580C',
    accentColor: '#FBBF24',
    comicBurst: '💨 WHOOSH! ZERO DELAY!',
    superpower: 'Completes Weekly To-Dos at Light Speed',
    quote: 'Already finished before the check-in even ended!',
  },
  {
    id: 'dr-strange-mix',
    heroName: 'Doctor Strange-Mix',
    title: 'Master of Concrete Multiverse',
    emoji: '🔮',
    color: '#7C3AED',
    accentColor: '#10B981',
    comicBurst: '✨ SHAZAM! MULTIVERSE ALIGNED!',
    superpower: 'Manipulates Curing Time & Predicts Milestones',
    quote: 'I saw 14,000,605 timelines — we hit every target in this one.',
  },
  {
    id: 'black-panther-cage',
    heroName: 'Black Panther',
    title: 'King of Vibranium Cages',
    emoji: '🐾',
    color: '#1E1B4B',
    accentColor: '#C084FC',
    comicBurst: '⚡ ROAR! WAKANDA FOREVER!',
    superpower: 'Kinetic Absorption & Flawless Steel Fabrication',
    quote: 'Our engineering foundation will never yield.',
  },
  {
    id: 'dark-knight-qa',
    heroName: 'The Dark Knight of QA',
    title: 'Guardian of Zero Defects',
    emoji: '🦇',
    color: '#1E293B',
    accentColor: '#F59E0B',
    comicBurst: '🦇 SWOOSH! 100% INSPECTED!',
    superpower: 'Detective Vision for Micro-Tolerances',
    quote: 'I am vengeance. I am the night. I am checked in.',
  },
  {
    id: 'wonder-leader',
    heroName: 'Wonder Leader',
    title: 'Champion of Alignment',
    emoji: '⚔️',
    color: '#B91C1C',
    accentColor: '#F59E0B',
    comicBurst: '⚔️ CHING! LASSO OF TRUTH!',
    superpower: 'Dispels Ambiguity & Solves Issues in 5 Minutes',
    quote: 'Truth in meeting ratings. Courage in our execution.',
  },
  {
    id: 'hawkeye-sniper',
    heroName: 'Hawkeye Sniper',
    title: 'Master of Deadlines',
    emoji: '🎯',
    color: '#6D28D9',
    accentColor: '#F43F5E',
    comicBurst: '🎯 BULLSEYE! DEADLINE LOCKED!',
    superpower: '100% Accuracy on Milestone Completion',
    quote: 'I never miss a quarter deadline.',
  },
  {
    id: 'cyborg-rebar',
    heroName: 'Cyborg Rebar-AI',
    title: 'Next-Gen Cybernetic Operating System',
    emoji: '🦾',
    color: '#0284C7',
    accentColor: '#A5B4FC',
    comicBurst: '🤖 BEEP! ALL SENSORS ENGAGED!',
    superpower: 'Direct Neural Sync to RebarPro Cloud DB',
    quote: 'Booyah! All operational systems online and synchronized.',
  },
]

// Play a triumphant 8-bit / arcade fanfare using Web Audio API (zero external assets)
export function playHeroFanfare() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Triumphant Superhero chords: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz), E6 (1318Hz)
    const notes = [
      { freq: 523.25, time: 0.00, dur: 0.12 },
      { freq: 659.25, time: 0.08, dur: 0.12 },
      { freq: 783.99, time: 0.16, dur: 0.14 },
      { freq: 1046.50, time: 0.24, dur: 0.35 },
      { freq: 1318.51, time: 0.35, dur: 0.45 },
    ]

    notes.forEach(n => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(n.freq, now + n.time)

      gain.gain.setValueAtTime(0.001, now + n.time)
      gain.gain.linearRampToValueAtTime(0.2, now + n.time + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + n.time)
      osc.stop(now + n.time + n.dur + 0.05)
    })
  } catch {
    // Ignore audio errors if browser blocks autoplay before user gesture
  }
}

export function getRandomSuperhero(): Superhero {
  return SUPERHEROES[Math.floor(Math.random() * SUPERHEROES.length)]
}

// Superhero Check-in Announcement Banner / Pop-up
export function SuperheroAnnouncementToast({
  hero,
  personName,
  onClose,
}: {
  hero: Superhero
  personName: string
  onClose: () => void
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, 3800)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-auto animate-bounce-in">
      <div
        className="relative rounded-2xl p-4 sm:p-5 text-white shadow-2xl border-2 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${hero.color} 0%, #111827 100%)`,
          borderColor: hero.accentColor,
        }}
      >
        {/* Glow / comic burst background */}
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-30 blur-xl pointer-events-none"
          style={{ background: hero.accentColor }}
        />

        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-lg border-2 shrink-0 animate-pulse"
              style={{ background: hero.accentColor, borderColor: '#ffffff' }}
            >
              {hero.emoji}
            </div>
            <div>
              <div
                className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mb-1 shadow-xs"
                style={{ background: hero.accentColor, color: '#000000' }}
              >
                {hero.comicBurst}
              </div>
              <h3 className="text-lg font-black tracking-tight text-white leading-tight">
                {personName} IS READY!
              </h3>
              <p className="text-xs font-semibold text-white/90" style={{ color: hero.accentColor }}>
                Superhero: {hero.heroName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/15 text-xs text-white/80 relative z-10">
          <p className="italic text-white/95 font-medium">&ldquo;{hero.quote}&rdquo;</p>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/70">
            <Zap className="w-3 h-3 text-amber-300" />
            <span>Power: <b>{hero.superpower}</b></span>
          </div>
        </div>
      </div>
    </div>
  )
}
