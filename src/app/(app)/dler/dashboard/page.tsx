import { guardDlerPage } from '../guard'
import { getDlerDashboardData } from '../actions'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

function todayMalaysia(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })
}

export default async function DlerDashboardPage(props: {
  searchParams: Promise<{ month?: string; date?: string }>
}) {
  await guardDlerPage(['admin', 'viewer'])
  const sp = await props.searchParams

  const today = todayMalaysia()
  const rawDate = typeof sp?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null
  const rawMonth = typeof sp?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null

  const month = rawMonth ?? (rawDate ? rawDate.slice(0, 7) : today.slice(0, 7))
  const selectedDate =
    rawDate && rawDate.startsWith(month)
      ? rawDate
      : today.startsWith(month)
      ? today
      : `${month}-01`

  const initialData = await getDlerDashboardData(month, selectedDate)

  return <DashboardClient initialData={initialData} />
}
