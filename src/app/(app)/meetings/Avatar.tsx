import { initials, type Person } from '@/lib/meetings'

const COLORS = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700', 'bg-teal-100 text-teal-700',
]

function colorFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

export default function Avatar({ person, size = 'md' }: { person: Person | undefined | null; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const dim = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-14 h-14 text-lg' : size === 'xl' ? 'w-20 h-20 text-2xl' : 'w-8 h-8 text-xs'
  if (!person) return <span className={`${dim} rounded-full bg-gray-100 text-gray-400 inline-flex items-center justify-center font-semibold shrink-0`}>?</span>
  return (
    <span
      title={person.full_name ?? ''}
      className={`${dim} ${colorFor(person.id)} rounded-full inline-flex items-center justify-center font-semibold shrink-0 ring-2 ring-white`}
    >
      {initials(person.full_name)}
    </span>
  )
}

export function AvatarStack({ people, max = 4 }: { people: (Person | undefined)[]; max?: number }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p, i) => <Avatar key={p?.id ?? i} person={p} size="sm" />)}
      {extra > 0 && <span className="text-xs text-gray-500 pl-2.5">+{extra}</span>}
    </span>
  )
}
