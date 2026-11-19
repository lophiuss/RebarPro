import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { syncCastcoreM3Range } from '@/lib/dler-castcore'

// Daily Castcore casting m3 sync (Vercel Cron, see vercel.json: 22:30 UTC = 06:30 MYT).
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = req.headers.get('authorization') ?? ''
  const want = `Bearer ${secret}`
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

function shiftUtcDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawDays = Number.parseInt(url.searchParams.get('days') ?? '7', 10)
  const days = Number.isFinite(rawDays) ? Math.min(31, Math.max(1, rawDays)) : 7

  const endDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date())
  const startDate = shiftUtcDays(endDate, -(days - 1))

  try {
    const result = await syncCastcoreM3Range({
      startDate,
      endDate,
      overwriteManual: false,
      updatedBy: null,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500)
    console.error('[dler-castcore-sync] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
