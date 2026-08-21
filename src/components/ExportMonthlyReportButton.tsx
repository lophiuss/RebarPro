'use client'

import React from 'react'
import { Download } from 'lucide-react'

interface Props {
  monthName: string
  selectedMonth: string
  projectTypeName?: string
  totals: any
  sizeRows: any[]
  unassignedWastageQty: number
  stockTakes: any[]
  typeUsage: Record<string, any>
  projectUsage: Record<string, any>
}

export default function ExportMonthlyReportButton({
  monthName,
  selectedMonth,
  projectTypeName,
  totals,
  sizeRows,
  unassignedWastageQty,
  stockTakes,
  typeUsage,
  projectUsage
}: Props) {
  function exportReport() {
    const lines: string[] = []

    const typeSuffix = projectTypeName ? ` - [PROJECT TYPE: ${projectTypeName.toUpperCase()}]` : ' - [ALL PROJECT TYPES]'

    // 1. Title & Header
    lines.push(`"REBARPRO MONTHLY INVENTORY REPORT - ${monthName.toUpperCase()}${typeSuffix}"`)
    lines.push(`"Generated on: ${new Date().toLocaleString()}"`)
    lines.push('')

    // 2. Executive Summary KPIs
    lines.push('"EXECUTIVE SUMMARY"')
    lines.push('"Opening Balance (T)","Incoming (T)","Usage (T)","Total Wastage (T)","Wastage %","Expected Closing (T)","Total Variance (T)","Variance %"')
    const totalVarPct = totals.usage > 0 ? ((totals.variance / totals.usage) * 100).toFixed(1) + '%' : '0.0%'
    const totalWastePct = totals.usage > 0 ? ((totals.wastage / totals.usage) * 100).toFixed(1) + '%' : '0.0%'
    lines.push(`"${totals.opening.toFixed(2)}","${totals.incoming.toFixed(2)}","${totals.usage.toFixed(2)}","${totals.wastage.toFixed(2)}","${totalWastePct}","${totals.expectedClosing.toFixed(2)}","${totals.variance > 0 ? '+' : ''}${totals.variance.toFixed(2)}","${totalVarPct}"`)
    lines.push('')

    // 3. Breakdown by Rebar Size Table
    lines.push('"BREAKDOWN BY REBAR SIZE"')
    lines.push('"Size","Opening (T)","Incoming (T)","Transfer Net (T)","Usage (T)","Net Suspended (T)","Wastage (T)","Wastage %","Expected Closing (T)","ST Physical (T)","Variance (T)","Variance %"')
    
    sizeRows.forEach(r => {
      const varPctStr = r.variance === null ? '-' : (r.usage > 0 ? ((r.variance / r.usage) * 100).toFixed(1) + '%' : '0.0%')
      const wastePctStr = r.wastage > 0 ? r.wastagePct.toFixed(1) + '%' : '-'
      lines.push([
        `"${r.size}"`,
        `"${r.opening.toFixed(2)}"`,
        `"${r.incoming.toFixed(2)}"`,
        `"${r.transfer > 0 ? '+' : ''}${r.transfer.toFixed(2)}"`,
        `"${r.usage.toFixed(2)}"`,
        `"${r.suspended.toFixed(2)}"`,
        `"${r.wastage.toFixed(2)}"`,
        `"${wastePctStr}"`,
        `"${r.expectedClosing.toFixed(2)}"`,
        `"${r.hasStockTake ? r.stPhysical?.toFixed(2) : 'No ST'}"`,
        `"${r.variance === null ? '-' : (r.variance > 0 ? '+' : '') + r.variance.toFixed(2)}"`,
        `"${varPctStr}"`
      ].join(','))
    })

    if (unassignedWastageQty > 0) {
      lines.push(`"Overall Scrap (Combined)","-","-","-","-","-","${unassignedWastageQty.toFixed(2)}","-","-${unassignedWastageQty.toFixed(2)}","-","-","-"`)
    }

    // Totals line
    lines.push([
      '"TOTAL"',
      `"${totals.opening.toFixed(2)}"`,
      `"${totals.incoming.toFixed(2)}"`,
      `"${totals.transfer > 0 ? '+' : ''}${totals.transfer.toFixed(2)}"`,
      `"${totals.usage.toFixed(2)}"`,
      `"${totals.suspended.toFixed(2)}"`,
      `"${totals.wastage.toFixed(2)}"`,
      `"${totalWastePct}"`,
      `"${totals.expectedClosing.toFixed(2)}"`,
      '""',
      `"${totals.variance > 0 ? '+' : ''}${totals.variance.toFixed(2)}"`,
      `"${totalVarPct}"`
    ].join(','))
    lines.push('')

    // 4. Stock Takes This Month
    if (stockTakes.length > 0) {
      lines.push('"STOCK TAKES RECORDED THIS MONTH"')
      lines.push('"Date","Project Type","Size","Physical Count (T)","System Balance (T)","Variance (T)"')
      stockTakes.forEach((st: any) => {
        const pTypeName = st.project_types?.name || (st.project_type_id ? 'Unknown Type' : 'Unassigned')
        lines.push([
          `"${st.stock_take_date}"`,
          `"${pTypeName}"`,
          `"${st.rebar_sizes?.size || st.size || '-'}"`,
          `"${Number(st.physical_count).toFixed(2)}"`,
          `"${Number(st.system_balance).toFixed(2)}"`,
          `"${Number(st.variance) > 0 ? '+' : ''}${Number(st.variance).toFixed(2)}"`
        ].join(','))
      })
      lines.push('')
    }

    // 5. Activity by Project Type
    lines.push('"ACTIVITY BY PROJECT TYPE"')
    lines.push('"Project Type","Incoming (T)","Usage (T)","Transfer Net (T)","Wastage (T)"')
    Object.values(typeUsage).forEach((row: any) => {
      const netTrans = (row.transferIn || 0) - (row.transferOut || 0)
      lines.push([
        `"${row.name}"`,
        `"${row.incoming.toFixed(2)}"`,
        `"${row.usage.toFixed(2)}"`,
        `"${netTrans > 0 ? '+' : ''}${netTrans.toFixed(2)}"`,
        `"${row.wastage.toFixed(2)}"`
      ].join(','))
    })
    lines.push('')

    // 6. Usage & Suspension by Project
    lines.push('"USAGE & SUSPENSION BY PROJECT"')
    lines.push('"Project Name","Project Type","Usage (T)","Suspended (T)"')
    Object.values(projectUsage).forEach((row: any) => {
      lines.push([
        `"${row.name}"`,
        `"${row.typeName}"`,
        `"${row.usage.toFixed(2)}"`,
        `"${row.suspended.toFixed(2)}"`
      ].join(','))
    })

    // Create & Trigger Download
    const csvContent = lines.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const safeTypeName = projectTypeName ? `_${projectTypeName.replace(/\s+/g, '_')}` : ''
    link.setAttribute('download', `RebarPro_Monthly_Report_${selectedMonth}${safeTypeName}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={exportReport}
      className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-xs"
      title="Download complete detailed monthly report spreadsheet"
    >
      <Download className="w-4 h-4" />
      <span>Export Excel</span>
    </button>
  )
}
