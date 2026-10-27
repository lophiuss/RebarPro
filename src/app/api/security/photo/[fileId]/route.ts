import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { streamFromDrive, type DriveSubfolder } from '@/lib/google-drive'
import { driveFileResponse } from '@/lib/driveResponse'
import { NextResponse } from 'next/server'

// Proxies a security-department photo out of Google Drive. Drive files are
// left at their default (private) sharing — this route is the only path to
// their bytes, gated by has_dept_access('security') AND strictly scoped
// to security subfolders to prevent IDOR attacks.
const SECURITY_SUBFOLDERS: DriveSubfolder[] = ['entries', 'incidents', 'layout', 'avatars', 'clocking']

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'security' })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  try {
    const { stream, mimeType } = await streamFromDrive(fileId, SECURITY_SUBFOLDERS)
    return driveFileResponse(stream, mimeType)
  } catch (err: any) {
    return NextResponse.json({ error: 'Photo not found or access denied' }, { status: 404 })
  }
}
