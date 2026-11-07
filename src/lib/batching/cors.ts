import { NextResponse } from 'next/server'

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-Requested-With',
  'Access-Control-Max-Age': '86400',
}

/**
 * Helper to wrap a JSON response with standard CORS headers.
 */
export function jsonWithCors(body: any, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v)
  }
  return NextResponse.json(body, { ...init, headers })
}

/**
 * Handle HTTP OPTIONS preflight request with 204 No Content and CORS headers.
 */
export function handleOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}
