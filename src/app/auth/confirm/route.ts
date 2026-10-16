import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The one-time link in an invitation e-mail lands here.
//
// GET only shows a "Continue" page. The token is NOT used by a GET: e-mail security scanners
// (Outlook, Defender, link previewers) open every link in a message in advance, and they would
// burn a one-time token before the person ever clicked. The button on that page POSTs, and only
// then is the token exchanged for a session and the person sent on to choose their password.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

// Only ever go to a page on this site.
const safePath = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/')
const TYPES = ['recovery', 'invite', 'email']

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tokenHash = searchParams.get('token_hash') ?? ''
  const type = searchParams.get('type') ?? ''
  const next = safePath(searchParams.get('next'))
  if (!tokenHash || !TYPES.includes(type)) return expired(req)

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Continue to AlphaVision</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:32px;max-width:380px;width:calc(100% - 32px);text-align:center}
h1{font-size:22px;margin:0 0 6px}p{color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px}
button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 26px;font-size:15px;font-weight:700;cursor:pointer}button:hover{background:#1d4ed8}</style></head>
<body><form class="card" method="post" action="/auth/confirm">
<h1>AlphaVision</h1><p>Press continue to finish setting up your account and choose your password.</p>
<input type="hidden" name="token_hash" value="${esc(tokenHash)}"><input type="hidden" name="type" value="${esc(type)}"><input type="hidden" name="next" value="${esc(next)}">
<button type="submit">Continue</button></form></body></html>`
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } })
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const tokenHash = String(form.get('token_hash') ?? '')
  const type = String(form.get('type') ?? '')
  const next = safePath(String(form.get('next') ?? ''))
  if (tokenHash && TYPES.includes(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: type as 'recovery' | 'invite' | 'email', token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(next, req.url), 303)
  }
  return expired(req)
}

function expired(req: NextRequest) {
  const url = new URL('/login', req.url)
  url.searchParams.set('message', 'That link has expired or was already used. Ask the person who invited you to send a new one.')
  return NextResponse.redirect(url, 303)
}
