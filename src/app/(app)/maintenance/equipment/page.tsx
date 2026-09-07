export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Wrench } from 'lucide-react'
import EquipmentTable from './EquipmentTable'

interface SearchParams {
  q?: string
  category?: string
  location?: string
  condition?: string
}

// PostgREST's .or() filter string treats ",", "(", ")" as syntax — strip
// them out of free-text search input so a typed comma/paren can't break the
// filter (not a security issue, .ilike()'s %value% is still parameterized;
// this is purely so the query keeps behaving like a plain text search).
function sanitizeForOrFilter(s: string) {
  return s.replace(/[,()]/g, ' ').trim()
}

export default async function EquipmentListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, category, location, condition } = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: myAccess } = user
    ? await supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'maintenance').maybeSingle()
    : { data: null }
  const canManage = myAccess?.role === 'admin' || myAccess?.role === 'manager'

  // Unfiltered pass just for the category/location dropdown option lists —
  // independent of whatever filters are currently applied, so switching one
  // filter doesn't shrink the others' choices.
  const { data: allActive } = await supabase
    .from('maintenance_equipment')
    .select('category, location, purpose')
    .eq('is_active', true)
  const categories = [...new Set((allActive || []).map(e => e.category).filter(Boolean))].sort() as string[]
  const locations = [...new Set((allActive || []).map(e => e.location).filter(Boolean))].sort() as string[]
  const purposes = [...new Set((allActive || []).map(e => e.purpose).filter(Boolean))].sort() as string[]

  let query = supabase
    .from('maintenance_equipment')
    .select('id, equip_code, name, category, brand, location, purpose, condition, manager, supervisor, pic_day, pic_night, target_repair_hours')
    .eq('is_active', true)

  // Spoiled equipment is retired/unusable — hidden from the working list by
  // default so it doesn't clutter day-to-day use (still fully editable,
  // including reverting the condition, in Settings). Explicitly filtering
  // to "Spoil" overrides that default so it can still be found here.
  if (condition) {
    query = query.eq('condition', condition)
  } else {
    // .neq() excludes NULLs too (SQL <> with NULL is never true) — equipment
    // with no condition set yet must still show, so allow NULL explicitly.
    query = query.or('condition.neq.spoil,condition.is.null')
  }
  if (category) query = query.eq('category', category)
  if (location) query = query.eq('location', location)
  if (q && q.trim()) {
    const term = sanitizeForOrFilter(q.trim())
    if (term) query = query.or(`equip_code.ilike.%${term}%,name.ilike.%${term}%`)
  }

  const { data: equipment } = await query.order('name')

  const hasFilters = !!(q || category || location || condition)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Wrench className="w-7 h-7 text-orange-600" /> Equipment</h1>

      <form method="GET" className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search (code or name)</label>
          <input name="q" defaultValue={q || ''} placeholder="e.g. E00092 or Crane" className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
          <select name="category" defaultValue={category || ''} className="border rounded-md px-3 py-2 text-sm bg-white w-40">
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Location</label>
          <select name="location" defaultValue={location || ''} className="border rounded-md px-3 py-2 text-sm bg-white w-40">
            <option value="">All</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
          <select name="condition" defaultValue={condition || ''} className="border rounded-md px-3 py-2 text-sm bg-white w-32">
            <option value="">All (except Spoil)</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="spoil">Spoil</option>
          </select>
        </div>
        <button type="submit" className="bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-orange-700">Filter</button>
        {hasFilters && <Link href="/maintenance/equipment" className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">Clear</Link>}
      </form>

      <EquipmentTable equipment={equipment || []} canManage={canManage} hasFilters={hasFilters} categories={categories} locations={locations} purposes={purposes} />
    </div>
  )
}
