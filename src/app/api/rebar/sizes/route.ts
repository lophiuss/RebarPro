import { createAdminClient } from '@/lib/supabase/admin'
import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

/**
 * GET /api/rebar/sizes
 * 
 * Returns the list of all configured rebar sizes, standard units, and target daily consumption.
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: sizes, error } = await admin
    .from('rebar_sizes')
    .select('*')
    .order('size')

  if (error) {
    return jsonWithCors({ success: false, error: error.message }, { status: 500 })
  }

  return jsonWithCors({
    success: true,
    total: sizes?.length || 0,
    sizes: (sizes || []).map(s => ({
      id: s.id,
      size: s.size,
      unit: s.unit || 'Kg',
      target_daily_usage_kg: s.target_daily_usage ?? 0,
    })),
  })
}
