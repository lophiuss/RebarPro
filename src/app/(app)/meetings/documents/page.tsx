export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/supabase/user'
import { FileText } from 'lucide-react'
import DocumentsView from './DocumentsView'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const user = await getSignedInUser(supabase)

  const [{ data: docs }, { data: meetings }, { data: people }, { data: access }, { data: boards }] = await Promise.all([
    supabase.from('mtg_documents').select('id, title, description, url, category, meeting_id, created_by, created_at, file_name, file_size, mime_type, file_path, department').order('created_at', { ascending: false }),
    supabase.from('mtg_meetings').select('id, name').eq('is_archived', false).order('name'),
    supabase.from('profiles').select('id, full_name').neq('is_active', false),
    user ? supabase.from('user_department_access').select('role').eq('user_id', user.id).eq('department', 'meetings').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('mtg_whiteboards').select('id, title, meeting_id, created_by, created_at, updated_at').order('updated_at', { ascending: false }),
  ])
  const role = access?.role as string | undefined

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-1 flex items-center gap-2"><FileText className="w-7 h-7 text-blue-600" /> Documents</h1>
      <p className="text-sm text-gray-500 mb-6">Everything is filed for you: by meeting, by department, and under your own documents. Upload files, save links or start a whiteboard.</p>
      <DocumentsView
        docs={(docs ?? []) as any}
        boards={(boards ?? []) as any}
        meetings={meetings ?? []}
        people={Object.fromEntries((people ?? []).map(p => [p.id as string, (p.full_name as string) ?? '']))}
        myId={user?.id ?? ''}
        isManager={role === 'admin' || role === 'manager'}
      />
    </div>
  )
}
