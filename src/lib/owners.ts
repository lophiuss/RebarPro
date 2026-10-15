// Items imported from another system can belong to someone who has no login here
// (stored as `owner_name`). To show them like any other person, such a row gets a
// stand-in owner id "name:<full name>" and the name is added to the lookup list.
// Stand-ins are display-only: pickers never offer them (see PersonPicker).

import type { Person } from './meetings'

export const NAME_PREFIX = 'name:'
export const isNameOwner = (id: string | null | undefined) => !!id && id.startsWith(NAME_PREFIX)

export function nameOwners<T extends { owner_id: string | null; owner_name?: string | null }>(rows: T[] | null | undefined, found: Set<string>): T[] {
  return (rows ?? []).map(r => {
    if (r.owner_id || !r.owner_name) return r
    found.add(r.owner_name)
    return { ...r, owner_id: NAME_PREFIX + r.owner_name }
  })
}

export function withNameOwners(people: Person[], names: Iterable<string>): Person[] {
  const extra = [...new Set(names)].map(n => ({ id: NAME_PREFIX + n, full_name: n, avatar_url: null }))
  return [...people, ...extra]
}
