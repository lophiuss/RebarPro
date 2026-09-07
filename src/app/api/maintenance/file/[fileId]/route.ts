import { createClient } from '@/lib/supabase/server'
import { streamFromDrive } from '@/lib/google-drive'
import { NextResponse } from 'next/server'

// Proxies a maintenance-department file (photo evidence, equipment user
// manuals) out of Google Drive — same pattern as
// /api/security/photo/[fileId], gated the same way any other
// maintenance_* row is (has_dept_access).
export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'maintenance' })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  try {
    const { stream, mimeType } = await streamFromDrive(fileId)
    return new NextResponse(stream as any, {
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=86400, immutable' },
    })
  } catch (err: any) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
