export const dynamic = 'force-dynamic'
export const revalidate = 0

import { FileUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import ImportClient from './ImportClient'
import RestrictedNotice from '../RestrictedNotice'

export default async function PlantproImportPage() {
  const supabase = await createClient()
  const { data: canSeeWages } = await supabase.rpc('plantpro_can_see_wages')
  if (!canSeeWages) return <RestrictedNotice what="Salary import" />
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><FileUp className="w-7 h-7 text-indigo-600" /> Import Timecard &amp; Worker Details</h1>
      <ImportClient />
    </div>
  )
}
