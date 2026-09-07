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

export default async function EquipmentListPage() {
  const supabase = await createClient()
  // Spoiled equipment is retired/unusable — hide it from the working list by
  // default so it doesn't clutter day-to-day use. It's never deleted, and
  // stays fully editable (including reverting the condition) in Settings.
  const { data: equipment } = await supabase
    .from('maintenance_equipment')
    .select('id, equip_code, name, category, location, condition, manager, supervisor, pic_day, pic_night')
    .eq('is_active', true)
    // .neq() excludes NULLs too (SQL <> with NULL is never true) — equipment
    // with no condition set yet must still show, so allow NULL explicitly.
    .or('condition.neq.spoil,condition.is.null')
    .order('name')

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Wrench className="w-7 h-7 text-orange-600" /> Equipment</h1>

      <div className="bg-white border rounded-xl shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manager / Supervisor</th>
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
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No equipment yet — add some in Settings.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
