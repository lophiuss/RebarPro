export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Wrench } from 'lucide-react'

const CONDITION_STYLE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  fair: 'bg-yellow-100 text-yellow-700',
  poor: 'bg-orange-100 text-orange-700',
  spoil: 'bg-red-100 text-red-700',
}

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

  // Unfiltered pass just for the category/location dropdown option lists —
  // independent of whatever filters are currently applied, so switching one
  // filter doesn't shrink the others' choices.
  const { data: allActive } = await supabase
    .from('maintenance_equipment')
    .select('category, location')
    .eq('is_active', true)
  const categories = [...new Set((allActive || []).map(e => e.category).filter(Boolean))].sort() as string[]
  const locations = [...new Set((allActive || []).map(e => e.location).filter(Boolean))].sort() as string[]

  let query = supabase
    .from('maintenance_equipment')
    .select('id, equip_code, name, category, location, condition, manager, supervisor, pic_day, pic_night')
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

  function hrefWith(overrides: Partial<SearchParams>) {
    const merged = { q, category, location, condition, ...overrides }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.category) params.set('category', merged.category)
    if (merged.location) params.set('location', merged.location)
    if (merged.condition) params.set('condition', merged.condition)
    const qs = params.toString()
    return qs ? `/maintenance/equipment?${qs}` : '/maintenance/equipment'
  }

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

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ownership</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PIC (Day / Night)</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(equipment || []).map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{e.equip_code || '-'}</td>
                <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">
                  <Link href={`/maintenance/equipment/${e.id}`} className="text-blue-600 hover:text-blue-800 hover:underline">{e.name}</Link>
                </td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{e.category || '-'}</td>
                <td className="px-4 py-3 text-sm whitespace-nowrap">{e.location || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {e.condition ? <span className={`text-xs font-bold uppercase rounded-full px-2 py-0.5 ${CONDITION_STYLE[e.condition] || 'bg-gray-100 text-gray-600'}`}>{e.condition}</span> : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{[e.manager, e.supervisor].filter(Boolean).join(' / ') || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{[e.pic_day, e.pic_night].filter(Boolean).join(' / ') || '-'}</td>
              </tr>
            ))}
            {(!equipment || equipment.length === 0) && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">{hasFilters ? 'No equipment matches these filters.' : 'No equipment yet — add some in Settings.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
