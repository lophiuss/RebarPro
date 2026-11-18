import { guardDlerPage } from '../guard'
import type { DlerDepartment, DlerFactory, DlerProject, DlerSettings } from '@/lib/dler-math'
import ConfigClient from './ConfigClient'

export const dynamic = 'force-dynamic'

const DEFAULT_SETTINGS: DlerSettings = {
  id: 1,
  working_days_mode: 'fixed_26',
  fixed_working_days: 26,
  standard_hours_per_day: 8,
  normal_ot_multiplier: 1.5,
  sunday_ot_multiplier: 2.0,
  holiday_ot_multiplier: 3.0,
  include_base_on_sunday_holiday: false,
  erp_sync_url: null,
  ot_sync_mode: 'manual',
}

export default async function DlerConfigPage() {
  const { supabase } = await guardDlerPage(['admin'])

  const [settingsRes, facRes, deptRes, projRes, holRes] = await Promise.all([
    supabase.from('dler_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('dler_factories').select('*').order('name'),
    supabase.from('dler_departments').select('*').order('sort_order').order('name'),
    supabase.from('dler_projects').select('*').order('name'),
    supabase.from('dler_holidays').select('*').order('date'),
  ])

  if (facRes.error) throw facRes.error
  if (deptRes.error) throw deptRes.error
  if (projRes.error) throw projRes.error
  if (holRes.error) throw holRes.error

  return (
    <ConfigClient
      settings={(settingsRes.data as DlerSettings | null) ?? DEFAULT_SETTINGS}
      factories={(facRes.data ?? []) as DlerFactory[]}
      departments={(deptRes.data ?? []) as DlerDepartment[]}
      projects={(projRes.data ?? []) as DlerProject[]}
      holidays={(holRes.data ?? []) as { id: number; date: string; label: string }[]}
    />
  )
}
