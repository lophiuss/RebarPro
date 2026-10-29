export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { Users } from 'lucide-react'
import DirectReportsView from './DirectReportsView'

export default async function DirectReportsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  const myId = user?.id ?? ''

  const [{ data: seats }, { data: seatPeople }, { data: people }, { data: qaMeetings }] = await Promise.all([
    supabase.from('mtg_seats').select('id, parent_id, title, subtitle'),
    supabase.from('mtg_seat_people').select('seat_id, user_id'),
    supabase.from('profiles').select('id, full_name, avatar_url').neq('is_active', false),
    supabase.from('mtg_meetings').select('id, mtg_attendees(user_id)').eq('meeting_type', 'quarterly_alignment').eq('is_archived', false),
  ])

  // Direct reports = people sitting in seats directly beneath a seat I hold.
  const mySeatIds = new Set((seatPeople ?? []).filter(sp => sp.user_id === myId).map(sp => sp.seat_id as string))
  const childSeats = (seats ?? []).filter(s => s.parent_id && mySeatIds.has(s.parent_id as string))
  const peopleById = new Map((people ?? []).map(p => [p.id as string, p]))
  const reports: { id: string; name: string; seat: string; subtitle: string | null }[] = []
  const seen = new Set<string>()
  for (const seat of childSeats) {
    for (const sp of (seatPeople ?? []).filter(x => x.seat_id === seat.id)) {
      const uid = sp.user_id as string
      if (uid === myId || seen.has(uid)) continue
      seen.add(uid)
      reports.push({ id: uid, name: (peopleById.get(uid)?.full_name as string) ?? 'Unknown', seat: seat.title as string, subtitle: (seat.subtitle as string | null) ?? null })
    }
  }

  const ids = reports.map(r => r.id)
  const since = new Date()
  since.setDate(since.getDate() - 400)
  const sinceStr = since.toISOString()

  const [{ data: todos }, { data: goals }] = ids.length
    ? await Promise.all([
        supabase.from('mtg_todos').select('id, owner_id, title, due_date, done_at').in('owner_id', ids).or(`done_at.is.null,done_at.gte.${sinceStr}`).order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('mtg_goals').select('id, owner_id, title, status, due_date, completed_at, milestones').in('owner_id', ids),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }]

  // Existing quarterly alignment meeting between me and each report.
  const qaByReport: Record<string, string> = {}
  for (const m of qaMeetings ?? []) {
    const att: string[] = ((m as any).mtg_attendees ?? []).map((a: any) => a.user_id)
    if (att.length === 2 && att.includes(myId)) {
      const other = att.find(a => a !== myId)
      if (other) qaByReport[other] = m.id as string
    }
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1500px] mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><Users className="w-7 h-7 text-blue-600" /> Direct reports</h1>
      <DirectReportsView reports={reports} todos={(todos ?? []) as any} goals={(goals ?? []) as any} qaByReport={qaByReport} />
    </div>
  )
}
