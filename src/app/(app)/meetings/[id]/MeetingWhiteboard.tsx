'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, PenTool } from 'lucide-react'
import Whiteboard from '../coach/[id]/Whiteboard'
import { createWhiteboard } from '../coach/actions'
import { act } from '../act'

// The meeting's own whiteboards: pick or create one and draw, right inside the meeting.
export default function MeetingWhiteboard({
  meetingId, boards, board, myName,
}: {
  meetingId: string
  boards: { id: string; title: string }[]
  board: { id: string; title: string; items: unknown[] } | null
  myName: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function create() {
    const name = prompt('Whiteboard name', boards.length ? `Whiteboard ${boards.length + 1}` : 'Meeting whiteboard')
    if (!name?.trim()) return
    setBusy(true)
    const id = await act(() => createWhiteboard({ title: name, meeting_id: meetingId }))
    setBusy(false)
    if (id) router.push(`/meetings/${meetingId}?tab=WHITEBOARD&board=${id}`)
  }

  if (!board) {
    return (
      <div className="p-4 md:p-6 xl:p-8">
        <div className="border border-dashed rounded-xl bg-white p-10 text-center">
          <PenTool className="w-8 h-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-600 mb-4">This meeting has no whiteboard yet.</p>
          <button onClick={create} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"><Plus className="w-4 h-4" /> New whiteboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4 w-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {boards.map(b => (
          <button
            key={b.id}
            onClick={() => router.push(`/meetings/${meetingId}?tab=WHITEBOARD&board=${b.id}`)}
            className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${b.id === board.id ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}
          >{b.title}</button>
        ))}
        <button onClick={create} disabled={busy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-white text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"><Plus className="w-4 h-4" /> New</button>
      </div>
      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
        <Whiteboard key={board.id} id={board.id} initialTitle={board.title} initialItems={board.items} meetingId={meetingId} myName={myName} embedded />
      </div>
    </div>
  )
}
