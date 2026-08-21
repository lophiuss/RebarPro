/**
 * Unit utility for RebarPro.
 *
 * The system stores all quantities in TONNES internally.
 * - If defaultUnit === 'kg', display values are multiplied by 1000 and labelled 'kg'.
 * - If defaultUnit === 'ton', values are shown as-is and labelled 'ton'.
 */

export type DefaultUnit = 'kg' | 'ton'

/** Returns the short display label for the unit. */
export function unitLabel(unit: DefaultUnit): string {
  return unit === 'kg' ? 'kg' : 'ton'
}

/**
 * Converts an internal tonne value to the display unit.
 * - kg:  multiply by 1000
 * - ton: return as-is
 */
export function toDisplayUnit(tonnes: number, unit: DefaultUnit): number {
  return unit === 'kg' ? tonnes * 1000 : tonnes
}

/**
 * Converts a user-entered display-unit value back to tonnes for storage.
 * - kg:  divide by 1000
 * - ton: return as-is
 */
export function toTonnes(displayValue: number, unit: DefaultUnit): number {
  return unit === 'kg' ? displayValue / 1000 : displayValue
}

/**
 * Formats a tonne value for display with the correct unit and decimal places.
 * - kg:  show 0 decimal places (whole kg)
 * - ton: show 2 decimal places
 */
export function fmtQty(tonnes: number, unit: DefaultUnit, decimals?: number): string {
  const value = toDisplayUnit(tonnes, unit)
  const dp = decimals !== undefined ? decimals : (unit === 'kg' ? 0 : 2)
  return `${value.toFixed(dp)} ${unitLabel(unit)}`
}

/**
 * Formats a tonne value for display WITHOUT the unit suffix.
 */
export function fmtQtyNum(tonnes: number, unit: DefaultUnit, decimals?: number): string {
  const value = toDisplayUnit(tonnes, unit)
  const dp = decimals !== undefined ? decimals : (unit === 'kg' ? 0 : 2)
  return value.toFixed(dp)
}
