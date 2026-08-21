'use client'

import React from 'react'
import { Download } from 'lucide-react'
import { fmtQtyNum, unitLabel, type DefaultUnit } from '@/lib/utils/unit'

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
  unit?: DefaultUnit
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
  projectUsage,
  unit = 'kg'
}: Props) {
  const uLabel = unitLabel(unit)

  function exportReport() {
    const lines: string[] = []

    const typeSuffix = projectTypeName ? ` - [PROJECT TYPE: ${projectTypeName.toUpperCase()}]` : ' - [ALL PROJECT TYPES]'

    // 1. Title & Header
    lines.push(`"REBARPRO MONTHLY INVENTORY REPORT - ${monthName.toUpperCase()}${typeSuffix}"`)
    lines.push(`"Generated on: ${new Date().toLocaleString()}"`)
    lines.push(`"Unit: ${uLabel.toUpperCase()}"`)
    lines.push('')

    // 2. Executive Summary KPIs
    lines.push('"EXECUTIVE SUMMARY"')
    lines.push(`"Opening Balance (${uLabel})","Incoming (${uLabel})","Usage (${uLabel})","Total Wastage (${uLabel})","Wastage %","Expected Closing (${uLabel})","Total Variance (${uLabel})","Variance %"`)
    const totalVarPct = totals.usage > 0 ? ((totals.variance / totals.usage) * 100).toFixed(1) + '%' : '0.0%'
    const totalWastePct = totals.usage > 0 ? ((totals.wastage / totals.usage) * 100).toFixed(1) + '%' : '0.0%'
    lines.push(`"${fmtQtyNum(totals.opening, unit)}","${fmtQtyNum(totals.incoming, unit)}","${fmtQtyNum(totals.usage, unit)}","${fmtQtyNum(totals.wastage, unit)}","${totalWastePct}","${fmtQtyNum(totals.expectedClosing, unit)}","${totals.variance > 0 ? '+' : ''}${fmtQtyNum(totals.variance, unit)}","${totalVarPct}"`)
    lines.push('')

    // 3. Breakdown by Rebar Size Table
    lines.push('"BREAKDOWN BY REBAR SIZE"')
    lines.push(`"Size","Opening (${uLabel})","Incoming (${uLabel})","Transfer Net (${uLabel})","Usage (${uLabel})","Net Suspended (${uLabel})","Wastage (${uLabel})","Wastage %","Expected Closing (${uLabel})","ST Physical (${uLabel})","Variance (${uLabel})","Variance %"`)
    
    sizeRows.forEach(r => {
      const varPctStr = r.variance === null ? '-' : (r.usage > 0 ? ((r.variance / r.usage) * 100).toFixed(1) + '%' : '0.0%')
      const wastePctStr = r.wastage > 0 ? r.wastagePct.toFixed(1) + '%' : '-'
      lines.push([
        `"${r.size}"`,
        `"${fmtQtyNum(r.opening, unit)}"`,
        `"${fmtQtyNum(r.incoming, unit)}"`,
        `"${r.transfer > 0 ? '+' : ''}${fmtQtyNum(r.transfer, unit)}"`,
        `"${fmtQtyNum(r.usage, unit)}"`,
        `"${fmtQtyNum(r.suspended, unit)}"`,
        `"${fmtQtyNum(r.wastage, unit)}"`,
        `"${wastePctStr}"`,
        `"${fmtQtyNum(r.expectedClosing, unit)}"`,
        `"${r.hasStockTake ? fmtQtyNum(r.stPhysical, unit) : 'No ST'}"`,
        `"${r.variance === null ? '-' : (r.variance > 0 ? '+' : '') + fmtQtyNum(r.variance, unit)}"`,
        `"${varPctStr}"`
      ].join(','))
    })

    if (unassignedWastageQty > 0) {
      lines.push(`"Overall Scrap (Combined)","-","-","-","-","-","${fmtQtyNum(unassignedWastageQty, unit)}","-","-${fmtQtyNum(unassignedWastageQty, unit)}","-","-","-"`)
    }

    // Totals line
    lines.push([
      '"TOTAL"',
      `"${fmtQtyNum(totals.opening, unit)}"`,
      `"${fmtQtyNum(totals.incoming, unit)}"`,
      `"${totals.transfer > 0 ? '+' : ''}${fmtQtyNum(totals.transfer, unit)}"`,
      `"${fmtQtyNum(totals.usage, unit)}"`,
      `"${fmtQtyNum(totals.suspended, unit)}"`,
      `"${fmtQtyNum(totals.wastage, unit)}"`,
      `"${totalWastePct}"`,
      `"${fmtQtyNum(totals.expectedClosing, unit)}"`,
      '""',
      `"${totals.variance > 0 ? '+' : ''}${fmtQtyNum(totals.variance, unit)}"`,
      `"${totalVarPct}"`
    ].join(','))
    lines.push('')

    // 4. Stock Takes This Month
    if (stockTakes.length > 0) {
      lines.push('"STOCK TAKES RECORDED THIS MONTH"')
      lines.push(`"Date","Project Type","Size","Physical Count (${uLabel})","System Balance (${uLabel})","Variance (${uLabel})"`)
      stockTakes.forEach((st: any) => {
        const pTypeName = st.project_types?.name || (st.project_type_id ? 'Unknown Type' : 'Unassigned')
        const phys = Number(st.physical_count)
        const sys = Number(st.system_balance)
        const v = Number(st.variance)
        lines.push([
          `"${st.stock_take_date}"`,
          `"${pTypeName}"`,
          `"${st.rebar_sizes?.size || st.size || '-'}"`,
          `"${fmtQtyNum(phys, unit)}"`,
          `"${fmtQtyNum(sys, unit)}"`,
          `"${v > 0 ? '+' : ''}${fmtQtyNum(v, unit)}"`
        ].join(','))
      })
      lines.push('')
    }

    // 5. Activity by Project Type
    lines.push('"ACTIVITY BY PROJECT TYPE"')
    lines.push(`"Project Type","Incoming (${uLabel})","Usage (${uLabel})","Transfer Net (${uLabel})","Wastage (${uLabel})"`)
    Object.values(typeUsage).forEach((row: any) => {
      const netTrans = (row.transferIn || 0) - (row.transferOut || 0)
      lines.push([
        `"${row.name}"`,
        `"${fmtQtyNum(row.incoming, unit)}"`,
        `"${fmtQtyNum(row.usage, unit)}"`,
        `"${netTrans > 0 ? '+' : ''}${fmtQtyNum(netTrans, unit)}"`,
        `"${fmtQtyNum(row.wastage, unit)}"`
      ].join(','))
    })
    lines.push('')

    // 6. Usage & Suspension by Project
    lines.push('"USAGE & SUSPENSION BY PROJECT"')
    lines.push(`"Project Name","Project Type","Usage (${uLabel})","Suspended (${uLabel})"`)
    Object.values(projectUsage).forEach((row: any) => {
      lines.push([
        `"${row.name}"`,
        `"${row.typeName}"`,
        `"${fmtQtyNum(row.usage, unit)}"`,
        `"${fmtQtyNum(row.suspended, unit)}"`
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
