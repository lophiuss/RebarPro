import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { streamFromDrive, type DriveSubfolder } from '@/lib/google-drive'
import { driveFileResponse } from '@/lib/driveResponse'
import { NextResponse } from 'next/server'

// Proxies a maintenance-department file (photo evidence, equipment user
// manuals) out of Google Drive — gated by has_dept_access('maintenance')
// AND strictly constrained to the maintenance subfolder to prevent IDOR.
const MAINTENANCE_SUBFOLDERS: DriveSubfolder[] = ['maintenance']

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'maintenance' })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  try {
    const { stream, mimeType } = await streamFromDrive(fileId, MAINTENANCE_SUBFOLDERS)
    return driveFileResponse(stream, mimeType)
  } catch (err: any) {
    return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 })
  }
}
