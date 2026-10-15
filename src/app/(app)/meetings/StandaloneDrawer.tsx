'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import ItemDrawer, { type DrawerItem, type DrawerKind } from './[id]/ItemDrawer'
import { MeetingProvider } from './[id]/context'
import type { Person } from '@/lib/meetings'

// Opens the normal item panel (rich details, assign, move / copy / escalate…)
// from pages that are not inside a meeting, such as My Workspace and To-dos. It
// supplies the meeting context the panel expects, for the item's own meeting.
export default function StandaloneDrawer({
  kind, item, meetingId, meetings, people, myId, onClose,
}: {
  kind: DrawerKind
  item: DrawerItem
  meetingId: string
  meetings: { id: string; name: string }[]
  people: Person[]
  myId: string
  onClose: () => void
}) {
  const router = useRouter()
  const value = useMemo(() => ({
    meetingId,
    run: null,
    people,
    peopleById: new Map(people.map(p => [p.id, p])),
    attendeeIds: [] as string[],
    myId,
    isLeader: false,
    changed: () => router.refresh(),
  }), [meetingId, people, myId, router])

  return (
    <MeetingProvider value={value}>
      <ItemDrawer
        key={item.id}
        kind={kind}
        item={item}
        otherMeetings={meetings.filter(m => m.id !== meetingId)}
        onClose={onClose}
      />
    </MeetingProvider>
  )
}
