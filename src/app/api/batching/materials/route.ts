import { createAdminClient } from '@/lib/supabase/admin'
import { validateBatchingApiKey } from '@/lib/batching/auth'
import { jsonWithCors, handleOptions } from '@/lib/batching/cors'

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return handleOptions()
}

/**
 * GET /api/batching/materials
 * 
 * Returns the list of active batching plants and batching raw materials
 * with their standard units and nominal requirements (kg/m3).
 */
export async function GET(req: Request) {
  const auth = validateBatchingApiKey(req)
  if (!auth.authorized) {
    return jsonWithCors({ success: false, error: auth.error }, { status: 401 })
  }

  const admin = createAdminClient()

  const [{ data: plants, error: plantsErr }, { data: materials, error: matsErr }] = await Promise.all([
    admin.from('cement_plants').select('id, name, is_active').order('name'),
    admin.from('cement_materials').select(`
      id,
      name,
      is_active,
      batching_req,
      cement_units (
        id,
        name
      )
    `).order('name'),
  ])

  if (plantsErr || matsErr) {
    return jsonWithCors({
      success: false,
      error: 'Failed to retrieve materials or plants',
      details: plantsErr?.message || matsErr?.message,
    }, { status: 500 })
  }

  const formattedMaterials = (materials || []).map(m => {
    const unitName = (m.cement_units as any)?.name || 'kg'
    return {
      id: m.id,
      name: m.name,
      is_active: m.is_active,
      unit: unitName,
      nominal_batching_requirement_kg_per_m3: m.batching_req ?? 0,
    }
  })

  return jsonWithCors({
    success: true,
    plants: plants || [],
    materials: formattedMaterials,
  })
}
