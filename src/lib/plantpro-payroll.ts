// Ported near-verbatim from plant-management-system's src/lib/payroll.ts —
// pure functions, no DB coupling, so no adaptation needed beyond the file
// move. Canonical payroll math shared by the HR, OT and Timesheet pages.

export type PayColumnFlags = {
  key: string
  includeInGross: boolean
  includeInNetDeduct: boolean
}

export type WorkerPayValues = Record<string, number> // { [payColumnKey]: value }

export function calcGrossPay(values: WorkerPayValues, columns: PayColumnFlags[]): number {
  return columns.reduce((sum, col) => (col.includeInGross ? sum + (Number(values[col.key]) || 0) : sum), 0)
}

export function calcNetPay(values: WorkerPayValues, columns: PayColumnFlags[]): number {
  const gross = calcGrossPay(values, columns)
  const deductions = columns.reduce(
    (sum, col) => (col.includeInNetDeduct ? sum + (Number(values[col.key]) || 0) : sum),
    0
  )
  return gross - deductions
}

export type DayType = 'normal' | 'sunday' | 'holiday'

export type Multipliers = {
  normalOt: number
  sundayBasic: number
  sundayOt: number
  holidayBasic: number
  holidayOt: number
}

export function multiplierFor(dayType: DayType, multipliers: Multipliers): { basic: number; ot: number } {
  if (dayType === 'sunday') return { basic: multipliers.sundayBasic, ot: multipliers.sundayOt }
  if (dayType === 'holiday') return { basic: multipliers.holidayBasic, ot: multipliers.holidayOt }
  return { basic: 1.0, ot: multipliers.normalOt }
}

/** Net pay / days in month / 8 = hourly rate used for OT/holiday multiplier pay. */
export function hourlyRateFromNetPay(netPay: number, daysInMonth: number): number {
  if (daysInMonth <= 0) return 0
  const dailyRate = netPay / daysInMonth
  return dailyRate > 0 ? dailyRate / 8 : 0
}

export function dailyPay(
  basicHours: number, otHours: number, dayType: DayType, hourlyRate: number, multipliers: Multipliers
): number {
  const { basic: basicMult, ot: otMult } = multiplierFor(dayType, multipliers)
  return basicHours * hourlyRate * basicMult + otHours * hourlyRate * otMult
}

export function calcMonthPay(
  days: { basic: number; ot: number; dayType: DayType }[], netPay: number, multipliers: Multipliers
): { totalBasic: number; totalOT: number; totalPay: number } {
  const hourlyRate = hourlyRateFromNetPay(netPay, days.length)
  let totalBasic = 0, totalOT = 0, totalPay = 0
  for (const d of days) {
    totalBasic += d.basic
    totalOT += d.ot
    totalPay += dailyPay(d.basic, d.ot, d.dayType, hourlyRate, multipliers)
  }
  return { totalBasic, totalOT, totalPay }
}
