'use client'

import React, { useState } from 'react'
import { Target, ChevronLeft, ChevronRight, Save, Copy, Check } from 'lucide-react'
import { upsertQaqcTarget } from '../actions'

export type TargetRow = {
  id?: number
  project: string
  month: string
  test_count_target: number
  spend_target: number
}

interface Props {
  projects: string[]
  targets: TargetRow[]
}

function shiftMonth(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function TargetsClient({ projects, targets }: Props) {
  const currentMonthDefault = new Date().toISOString().slice(0, 7)
  const [selectedMonth, setSelectedMonth] = useState(currentMonthDefault)
  const [formValues, setFormValues] = useState<Record<string, { count: string; spend: string }>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [copiedSuccess, setCopiedSuccess] = useState(false)

  // Prepopulate form values based on selectedMonth
  const getVal = (proj: string) => {
    if (formValues[proj] !== undefined) return formValues[proj]
    const found = targets.find(t => t.project === proj && t.month === selectedMonth)
    return {
      count: found?.test_count_target ? String(found.test_count_target) : '',
      spend: found?.spend_target ? String(found.spend_target) : '',
    }
  }

  const handleSave = async (proj: string) => {
    const val = getVal(proj)
    setSavingKey(proj)
    try {
      await upsertQaqcTarget(
        proj,
        selectedMonth,
        Number(val.count) || 0,
        Number(val.spend) || 0
      )
    } catch (err: any) {
      alert('Save failed: ' + err.message)
    } finally {
      setSavingKey(null)
    }
  }

  const handleCopyPrevious = async () => {
    const prevMonth = shiftMonth(selectedMonth, -1)
    const prevTargets = targets.filter(t => t.month === prevMonth)
    if (!prevTargets.length) {
      alert(`No targets found in previous month (${monthLabel(prevMonth)}) to copy.`)
      return
    }

    try {
      for (const pt of prevTargets) {
        await upsertQaqcTarget(pt.project, selectedMonth, pt.test_count_target, pt.spend_target)
      }
      setCopiedSuccess(true)
      setTimeout(() => setCopiedSuccess(false), 2500)
      window.location.reload()
    } catch (err: any) {
      alert('Copy failed: ' + err.message)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-6">
      {/* Month Navigation & Copy Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setSelectedMonth(m => shiftMonth(m, -1)); setFormValues({}) }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => { e.target.value && setSelectedMonth(e.target.value); setFormValues({}) }}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold bg-white text-slate-800"
          />
          <button
            onClick={() => { setSelectedMonth(m => shiftMonth(m, 1)); setFormValues({}) }}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <span className="text-xs font-semibold text-slate-500 ml-2">
            Targets for {monthLabel(selectedMonth)}
          </span>
        </div>

        <button
          onClick={handleCopyPrevious}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl transition"
        >
          {copiedSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
          {copiedSuccess ? 'Copied Successfully!' : `Copy Targets from ${monthLabel(shiftMonth(selectedMonth, -1))}`}
        </button>
      </div>

      {/* Target Setting Table */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b text-[11px] uppercase font-bold text-slate-600">
            <tr>
              <th className="py-3 px-4">Project</th>
              <th className="py-3 px-4 w-48 text-center">Test Count Target</th>
              <th className="py-3 px-4 w-60 text-right">Spend Budget Target (RM)</th>
              <th className="py-3 px-4 w-28 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {projects.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-400">
                  No projects available. Ensure projects are created in PlantPro/Settings.
                </td>
              </tr>
            ) : (
              projects.map(proj => {
                const current = getVal(proj)
                const isSaving = savingKey === proj

                return (
                  <tr key={proj} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-semibold text-slate-800">{proj}</td>
                    <td className="py-3 px-4 text-center">
                      <input
                        type="number"
                        min="0"
                        value={current.count}
                        onChange={e => {
                          setFormValues(prev => ({
                            ...prev,
                            [proj]: { ...current, count: e.target.value },
                          }))
                        }}
                        placeholder="e.g. 50"
                        className="w-28 text-center border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold bg-white"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-slate-400">RM</span>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={current.spend}
                          onChange={e => {
                            setFormValues(prev => ({
                              ...prev,
                              [proj]: { ...current, spend: e.target.value },
                            }))
                          }}
                          placeholder="0.00"
                          className="w-36 text-right border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold bg-white"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleSave(proj)}
                        disabled={isSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1 rounded-lg text-xs font-semibold transition"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
