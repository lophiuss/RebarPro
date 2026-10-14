'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ArrowRight } from 'lucide-react'
import { createOneOnOne } from './actions'
import { act } from '../act'
import Avatar from '../Avatar'
import { currentQuarter, type Person } from '@/lib/meetings'

type Session = { id: string; manager_id: string; report_id: string; quarter: string; status: 'draft' | 'complete'; updated_at: string }

function quarterOptions() {
  const now = new Date()
  const out: string[] = []
  for (let i = -1; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i * 3, 1)
    out.push(currentQuarter(d))
  }
  return Array.from(new Set(out))
}

export default function OneOnOneList({ sessions, people, myId, canCreate }: { sessions: Session[]; people: Person[]; myId: string; canCreate: boolean }) {
  const router = useRouter()
  const peopleById = useMemo(() => new Map(people.map(p => [p.id, p])), [people])
  const [report, setReport] = useState('')
  const [quarter, setQuarter] = useState(currentQuarter())
  const [busy, setBusy] = useState(false)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!report) return
    setBusy(true)
    const id = await act(() => createOneOnOne(report, quarter))
    setBusy(false)
    if (id) router.push(`/meetings/one-on-one/${id}`)
  }

  return (
    <div>
      {canCreate && (
        <form onSubmit={create} className="border rounded-xl bg-white p-3 mb-6 grid gap-2 md:grid-cols-[1fr_9rem_auto]">
          <select value={report} onChange={e => setReport(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white" aria-label="Team member">
            <option value="">Start a 1:1 with…</option>
            {people.filter(p => p.id !== myId).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select value={quarter} onChange={e => setQuarter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white" aria-label="Quarter">
            {quarterOptions().map(q => <option key={q} value={q}>{q.replace('-', ' ')}</option>)}
          </select>
          <button disabled={!report || busy} className="inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"><Plus className="w-4 h-4" /> {busy ? 'Starting…' : 'Start'}</button>
        </form>
      )}

      {sessions.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center bg-white text-sm text-gray-500">
          No conversations yet.{canCreate ? ' Start one above.' : ' Your manager will start one for you.'}
        </div>
      ) : (
        <ul className="border rounded-xl bg-white divide-y">
          {sessions.map(s => {
            const other = peopleById.get(s.manager_id === myId ? s.report_id : s.manager_id)
            const mine = s.manager_id === myId || s.report_id === myId
            return (
              <li key={s.id}>
                <Link href={`/meetings/one-on-one/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <Avatar person={mine ? other : peopleById.get(s.report_id)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{mine ? other?.full_name : `${peopleById.get(s.manager_id)?.full_name} & ${peopleById.get(s.report_id)?.full_name}`}</div>
                    <div className="text-xs text-gray-500">{s.quarter.replace('-', ' ')} · updated {new Date(s.updated_at).toLocaleDateString('en-GB', { dateStyle: 'medium' })}{mine ? (s.manager_id === myId ? ' · you are the manager' : '') : ''}</div>
                  </div>
                  <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${s.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{s.status === 'complete' ? 'Complete' : 'In progress'}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
