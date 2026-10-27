import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { streamFromDrive, type DriveSubfolder } from '@/lib/google-drive'
import { NextResponse } from 'next/server'

// Serves a Meetings document out of Google Drive. The document row is read with the signed-in person's
// own session, so the same rules as the Documents list apply: you only get the file if you can see it
// (meeting attendees, or any Meetings user for documents with no meeting). A raw Drive link never works.
const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MEETINGS_SUBFOLDERS: DriveSubfolder[] = ['meetings']

export async function GET(_req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: doc } = await supabase.from('mtg_documents').select('file_name, mime_type').eq('file_path', `drive:${fileId}`).maybeSingle()
  if (!doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  try {
    const { stream } = await streamFromDrive(fileId, MEETINGS_SUBFOLDERS)
    const inline = INLINE_TYPES.includes(doc.mime_type ?? '')
    const name = encodeURIComponent(doc.file_name ?? 'document')
    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        'Content-Type': inline ? (doc.mime_type as string) : 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
