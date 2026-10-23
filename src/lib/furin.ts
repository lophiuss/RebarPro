// A Japanese wind chime (風鈴 furin) made with the Web Audio API, so there is no sound file to load.
// A furin is a small glass/metal bell: a bright strike that rings out with a few inharmonic overtones. The
// "wind" strikes it at uneven moments, now and then two or three times in a row.
// startFurin() starts the loop and returns a stop function.

const NOTES = [1568, 1760, 2093, 2349, 2637, 3136] // G6 A6 C7 D7 E7 G7: a pentatonic, never clashes
const PARTIALS = [{ r: 1, g: 1 }, { r: 2.76, g: 0.45 }, { r: 5.4, g: 0.22 }, { r: 8.93, g: 0.1 }]

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* needs a click on the page first; stays silent */ })
  return ctx
}

function strike(ac: AudioContext, out: GainNode, when: number) {
  const f0 = NOTES[Math.floor(Math.random() * NOTES.length)] * (1 + (Math.random() - 0.5) * 0.004)
  const ring = 1.6 + Math.random() * 1.4
  const level = 0.5 + Math.random() * 0.5
  for (const p of PARTIALS) {
    const osc = ac.createOscillator()
    const g = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = f0 * p.r
    const decay = ring / p.r ** 0.5 // higher overtones fade sooner, like real glass
    g.gain.setValueAtTime(0, when)
    g.gain.linearRampToValueAtTime(p.g * level, when + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, when + decay)
    osc.connect(g).connect(out)
    osc.start(when)
    osc.stop(when + decay + 0.05)
  }
}

export function startFurin(volume = 0.12): () => void {
  const ac = audio()
  if (!ac) return () => {}
  const out = ac.createGain()
  out.gain.value = volume
  out.connect(ac.destination)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const gust = () => {
    if (stopped) return
    const hits = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1
    let t = ac.currentTime + 0.02
    for (let i = 0; i < hits; i++) { strike(ac, out, t); t += 0.12 + Math.random() * 0.25 }
    timer = setTimeout(gust, 500 + Math.random() * 1300)
  }
  gust()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    // let the last strikes ring out softly instead of cutting them off
    out.gain.setTargetAtTime(0, ac.currentTime, 0.4)
    setTimeout(() => out.disconnect(), 2500)
  }
}
