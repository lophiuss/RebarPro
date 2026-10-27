import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SignedInUser = { id: string; email: string | null; app_metadata: Record<string, unknown> }

// Who is signed in, checked against the sign-in token's signature locally (the project uses
// asymmetric signing keys, so no round trip to the auth server is needed). getUser() asks the auth
// server every time, which from a distant region costs a few hundred milliseconds per call.
// A deactivated account is still cut off at once: proxy.ts checks profiles.is_active on every request.
export async function getSignedInUser(supabase: SupabaseClient): Promise<SignedInUser | null> {
  const { data, error } = await supabase.auth.getClaims()
  const c = data?.claims
  if (error || !c?.sub) return null
  return {
    id: c.sub,
    email: (c.email as string | undefined) ?? null,
    app_metadata: (c.app_metadata as Record<string, unknown> | undefined) ?? {},
  }
}

// React cache() deduplicates these queries across Layout and Page within
// the exact same server render lifecycle, cutting duplicate network round-trips to zero.
export const getCurrentUserAccess = cache(async (supabase: SupabaseClient, userId: string) => {
  const [{ data: access }, { data: navPerms }, { data: profile }, { data: canUseAiHelper }] = await Promise.all([
    supabase.from('user_department_access').select('department, role').eq('user_id', userId),
    supabase.from('department_nav_permissions').select('department, role, nav_key'),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    supabase.rpc('can_use_ai_helper'),
  ])
  return {
    departments: access ?? [],
    navPermissions: navPerms ?? [],
    fullName: profile?.full_name ?? null,
    canUseAiHelper: !!canUseAiHelper,
  }
})
