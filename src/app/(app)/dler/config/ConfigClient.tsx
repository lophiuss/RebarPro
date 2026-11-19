'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Plus, Trash2, Save, CheckCircle2, AlertTriangle, X,
  Factory, Building2, FolderKanban, CalendarDays, CloudCog
} from 'lucide-react'
import type { DlerDepartment, DlerFactory, DlerProject, DlerSettings } from '@/lib/dler-math'
import {
  addDlerHoliday,
  deleteDlerDepartment,
  deleteDlerFactory,
  deleteDlerProject,
  removeDlerHoliday,
  saveDlerDepartment,
  saveDlerFactory,
  saveDlerProject,
  saveDlerSettings,
} from '../actions'

export default function ConfigClient({
  settings,
  factories,
  departments,
  projects,
  holidays,
}: {
  settings: DlerSettings
  factories: DlerFactory[]
  departments: DlerDepartment[]
  projects: DlerProject[]
  holidays: { id: number; date: string; label: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const [cfg, setCfg] = useState<DlerSettings>(settings)
  const [newFactory, setNewFactory] = useState('')
  const [newDept, setNewDept] = useState({ name: '', factory_id: String(factories[0]?.id ?? ''), kind: 'production' as 'production' | 'support', sort_order: '0' })
  const [newProj, setNewProj] = useState({ name: '', factory_id: String(factories[0]?.id ?? ''), department_id: '', erp_code: '' })
  const [newHol, setNewHol] = useState({ date: '', label: '' })

  function run(fn: () => Promise<void>, okText: string) {
    setFeedback(null)
    startTransition(async () => {
      try {
        await fn()
        setFeedback({ kind: 'ok', text: okText })
        router.refresh()
      } catch (err: any) {
        setFeedback({ kind: 'err', text: err?.message ?? 'Operation failed' })
      }
    })
  }

  return (
    <div className={`max-w-6xl mx-auto p-4 md:p-6 space-y-6 transition-opacity ${isPending ? 'opacity-70' : ''}`}>
      <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-xs">
        <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-600" />
          DLER Configuration &amp; Formula Settings
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage Factories, Departments, Projects, Working-Day &amp; OT Rules, Holidays, and Stage 2 ERP/OT Sync settings.
        </p>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-medium ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 1. Formula & Stage 2 Sync Settings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CloudCog className="w-4 h-4 text-teal-600" /> Daily Cost Rules &amp; Stage 2 Integrations
          </h2>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  saveDlerSettings({
                    working_days_mode: cfg.working_days_mode,
                    fixed_working_days: Number(cfg.fixed_working_days) || 26,
                    standard_hours_per_day: Number(cfg.standard_hours_per_day) || 8,
                    normal_ot_multiplier: Number(cfg.normal_ot_multiplier) || 1.5,
                    sunday_ot_multiplier: Number(cfg.sunday_ot_multiplier) || 2.0,
                    holiday_ot_multiplier: Number(cfg.holiday_ot_multiplier) || 3.0,
                    include_base_on_sunday_holiday: cfg.include_base_on_sunday_holiday,
                    erp_sync_url: cfg.erp_sync_url || null,
                    ot_sync_mode: cfg.ot_sync_mode,
                  }),
                'DLER formula & sync settings saved.'
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
          >
            <Save className="w-3.5 h-3.5" /> Save Settings
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="block">
            <span className="font-semibold text-slate-600">Working Days Mode</span>
            <select
              value={cfg.working_days_mode}
              onChange={e => setCfg({ ...cfg, working_days_mode: e.target.value as any })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="fixed_26">Fixed Working Days (e.g. 26)</option>
              <option value="weekdays_excl_holidays">Mon–Sat excl. Public Holidays</option>
              <option value="calendar_days">Total Calendar Days (30/31)</option>
            </select>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Fixed Working Days</span>
            <input
              type="number"
              value={cfg.fixed_working_days}
              onChange={e => setCfg({ ...cfg, fixed_working_days: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Standard Hours / Day</span>
            <input
              type="number"
              value={cfg.standard_hours_per_day}
              onChange={e => setCfg({ ...cfg, standard_hours_per_day: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Normal OT Multiplier</span>
            <input
              type="number"
              step="0.1"
              value={cfg.normal_ot_multiplier}
              onChange={e => setCfg({ ...cfg, normal_ot_multiplier: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Sunday OT Multiplier</span>
            <input
              type="number"
              step="0.1"
              value={cfg.sunday_ot_multiplier}
              onChange={e => setCfg({ ...cfg, sunday_ot_multiplier: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Holiday OT Multiplier</span>
            <input
              type="number"
              step="0.1"
              value={cfg.holiday_ot_multiplier}
              onChange={e => setCfg({ ...cfg, holiday_ot_multiplier: Number(e.target.value) })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Stage 2: OT Sync Mode</span>
            <select
              value={cfg.ot_sync_mode}
              onChange={e => setCfg({ ...cfg, ot_sync_mode: e.target.value as any })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="manual">Manual Input (+ 1-click HR Pull)</option>
              <option value="hr_timesheet">HR Timesheet Sync</option>
              <option value="external_api">External OT App API</option>
            </select>
          </label>
          <label className="block">
            <span className="font-semibold text-slate-600">Stage 2: ERP Endpoint URL</span>
            <input
              type="text"
              value={cfg.erp_sync_url ?? ''}
              placeholder="https://erp.company.internal/api/..."
              onChange={e => setCfg({ ...cfg, erp_sync_url: e.target.value })}
              className="mt-1 w-full border border-slate-300 rounded-lg px-2.5 py-2"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Castcore m³ sync uses server env vars (CASTCORE_API_HOST / KEY / COMPANY_ID) and runs daily at 06:30 MYT.
            </span>
          </label>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={cfg.include_base_on_sunday_holiday}
            onChange={e => setCfg({ ...cfg, include_base_on_sunday_holiday: e.target.checked })}
          />
          Include daily base salary cost on Sundays &amp; Public Holidays (if unchecked, Sundays/Holidays count OT cost only)
        </label>
      </div>

      {/* 2. Factories & Holidays */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Factory className="w-4 h-4 text-slate-700" /> Factories ({factories.length})
          </h2>
          <form
            onSubmit={e => {
              e.preventDefault()
              if (!newFactory.trim()) return
              run(() => saveDlerFactory(null, newFactory), 'Factory added.')
              setNewFactory('')
            }}
            className="flex gap-2"
          >
            <input
              value={newFactory}
              onChange={e => setNewFactory(e.target.value)}
              placeholder="New factory name..."
              className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-xs"
            />
            <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {factories.map(f => (
              <div key={f.id} className="flex items-center justify-between py-2 text-xs">
                <input
                  defaultValue={f.name}
                  onBlur={e => e.target.value.trim() && e.target.value.trim() !== f.name && run(() => saveDlerFactory(f.id, e.target.value), 'Factory renamed.')}
                  className="border border-slate-200 rounded px-2 py-1 font-medium"
                />
                <button
                  type="button"
                  onClick={() => confirm(`Delete factory ${f.name} and all its departments/projects?`) && run(() => deleteDlerFactory(f.id), 'Factory deleted.')}
                  className="text-rose-500 hover:text-rose-700 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-rose-600" /> Public Holidays ({holidays.length})
          </h2>
          <form
            onSubmit={e => {
              e.preventDefault()
              if (!newHol.date) return
              run(() => addDlerHoliday(newHol.date, newHol.label), 'Holiday added.')
              setNewHol({ date: '', label: '' })
            }}
            className="flex flex-wrap gap-2"
          >
            <input type="date" required value={newHol.date} onChange={e => setNewHol({ ...newHol, date: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" />
            <input value={newHol.label} onChange={e => setNewHol({ ...newHol, label: e.target.value })} placeholder="Holiday name..." className="flex-1 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs" />
            <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold">
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </form>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
            {holidays.map(h => (
              <div key={h.id} className="flex items-center justify-between py-1.5 text-xs">
                <div>
                  <span className="font-mono font-semibold text-slate-700 mr-2">{h.date}</span>
                  <span className="text-slate-600">{h.label}</span>
                </div>
                <button type="button" onClick={() => run(() => removeDlerHoliday(h.id), 'Holiday removed.')} className="text-rose-500 hover:text-rose-700 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Departments */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600" /> Departments ({departments.length})
        </h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (!newDept.name.trim() || !newDept.factory_id) return
            run(
              () =>
                saveDlerDepartment(null, {
                  name: newDept.name,
                  factory_id: Number(newDept.factory_id),
                  kind: newDept.kind,
                  sort_order: Number(newDept.sort_order) || 0,
                }),
              'Department added.'
            )
            setNewDept({ ...newDept, name: '' })
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} placeholder="New department name..." className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-52" />
          <select value={newDept.factory_id} onChange={e => setNewDept({ ...newDept, factory_id: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
            {factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select value={newDept.kind} onChange={e => setNewDept({ ...newDept, kind: e.target.value as any })} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
            <option value="production">Production</option>
            <option value="support">Support</option>
          </select>
          <input type="number" value={newDept.sort_order} onChange={e => setNewDept({ ...newDept, sort_order: e.target.value })} placeholder="Order" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-20" />
          <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Add Department
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] text-left">
                <th className="py-2">Name</th>
                <th className="py-2">Kind</th>
                <th className="py-2">Sort Order</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map(d => (
                <tr key={d.id}>
                  <td className="py-1.5">
                    <input
                      defaultValue={d.name}
                      onBlur={e =>
                        e.target.value.trim() &&
                        e.target.value.trim() !== d.name &&
                        run(() => saveDlerDepartment(d.id, { name: e.target.value, factory_id: d.factory_id, kind: d.kind, sort_order: d.sort_order }), 'Updated department.')
                      }
                      className="border border-slate-200 rounded px-2 py-1 font-medium"
                    />
                  </td>
                  <td className="py-1.5">
                    <select
                      value={d.kind}
                      onChange={e => run(() => saveDlerDepartment(d.id, { name: d.name, factory_id: d.factory_id, kind: e.target.value as any, sort_order: d.sort_order }), 'Updated department kind.')}
                      className="border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="production">Production</option>
                      <option value="support">Support</option>
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input
                      type="number"
                      defaultValue={d.sort_order}
                      onBlur={e => run(() => saveDlerDepartment(d.id, { name: d.name, factory_id: d.factory_id, kind: d.kind, sort_order: Number(e.target.value) || 0 }), 'Updated sort order.')}
                      className="border border-slate-200 rounded px-2 py-1 w-20"
                    />
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => confirm(`Delete department ${d.name}?`) && run(() => deleteDlerDepartment(d.id), 'Department deleted.')}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Projects */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-sky-600" /> Projects ({projects.length})
        </h2>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (!newProj.name.trim() || !newProj.factory_id) return
            run(
              () =>
                saveDlerProject(null, {
                  name: newProj.name,
                  factory_id: Number(newProj.factory_id),
                  department_id: newProj.department_id ? Number(newProj.department_id) : null,
                  status: 'Active',
                  erp_code: newProj.erp_code || null,
                }),
              'Project added.'
            )
            setNewProj({ ...newProj, name: '', erp_code: '' })
          }}
          className="flex flex-wrap gap-2"
        >
          <input value={newProj.name} onChange={e => setNewProj({ ...newProj, name: e.target.value })} placeholder="New project name..." className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs w-48" />
          <select value={newProj.department_id} onChange={e => setNewProj({ ...newProj, department_id: e.target.value })} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
            <option value="">No department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input value={newProj.erp_code} onChange={e => setNewProj({ ...newProj, erp_code: e.target.value })} placeholder="Castcore Code (e.g. P2407)" className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-44 font-mono" />
          <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold">
            <Plus className="w-3.5 h-3.5" /> Add Project
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[10px] text-left">
                <th className="py-2">Project Name</th>
                <th className="py-2">Department</th>
                <th className="py-2">Castcore ERP Code</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map(p => (
                <tr key={p.id} className={p.status === 'Inactive' ? 'opacity-50' : ''}>
                  <td className="py-1.5">
                    <input
                      defaultValue={p.name}
                      onBlur={e =>
                        e.target.value.trim() &&
                        e.target.value.trim() !== p.name &&
                        run(() => saveDlerProject(p.id, { name: e.target.value, factory_id: p.factory_id, department_id: p.department_id, status: p.status, erp_code: p.erp_code }), 'Updated project.')
                      }
                      className="border border-slate-200 rounded px-2 py-1 font-medium"
                    />
                  </td>
                  <td className="py-1.5">
                    <select
                      value={p.department_id ?? ''}
                      onChange={e =>
                        run(
                          () => saveDlerProject(p.id, { name: p.name, factory_id: p.factory_id, department_id: e.target.value ? Number(e.target.value) : null, status: p.status, erp_code: p.erp_code }),
                          'Updated project department.'
                        )
                      }
                      className="border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      <option value="">None</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <input
                      key={`erp-${p.id}-${p.erp_code ?? ''}`}
                      defaultValue={p.erp_code ?? ''}
                      placeholder="e.g. P2407"
                      onBlur={e =>
                        (e.target.value.trim() || '') !== (p.erp_code || '') &&
                        run(() => saveDlerProject(p.id, { name: p.name, factory_id: p.factory_id, department_id: p.department_id, status: p.status, erp_code: e.target.value.trim() || null }), 'Updated ERP code.')
                      }
                      className="border border-slate-200 rounded px-2 py-1 w-28 font-mono"
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => saveDlerProject(p.id, { name: p.name, factory_id: p.factory_id, department_id: p.department_id, status: p.status === 'Active' ? 'Inactive' : 'Active', erp_code: p.erp_code }),
                          'Updated project status.'
                        )
                      }
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${p.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {p.status}
                    </button>
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => confirm(`Delete project ${p.name}?`) && run(() => deleteDlerProject(p.id), 'Project deleted.')}
                      className="text-rose-500 hover:text-rose-700 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
