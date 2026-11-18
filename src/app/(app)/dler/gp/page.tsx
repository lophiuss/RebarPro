import { guardDlerPage } from '../guard'
import type { DlerDepartment, DlerFactory, DlerGpEntry, DlerProject } from '@/lib/dler-math'
import GpInputClient from './GpInputClient'

export const dynamic = 'force-dynamic'

export default async function DlerGpPage(props: {
  searchParams: Promise<{ month?: string; date?: string }>
}) {
  const { supabase } = await guardDlerPage(['admin', 'gp_input'])
  const sp = await props.searchParams

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
  const rawDate = typeof sp?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null
  const rawMonth = typeof sp?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null
  const month = rawMonth ?? (rawDate ? rawDate.slice(0, 7) : today.slice(0, 7))
  const selectedDate = rawDate && rawDate.startsWith(month) ? rawDate : today.startsWith(month) ? today : `${month}-01`

  const [facRes, deptRes, projRes, gpRes] = await Promise.all([
    supabase.from('dler_factories').select('*').order('name'),
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').order('name'),
    supabase.from('dler_gp_entries').select('*').eq('month', month),
  ])

  if (facRes.error) throw facRes.error
  if (deptRes.error) throw deptRes.error
  if (projRes.error) throw projRes.error
  if (gpRes.error) throw gpRes.error

  return (
    <GpInputClient
      month={month}
      selectedDate={selectedDate}
      factories={(facRes.data ?? []) as DlerFactory[]}
      departments={(deptRes.data ?? []) as DlerDepartment[]}
      projects={(projRes.data ?? []) as DlerProject[]}
      entries={(gpRes.data ?? []) as DlerGpEntry[]}
    />
  )
}
