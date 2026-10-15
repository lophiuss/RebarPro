export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { PenTool } from 'lucide-react'
import CoachList from './CoachList'

export default async function CoachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: boards }, { data: meetings }, { data: people }] = await Promise.all([
    supabase.from('mtg_whiteboards').select('id, title, meeting_id, created_by, updated_at, created_at').order('updated_at', { ascending: false }),
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).order('name'),
    supabase.from('profiles').select('id, full_name').neq('is_active', false),
  ])

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><PenTool className="w-7 h-7 text-blue-600" /> Coach</h1>
      <p className="text-sm text-gray-500 mb-6">Whiteboards for coaching sessions, brainstorming and working through an issue together. Draw, add sticky notes and text, and everyone with the board open sees changes live.</p>
      <CoachList
        boards={(boards ?? []) as any}
        meetings={meetings ?? []}
        people={Object.fromEntries((people ?? []).map(p => [p.id as string, (p.full_name as string) ?? '']))}
        myId={user?.id ?? ''}
      />
    </div>
  )
}
