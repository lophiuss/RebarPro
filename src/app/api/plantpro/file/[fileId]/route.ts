import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { streamFromDrive, type DriveSubfolder } from '@/lib/google-drive'
import { driveFileResponse } from '@/lib/driveResponse'
import { NextResponse } from 'next/server'

// Proxies a plantpro (HR) document out of Google Drive — gated by
// has_dept_access('plantpro') AND strictly scoped to the 'hr' subfolder.
const HR_SUBFOLDERS: DriveSubfolder[] = ['hr']

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: hasAccess } = await supabase.rpc('has_dept_access', { dept: 'plantpro' })
  if (!hasAccess) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  try {
    const { stream, mimeType } = await streamFromDrive(fileId, HR_SUBFOLDERS)
    return driveFileResponse(stream, mimeType)
  } catch (err: any) {
    return NextResponse.json({ error: 'File not found or access denied' }, { status: 404 })
  }
}
