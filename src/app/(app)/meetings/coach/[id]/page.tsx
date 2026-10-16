export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import Whiteboard from './Whiteboard'

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  const { data: board } = await supabase.from('mtg_whiteboards').select('id, title, data, meeting_id').eq('id', id).maybeSingle()
  if (!board) notFound()
  const { data: profile } = user ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : { data: null }

  return (
    <Whiteboard
      id={board.id as string}
      initialTitle={board.title as string}
      initialItems={(((board.data as any)?.items) ?? []) as any[]}
      meetingId={(board.meeting_id as string | null) ?? null}
      myName={(profile?.full_name as string | null) ?? 'Someone'}
    />
  )
}
