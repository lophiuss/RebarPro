export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { Settings } from 'lucide-react'
import SettingsForm, { CoreValuesForm } from './SettingsForm'
import { PAGE_TYPES, type PageType } from '@/lib/meetings'

type AgendaRow = { page_type: PageType; title: string; minutes: number }

export default async function MeetingsSettingsPage() {
  const supabase = await createClient()
  const { data: settings } = await supabase.from('mtg_settings').select('default_agenda').eq('id', 1).maybeSingle()
  // core_values arrives with v46; a missing column just yields no values.
  const { data: cv } = await supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle()
  const agenda = (Array.isArray(settings?.default_agenda) ? settings.default_agenda : []) as AgendaRow[]
  const coreValues = (Array.isArray(cv?.core_values) ? cv.core_values : []) as string[]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-10">
      <section>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2"><Settings className="w-7 h-7 text-blue-600" /> Meetings settings</h1>
        <p className="text-sm text-gray-500 mb-6">The default agenda is copied into every new meeting. Existing meetings keep their own agenda.</p>
        <SettingsForm initial={agenda.filter(a => PAGE_TYPES.includes(a.page_type))} />
      </section>
      <section>
        <h2 className="text-xl font-bold mb-1">Core values</h2>
        <p className="text-sm text-gray-500 mb-4">Shown on every Workspace and Growth Plan page.</p>
        <CoreValuesForm initial={coreValues} />
      </section>
    </div>
  )
}
