'use server'

import { revalidatePath } from 'next/cache'
import { requireMeetingsManager } from '../guard'
import type { GrowthPlanContent } from '@/lib/meetings'

const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const list = (v: unknown) => (Array.isArray(v) ? v.map(x => str(x, 1000)).filter(Boolean).slice(0, 50) : [])
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

// The whole document is rebuilt from known fields, so unexpected keys sent by
// a client never reach the database.
export async function saveGrowthPlan(input: GrowthPlanContent) {
  const { supabase, user } = await requireMeetingsManager()
  const content: GrowthPlanContent = {
    what: str(input.what),
    how: str(input.how),
    why: str(input.why),
    five_year_vision: str(input.five_year_vision),
    marketing: {
      ideal_client: str(input.marketing?.ideal_client),
      differentiators: list(input.marketing?.differentiators),
      proven_process: str(input.marketing?.proven_process),
      guarantee: str(input.marketing?.guarantee),
    },
    three_year: { date: date(input.three_year?.date), goals: list(input.three_year?.goals), possibilities: list(input.three_year?.possibilities) },
    one_year: { date: date(input.one_year?.date), goals: list(input.one_year?.goals), annual_goals: list(input.one_year?.annual_goals) },
    ninety_day: { date: date(input.ninety_day?.date), goals: list(input.ninety_day?.goals) },
  }
  const { data, error } = await supabase
    .from('mtg_growth_plan')
    .update({ content, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', 1)
    .select('updated_at')
    .single()
  if (error) throw error
  revalidatePath('/meetings/growth-plan')
  return { content, updated_at: data.updated_at as string }
}
