/**
 * Natural sort helper for alphanumeric strings (e.g. H6, H8, H10, H12, H16, H20...)
 * and objects by key.
 */
export function naturalSort<T>(array: T[], key?: (item: T) => string): T[] {
  return [...array].sort((a, b) => {
    const valA = key ? (key(a) || '') : String(a || '');
    const valB = key ? (key(b) || '') : String(b || '');
    return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
  });
}
