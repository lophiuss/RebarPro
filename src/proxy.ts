import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and the auth call below.
  // A simple mistake could make it very hard to debug users being randomly logged out.
  //
  // getClaims() checks the sign-in token's signature locally (asymmetric keys) and refreshes the
  // session cookie when needed, instead of asking the auth server on every request.
  const { data: claimData } = await supabase.auth.getClaims()
  const claims = claimData?.claims
  const user = claims?.sub ? { id: claims.sub, app_metadata: (claims.app_metadata ?? {}) as { must_change_password?: boolean } } : null
  const path = request.nextUrl.pathname

  if (
    !user &&
    !path.startsWith('/login') &&
    !path.startsWith('/auth') &&
    !path.startsWith('/visitor-checkin') &&
    !path.startsWith('/maintenance-request') &&
    !path.startsWith('/api/cron') && // Vercel Cron has no session; the route checks CRON_SECRET itself
    !path.startsWith('/privacy') &&
    !path.startsWith('/terms')
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // One query for both checks below: is the account still active, and which departments it has.
  const deptSegment = path.split('/')[1]
  const isDeptPage = ['rebar', 'cement', 'security', 'maintenance', 'mould', 'plantpro', 'meetings', 'qaqc'].includes(deptSegment)
  if (user && !path.startsWith('/login') && !path.startsWith('/auth')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active, access:user_department_access!user_department_access_user_id_fkey(department)')
      .eq('id', user.id)
      .maybeSingle()

    // A deactivated account is banned in Supabase Auth too (blocks new sign-ins outright, see
    // admin/access/actions.ts), but an already-open session would stay usable until its token
    // expires. Cut it immediately and notify administrators.
    if (profile && profile.is_active === false) {
      await supabase.auth.signOut()

      try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'Unknown IP'
        const userAgent = request.headers.get('user-agent') || 'Unknown Device'
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-security-alert`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            event_type: 'deactivated_account_access',
            email: (claims?.email as string) || user.id,
            ip,
            user_agent: userAgent,
            path: path,
            severity: 'CRITICAL',
            details: {
              note: 'A deactivated / blocked account session attempted to browse protected application routes.',
              user_id: user.id,
              attempted_path: path,
            },
          }),
        }).catch(() => {})
      } catch { /* non-blocking */ }

      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('message', 'Your account has been deactivated. Contact an admin.')
      return NextResponse.redirect(url)
    }

    // A person who was given a temporary password must choose their own before anything else.
    if (user.app_metadata.must_change_password === true) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/set-password'
      url.search = '?force=1'
      return NextResponse.redirect(url)
    }

    // A logged-in user on a department's pages without access to that department (stale bookmark,
    // another department's session, etc.) goes to "/" instead of an empty page with no nav.
    if (isDeptPage) {
      const departments = ((profile?.access ?? []) as { department: string }[]).map(a => a.department)
      if (!departments.includes(deptSegment)) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
      }
    }
  }

  // If user is logged in and tries to access /login, send them to their department home
  if (user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Same idea for AI Helper — direct navigation without access bounces home
  // instead of rendering an empty chat shell that every action call refuses.
  if (user && request.nextUrl.pathname.startsWith('/ai-helper')) {
    const { data: allowed } = await supabase.rpc('can_use_ai_helper')
    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
