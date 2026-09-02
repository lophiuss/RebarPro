import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only client using the secret (service-role equivalent) key.
// Never import this from a Client Component — it bypasses RLS entirely.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
