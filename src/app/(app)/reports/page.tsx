export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabase/server'
import { PrintButton } from '@/components/PrintButton'

export default async function ReportsPage() {
  const supabase = await createClient()

  // Fetch all required data for the professional report
  const [txRes, stRes, pTypesRes, projRes, sizesRes] = await Promise.all([
    supabase.from('transactions').select('quantity, type, transaction_date, project_id, project_type_id, size_id'),
    supabase.from('stock_takes').select('variance, stock_take_date, project_type_id, size_id, physical_count, system_balance'),
    supabase.from('project_types').select('id, name'),
    supabase.from('projects').select('id, name, project_type_id'),
    supabase.from('rebar_sizes').select('id, size')
  ])

  const transactions = txRes.data || []
  const stockTakes = stRes.data || []
  const projectTypes = pTypesRes.data || []
  const projects = projRes.data || []
  const sizes = sizesRes.data || []

  // Global Report Metrics
  let totalIncoming = 0
  let totalUsage = 0
  let totalWastage = 0 // from transactions explicitly labeled as wastage
  let totalVariance = 0 // from stock takes

  transactions.forEach(tx => {
    if (tx.type === 'incoming') totalIncoming += Number(tx.quantity)
    if (tx.type === 'usage') totalUsage += Math.abs(Number(tx.quantity))
    if (tx.type === 'wastage') totalWastage += Math.abs(Number(tx.quantity))
  })

  stockTakes.forEach(st => {
    totalVariance += Number(st.variance)
  })

  // The actual loss is Explicit Wastage + Negative Variance
  const absoluteLoss = totalWastage + Math.abs(totalVariance < 0 ? totalVariance : 0)
  const lossPercentage = totalUsage > 0 ? (absoluteLoss / totalUsage) * 100 : 0

  // Project Type Level Analysis
  const projectStats = projectTypes.map(pt => {
    // Get all project IDs of this type for usage/suspended
    const pIds = projects.filter(p => p.project_type_id === pt.id).map(p => p.id)
    
    // Txs belong to this type if they are directly assigned to the type OR assigned to a project of this type
    const pTxs = transactions.filter(t => t.project_type_id === pt.id || (t.project_id && pIds.includes(t.project_id)))
    const pSts = stockTakes.filter(t => t.project_type_id === pt.id)

    let incoming = 0
    let usage = 0
    let wastage = 0
    let variance = 0

    pTxs.forEach(tx => {
      if (tx.type === 'incoming') incoming += Number(tx.quantity)
      if (tx.type === 'usage') usage += Math.abs(Number(tx.quantity))
      if (tx.type === 'wastage') wastage += Math.abs(Number(tx.quantity))
    })

    pSts.forEach(st => {
      variance += Number(st.variance)
    })

    const loss = wastage + Math.abs(variance < 0 ? variance : 0)
    const lossPct = usage > 0 ? (loss / usage) * 100 : 0
    return {
      type: pt.name,
      incoming,
      usage,
      wastage,
      variance,
      loss,
      lossPct
    }
  }).sort((a, b) => b.lossPct - a.lossPct) // Sort by highest loss percentage

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8 print:hidden">
        <h1 className="text-3xl font-bold">Executive Rebar Report</h1>
        <PrintButton />
      </div>

      <div className="hidden print:block mb-8 text-center">
        <h1 className="text-3xl font-bold">Executive Rebar Report</h1>
        <p className="text-gray-500">Generated on {new Date().toLocaleDateString()}</p>
      </div>

      {/* Professional Input / Summary */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-md mb-8">
        <h2 className="text-xl font-bold mb-4 text-slate-200 border-b border-slate-700 pb-2">Professional Audit Summary</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div>
            <p className="text-slate-400 text-sm font-medium">Total Incoming</p>
            <p className="text-3xl font-bold">{totalIncoming.toFixed(2)} T</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">Total Usage</p>
            <p className="text-3xl font-bold">{totalUsage.toFixed(2)} T</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">Total Loss (Wastage + Variance)</p>
            <p className="text-3xl font-bold text-red-400">{absoluteLoss.toFixed(2)} T</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">Site Loss Ratio</p>
            <p className={`text-3xl font-bold ${lossPercentage > 5 ? 'text-red-500' : 'text-green-400'}`}>
              {lossPercentage.toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-6 bg-slate-800 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Audit Note:</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            Industry standard for rebar wastage is generally targeted below <strong>5%</strong>. 
            {lossPercentage > 5 
              ? " The current site loss ratio exceeds the threshold. Immediate intervention is recommended to audit cutting schedules, check for unauthorized site removal, and review steel fixer efficiency." 
              : " The current site loss ratio is within acceptable tolerances. Maintain current site supervision and material control protocols."}
          </p>
        </div>
      </div>

      {/* Project Breakdown */}
      <h2 className="text-2xl font-bold mb-4">Project Breakdown (Ranked by Loss %)</h2>
      <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-8">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Incoming (T)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage (T)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loss (T)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loss Ratio</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {projectStats.map((p) => (
              <tr key={p.type}>
                <td className="px-6 py-4 font-bold text-slate-700">{p.type}</td>
                <td className="px-6 py-4 text-slate-600">{p.incoming.toFixed(2)}</td>
                <td className="px-6 py-4 text-slate-600">{p.usage.toFixed(2)}</td>
                <td className="px-6 py-4 text-red-600 font-medium">{p.loss.toFixed(2)}</td>
                <td className={`px-6 py-4 font-bold ${p.lossPct > 5 ? 'text-red-500' : 'text-green-600'}`}>
                    {p.lossPct.toFixed(2)}%
                </td>
              </tr>
            ))}
            {projectStats.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-gray-500">No projects data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  )
}
