// Normalization helpers used to cross-reference PDF workers <-> Excel rows by
// name, and to find-or-create Hostel records by address, without being
// tripped up by incidental whitespace/case differences between the two
// source files.

/** Trim, collapse internal whitespace, uppercase — for PDF-name <-> Excel-name matching. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

/** Trim, collapse internal whitespace — for Hostel address matching/dedup (case preserved, since addresses are stored/displayed as-is). */
export function normalizeAddress(address: string): string {
  return address.trim().replace(/\s+/g, ' ');
}
