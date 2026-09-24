// Ported near-verbatim from plant-management-system's src/lib/hostel.ts —
// pure date/math functions, no DB coupling.

/** Inclusive day count of the overlap between [moveIn, moveOut ?? end-of-month] and `month` (yyyy-MM). */
export function daysStayedInMonth(moveIn: string, moveOut: string | null, month: string): number {
  const [y, m] = month.split('-').map(Number)
  const monthStart = new Date(Date.UTC(y, m - 1, 1))
  const monthEnd = new Date(Date.UTC(y, m, 0)) // last day of month

  const moveInDate = new Date(moveIn + 'T00:00:00Z')
  const moveOutDate = moveOut ? new Date(moveOut + 'T00:00:00Z') : monthEnd

  const overlapStart = moveInDate > monthStart ? moveInDate : monthStart
  const overlapEnd = moveOutDate < monthEnd ? moveOutDate : monthEnd

  if (overlapStart > overlapEnd) return 0

  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((overlapEnd.getTime() - overlapStart.getTime()) / msPerDay) + 1
}

export type ProrationInput = { workerId: number; days: number }

/** Prorated RM share per worker = billAmount x (theirDays / totalPaxDays). Empty if no pax-days. */
export function computeProration(billAmount: number, stays: ProrationInput[]): Record<number, number> {
  const totalPaxDays = stays.reduce((sum, s) => sum + s.days, 0)
  if (totalPaxDays === 0) return {}
  const result: Record<number, number> = {}
  for (const s of stays) {
    if (s.days <= 0) continue
    result[s.workerId] = billAmount * (s.days / totalPaxDays)
  }
  return result
}

/** Day-before helper (yyyy-MM-dd in, yyyy-MM-dd out), used by assignHostelStay's auto-close. */
export function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
