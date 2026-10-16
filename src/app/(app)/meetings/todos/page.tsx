export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { ListChecks } from 'lucide-react'
import TodosBoard from './TodosBoard'
import { nameOwners, withNameOwners } from '@/lib/owners'

export default async function MeetingsTodosPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const [{ data: todos }, { data: meetings }, { data: people }] = await Promise.all([
    supabase
      .from('mtg_todos')
      .select('id, title, details, owner_id, owner_name, due_date, done_at, meeting_id, created_at, status')
      .is('archived_at', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(1000),
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).order('name'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false).order('full_name'),
  ])

  const found = new Set<string>()
  const rows = nameOwners(todos as any[], found)

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
        <ListChecks className="w-7 h-7 text-blue-600" /> To-dos
      </h1>
      <TodosBoard todos={rows as any} meetings={meetings ?? []} people={withNameOwners(people ?? [], found)} myId={user?.id ?? ''} />
    </div>
  )
}
