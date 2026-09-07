'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMaintenanceFile } from '../../actions'
import { Upload, FileText } from 'lucide-react'

export default function ManualUpload({ equipmentId, manualDriveId }: { equipmentId: number; manualDriveId: string | null }) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [driveId, setDriveId] = useState(manualDriveId)

  async function onFile(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const id = await uploadMaintenanceFile(fd)
      const { error } = await supabase.from('maintenance_equipment').update({ manual_drive_id: id }).eq('id', equipmentId)
      if (error) throw error
      setDriveId(id)
    } catch (err: any) {
      alert('Error uploading manual: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {driveId ? (
        <a href={`/api/maintenance/file/${driveId}`} target="_blank" className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <FileText className="w-4 h-4" /> View User Manual
        </a>
      ) : (
        <span className="text-sm text-gray-400 italic">No manual uploaded</span>
      )}
      <label className="flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 cursor-pointer">
        <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : driveId ? 'Replace' : 'Upload Manual (PDF)'}
        <input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={e => onFile(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  )
}
