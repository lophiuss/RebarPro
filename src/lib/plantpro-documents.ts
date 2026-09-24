// Ported near-verbatim from plant-management-system's src/lib/documents.ts —
// pure date math, no DB coupling.

export type DocumentStatus = 'expired' | 'expiring' | 'ok'

const DAY_MS = 24 * 60 * 60 * 1000
const EXPIRING_WINDOW_DAYS = 30

/** No expiryDate at all -> 'ok' (nothing to track). */
export function getDocumentStatus(expiryDate: string | null | undefined, today: Date = new Date()): DocumentStatus {
  if (!expiryDate) return 'ok'
  const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  const expiry = new Date(expiryDate + 'T00:00:00Z')
  const diffDays = Math.round((expiry.getTime() - todayStart.getTime()) / DAY_MS)
  if (diffDays < 0) return 'expired'
  if (diffDays <= EXPIRING_WINDOW_DAYS) return 'expiring'
  return 'ok'
}
