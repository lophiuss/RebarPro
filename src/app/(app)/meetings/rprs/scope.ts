// Who a manager may assess: the people sitting in seats BELOW the seat(s) they
// hold on the org chart (level 1 = direct reports, 2 = their reports, …).
// Pure function, shared by the page (what to list) and the server action (what to allow).

export type ScopeSeat = { id: string; parent_id: string | null; title: string; roles?: string[] | null }
export type ScopeEntry = { level: number; seats: string[]; seat_ids: string[]; roles: string[] }

export function downline(seats: ScopeSeat[], seatPeople: { seat_id: string; user_id: string }[], myId: string): Map<string, ScopeEntry> {
  const byParent = new Map<string, ScopeSeat[]>()
  for (const s of seats) if (s.parent_id) byParent.set(s.parent_id, [...(byParent.get(s.parent_id) ?? []), s])
  const peopleBySeat = new Map<string, string[]>()
  for (const sp of seatPeople) peopleBySeat.set(sp.seat_id, [...(peopleBySeat.get(sp.seat_id) ?? []), sp.user_id])

  const out = new Map<string, ScopeEntry>()
  const mine = seatPeople.filter(sp => sp.user_id === myId).map(sp => sp.seat_id)
  const seen = new Set<string>()
  let frontier = mine
  for (let level = 1; frontier.length && level <= 20; level++) {
    const next: string[] = []
    for (const seatId of frontier) {
      for (const child of byParent.get(seatId) ?? []) {
        if (seen.has(child.id)) continue
        seen.add(child.id)
        next.push(child.id)
        for (const uid of peopleBySeat.get(child.id) ?? []) {
          if (uid === myId) continue
          const e = out.get(uid) ?? { level, seats: [], seat_ids: [], roles: [] }
          e.level = Math.min(e.level, level)
          e.seats.push(child.title)
          e.seat_ids.push(child.id)
          e.roles.push(...(Array.isArray(child.roles) ? child.roles : []))
          out.set(uid, e)
        }
      }
    }
    frontier = next
  }
  return out
}

// Everyone who holds any seat (what an admin / the boss can see).
export function everyone(seats: ScopeSeat[], seatPeople: { seat_id: string; user_id: string }[], myId: string): Map<string, ScopeEntry> {
  const mine = downline(seats, seatPeople, myId)
  const titles = new Map(seats.map(s => [s.id, s]))
  const out = new Map<string, ScopeEntry>()
  for (const sp of seatPeople) {
    const seat = titles.get(sp.seat_id)
    if (!seat) continue
    const e = out.get(sp.user_id) ?? { level: mine.get(sp.user_id)?.level ?? 0, seats: [], seat_ids: [], roles: [] }
    e.seats.push(seat.title)
    e.seat_ids.push(seat.id)
    e.roles.push(...(Array.isArray(seat.roles) ? seat.roles : []))
    out.set(sp.user_id, e)
  }
  return out
}

// Every seat below the ones I hold. A superior may write the criteria for these seats.
export function seatsBelow(seats: ScopeSeat[], seatPeople: { seat_id: string; user_id: string }[], myId: string): Set<string> {
  const byParent = new Map<string, string[]>()
  for (const s of seats) if (s.parent_id) byParent.set(s.parent_id, [...(byParent.get(s.parent_id) ?? []), s.id])
  const out = new Set<string>()
  let frontier = seatPeople.filter(sp => sp.user_id === myId).map(sp => sp.seat_id)
  for (let i = 0; i < 20 && frontier.length; i++) {
    const next: string[] = []
    for (const id of frontier) for (const c of byParent.get(id) ?? []) if (!out.has(c)) { out.add(c); next.push(c) }
    frontier = next
  }
  return out
}
