'use client'

import { notifyError } from '../ui/feedback'
import { createContext, useContext } from 'react'
import type { Person } from '@/lib/meetings'

export type Run = {
  id: string
  leader_id: string | null
  started_at: string
  current_page: string
  // Seconds spent per agenda page, plus `_entered_at`: epoch ms at which the
  // current page was entered (so late joiners can show the running page timer).
  page_seconds: Record<string, number>
  notes: string
  ratings_revealed: boolean
  // { [user id]: true | false } as ticked on the Check-in page.
  attendance: Record<string, boolean>
}

export type MeetingCtx = {
  meetingId: string
  run: Run | null
  people: Person[]
  peopleById: Map<string, Person>
  attendeeIds: string[]
  myId: string
  isLeader: boolean
  // Called after any mutation so other attendees' screens refresh too.
  changed: () => void
}

const Ctx = createContext<MeetingCtx | null>(null)
export const MeetingProvider = Ctx.Provider

export function useMeeting() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useMeeting outside MeetingProvider')
  return v
}

// Runs a server action, surfaces errors the same way the rest of the app does
// (alert), and notifies other attendees on success.
export function useRun() {
  const { changed } = useMeeting()
  return async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const out = await fn()
      changed()
      return out
    } catch (err: any) {
      notifyError(err)
      return undefined
    }
  }
}
