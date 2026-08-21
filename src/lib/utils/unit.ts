/**
 * Unit utility for RebarPro.
 * Values stored in database are direct numbers.
 * Formatting includes thousand separators (e.g. 1,250 kg).
 */

export type DefaultUnit = 'kg' | 'ton'

/** Returns the short display label for the unit. */
export function unitLabel(unit: DefaultUnit): string {
  return unit === 'kg' ? 'kg' : 'ton'
}

/** Values are displayed direct (no x1000 multiplier). */
export function toDisplayUnit(val: number, _unit?: DefaultUnit): number {
  return val
}

/** Values are saved direct. */
export function toTonnes(val: number, _unit?: DefaultUnit): number {
  return val
}

/**
 * Formats a number with thousand separators (commas).
 * - kg: whole numbers by default (0 decimal places if whole, max 2) e.g. 12,345
 * - ton: 2 decimal places e.g. 12.35
 */
export function fmtQtyNum(val: number | null | undefined, unit: DefaultUnit = 'kg', decimals?: number): string {
  if (val === null || val === undefined || isNaN(val)) return '0'

  const dp = decimals !== undefined ? decimals : (unit === 'kg' ? (Number.isInteger(val) ? 0 : 2) : 2)

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp
  }).format(val)
}

/**
 * Formats a number with thousand separators AND unit suffix.
 * e.g. "12,345 kg" or "12.35 ton"
 */
export function fmtQty(val: number | null | undefined, unit: DefaultUnit = 'kg', decimals?: number): string {
  return `${fmtQtyNum(val, unit, decimals)} ${unitLabel(unit)}`
}
