import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// The one-time link in an invitation e-mail lands here. It exchanges the token for a
// signed-in session on this site, then sends the person on (to choose their password).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/'
  // Only ever go to a page on this site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (tokenHash && (type === 'recovery' || type === 'invite' || type === 'email')) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL(safeNext, req.url))
  }
  const url = new URL('/login', req.url)
  url.searchParams.set('message', 'That link has expired or was already used. Ask the person who invited you to send a new one.')
  return NextResponse.redirect(url)
}
