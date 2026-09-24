export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { FolderClock } from 'lucide-react'
import DocumentsClient from './DocumentsClient'

export default async function PlantproDocumentsPage() {
  const supabase = await createClient()

  const [
    { data: documentTypes }, { data: documents }, { data: workers }, { data: hostels },
  ] = await Promise.all([
    supabase.from('plantpro_document_types').select('*').order('name'),
    supabase.from('plantpro_documents').select('*').order('uploaded_at', { ascending: false }),
    supabase.from('plantpro_workers').select('id, worker_no, name, line').neq('status', 'Inactive').order('name'),
    supabase.from('plantpro_hostels').select('id, name').order('name'),
  ])

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><FolderClock className="w-7 h-7 text-indigo-600" /> Document Tracker</h1>
      <DocumentsClient
        documentTypes={documentTypes || []}
        documents={documents || []}
        workers={workers || []}
        hostels={hostels || []}
      />
    </div>
  )
}
