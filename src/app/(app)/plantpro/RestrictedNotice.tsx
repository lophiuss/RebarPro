import { Lock } from 'lucide-react'

export default function RestrictedNotice({ what }: { what: string }) {
  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto">
      <div className="bg-white border rounded-xl shadow-sm p-8 text-center">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <h1 className="text-lg font-bold text-slate-800 mb-1">Restricted</h1>
        <p className="text-sm text-gray-500">{what} contains salary information and is only available to HR and admin users.</p>
      </div>
    </div>
  )
}
