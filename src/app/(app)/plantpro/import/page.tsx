export const dynamic = 'force-dynamic'
export const revalidate = 0

import { FileUp } from 'lucide-react'
import ImportClient from './ImportClient'

export default function PlantproImportPage() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 flex items-center gap-2"><FileUp className="w-7 h-7 text-indigo-600" /> Import Timecard &amp; Worker Details</h1>
      <ImportClient />
    </div>
  )
}
