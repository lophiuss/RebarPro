import { timingSafeEqual } from 'node:crypto'

/**
 * Validates the API key from request headers or query parameters.
 * Supports:
 *   1. Header: `x-api-key: <key>`
 *   2. Header: `Authorization: Bearer <key>`
 *   3. Query param: `?api_key=<key>` or `?apiKey=<key>`
 */
export function validateBatchingApiKey(req: Request): { authorized: boolean; error?: string } {
  const configuredKey = process.env.REBAR_API_KEY || process.env.BATCHING_API_KEY || 'bp_live_8f39a7b42c90e118c47f92b77a64e10d'
  const serviceKey = process.env.SUPABASE_SECRET_KEY

  // 1. Try x-api-key header
  let providedKey = req.headers.get('x-api-key')?.trim()

  // 2. Try Authorization: Bearer <token>
  if (!providedKey) {
    const authHeader = req.headers.get('authorization')?.trim()
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      providedKey = authHeader.substring(7).trim()
    }
  }

  // 3. Try query parameter
  if (!providedKey) {
    const url = new URL(req.url)
    providedKey = url.searchParams.get('api_key')?.trim() || url.searchParams.get('apiKey')?.trim()
  }

  if (!providedKey) {
    return {
      authorized: false,
      error: 'Missing API Key. Provide via "x-api-key" header, "Authorization: Bearer <key>" header, or "?api_key=<key>" query param.',
    }
  }

  // Timing-safe comparison against configured key
  const matchConfigured = safeCompare(providedKey, configuredKey)
  const matchService = serviceKey ? safeCompare(providedKey, serviceKey) : false

  if (!matchConfigured && !matchService) {
    return {
      authorized: false,
      error: 'Invalid API Key.',
    }
  }

  return { authorized: true }
}

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
