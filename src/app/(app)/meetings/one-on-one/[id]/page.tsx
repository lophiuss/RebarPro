export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OneOnOneForm from './OneOnOneForm'
import type { OneOnOneAnswers } from '@/lib/meetings'

export default async function OneOnOneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // RLS returns nothing unless the caller is the manager, the report or an admin.
  const { data: session } = await supabase
    .from('mtg_one_on_ones')
    .select('id, manager_id, report_id, quarter, status, answers')
    .eq('id', id)
    .maybeSingle()
  if (!session) notFound()

  const [{ data: settings }, { data: people }] = await Promise.all([
    supabase.from('mtg_settings').select('core_values').eq('id', 1).maybeSingle(),
    supabase.from('profiles').select('id, full_name, avatar_url').in('id', [session.manager_id, session.report_id]),
  ])

  return (
    <OneOnOneForm
      session={{ ...session, answers: (session.answers ?? {}) as OneOnOneAnswers } as any}
      people={people ?? []}
      coreValues={(Array.isArray(settings?.core_values) ? settings.core_values : []) as string[]}
      myId={user?.id ?? ''}
    />
  )
}
