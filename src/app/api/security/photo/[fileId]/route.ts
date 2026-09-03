import { createClient } from '@/lib/supabase/server'
import { streamFromDrive } from '@/lib/google-drive'
import { NextResponse } from 'next/server'

// Proxies a security-department photo out of Google Drive. Drive files are
// left at their default (private) sharing — this route is the only path to
// their bytes, gated the same way any other security_* row is (has_dept_access),
// so a photo is exactly as protected as the record it's attached to.
export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'security' })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  try {
    const { stream, mimeType } = await streamFromDrive(fileId)
    return new NextResponse(stream as any, {
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }
}
