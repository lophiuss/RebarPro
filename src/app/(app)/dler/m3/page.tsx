import { guardDlerPage } from '../guard'
import { daysInMonth, type DlerDailyM3, type DlerDepartment, type DlerProject } from '@/lib/dler-math'
import { isCastcoreConfigured } from '@/lib/dler-castcore'
import M3InputClient from './M3InputClient'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export default async function DlerM3Page(props: {
  searchParams: Promise<{ month?: string; date?: string }>
}) {
  const { supabase } = await guardDlerPage(['admin', 'm3_input'])
  const sp = await props.searchParams

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
  const rawDate = typeof sp?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null
  const rawMonth = typeof sp?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null
  const month = rawMonth ?? (rawDate ? rawDate.slice(0, 7) : today.slice(0, 7))
  const selectedDate = rawDate && rawDate.startsWith(month) ? rawDate : today.startsWith(month) ? today : `${month}-01`

  const monthStart = `${month}-01`
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`

  const [deptsRes, projsRes, m3Res] = await Promise.all([
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').eq('status', 'Active').order('name'),
    supabase.from('dler_daily_m3').select('*').gte('entry_date', monthStart).lte('entry_date', monthEnd),
  ])

  if (deptsRes.error) throw deptsRes.error
  if (projsRes.error) throw projsRes.error
  if (m3Res.error) throw m3Res.error

  return (
    <M3InputClient
      month={month}
      selectedDate={selectedDate}
      departments={(deptsRes.data ?? []) as DlerDepartment[]}
      projects={(projsRes.data ?? []) as DlerProject[]}
      entries={(m3Res.data ?? []) as DlerDailyM3[]}
      castcoreConfigured={isCastcoreConfigured()}
    />
  )
}
