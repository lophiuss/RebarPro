'use client'

import React, { useState } from 'react'
import { Beaker, Building2, Plus, Trash2, Edit3, Check, X, ShieldAlert } from 'lucide-react'
import {
  createQaqcTestType, updateQaqcTestType, deleteQaqcTestType,
  createQaqcSupplier, updateQaqcSupplier, deleteQaqcSupplier,
} from '../actions'

export type TestTypeItem = {
  id: number
  name: string
  category: string | null
  standard_cost: number | null
  status: 'Active' | 'Inactive'
}

export type SupplierItem = {
  id: number
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  status: 'Active' | 'Inactive'
}

interface Props {
  initialTestTypes: TestTypeItem[]
  initialSuppliers: SupplierItem[]
  userRole: string
}

export default function SettingsClient({ initialTestTypes, initialSuppliers, userRole }: Props) {
  const [tab, setTab] = useState<'types' | 'suppliers'>('types')

  // Test Types
  const [testTypes, setTestTypes] = useState(initialTestTypes)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeCategory, setNewTypeCategory] = useState('General')
  const [newTypeCost, setNewTypeCost] = useState('')
  const [addingType, setAddingType] = useState(false)

  // Suppliers
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierContact, setNewSupplierContact] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [newSupplierEmail, setNewSupplierEmail] = useState('')
  const [addingSupplier, setAddingSupplier] = useState(false)

  const handleAddType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTypeName.trim()) return
    setAddingType(true)
    try {
      await createQaqcTestType(newTypeName.trim(), newTypeCategory, Number(newTypeCost) || 0)
      setNewTypeName('')
      setNewTypeCost('')
      window.location.reload()
    } catch (err: any) {
      alert('Failed to add: ' + err.message)
    } finally {
      setAddingType(false)
    }
  }

  const handleDeleteType = async (id: number, name: string) => {
    if (!confirm(`Delete test type "${name}"?`)) return
    try {
      await deleteQaqcTestType(id)
      setTestTypes(prev => prev.filter(t => t.id !== id))
    } catch (err: any) {
      alert('Delete failed: ' + err.message)
    }
  }

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSupplierName.trim()) return
    setAddingSupplier(true)
    try {
      await createQaqcSupplier(
        newSupplierName.trim(),
        newSupplierContact.trim(),
        newSupplierPhone.trim(),
        newSupplierEmail.trim()
      )
      setNewSupplierName('')
      setNewSupplierContact('')
      setNewSupplierPhone('')
      setNewSupplierEmail('')
      window.location.reload()
    } catch (err: any) {
      alert('Failed to add: ' + err.message)
    } finally {
      setAddingSupplier(false)
    }
  }

  const handleDeleteSupplier = async (id: number, name: string) => {
    if (!confirm(`Delete supplier/laboratory "${name}"?`)) return
    try {
      await deleteQaqcSupplier(id)
      setSuppliers(prev => prev.filter(s => s.id !== id))
    } catch (err: any) {
      alert('Delete failed: ' + err.message)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Settings Navigation Tabs */}
      <div className="flex border-b bg-slate-50 px-6 pt-3 gap-2">
        <button
          onClick={() => setTab('types')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
            tab === 'types'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Beaker className="w-4 h-4" />
          Test Types Directory ({testTypes.length})
        </button>
        <button
          onClick={() => setTab('suppliers')}
          className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition ${
            tab === 'suppliers'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Suppliers & Testing Labs ({suppliers.length})
        </button>
      </div>

      <div className="p-6">
        {/* TAB 1: Test Types */}
        {tab === 'types' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Manage Test Types</h3>
              <p className="text-xs text-slate-500">
                Tests listed here appear automatically in the dropdown menu. You can add new tests anytime.
              </p>
            </div>

            {/* Add New Type Form */}
            <form onSubmit={handleAddType} className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">New Test Type Name *</label>
                <input
                  type="text"
                  required
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  placeholder="e.g. Ultrasonic Pulse Velocity (UPV)"
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <div className="w-40">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Category</label>
                <select
                  value={newTypeCategory}
                  onChange={e => setNewTypeCategory(e.target.value)}
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                >
                  <option value="General">General</option>
                  <option value="Concrete">Concrete</option>
                  <option value="Steel">Steel</option>
                  <option value="Material">Material</option>
                  <option value="Nondestructive">Nondestructive</option>
                </select>
              </div>

              <div className="w-36">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Standard Cost (RM)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newTypeCost}
                  onChange={e => setNewTypeCost(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={addingType || !newTypeName.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Test Type
              </button>
            </form>

            {/* Test Types Table */}
            <div className="border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-[11px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Test Name</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4 text-right">Standard Rate</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {testTypes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">No test types added yet.</td>
                    </tr>
                  ) : (
                    testTypes.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-semibold text-slate-800">{t.name}</td>
                        <td className="py-2.5 px-4 text-slate-500">{t.category || 'General'}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-slate-700">
                          {t.standard_cost ? `RM ${t.standard_cost.toFixed(2)}` : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteType(t.id, t.name)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Suppliers / Labs */}
        {tab === 'suppliers' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Manage Suppliers & Laboratories</h3>
              <p className="text-xs text-slate-500">
                Testing laboratories and material suppliers used for quality control verification.
              </p>
            </div>

            {/* Add New Supplier Form */}
            <form onSubmit={handleAddSupplier} className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Company / Lab Name *</label>
                <input
                  type="text"
                  required
                  value={newSupplierName}
                  onChange={e => setNewSupplierName(e.target.value)}
                  placeholder="e.g. Cast Laboratories Pte Ltd"
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <div className="w-36">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={newSupplierContact}
                  onChange={e => setNewSupplierContact(e.target.value)}
                  placeholder="e.g. Mr. Tan"
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <div className="w-36">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phone</label>
                <input
                  type="text"
                  value={newSupplierPhone}
                  onChange={e => setNewSupplierPhone(e.target.value)}
                  placeholder="+60..."
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <div className="w-48">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Email</label>
                <input
                  type="email"
                  value={newSupplierEmail}
                  onChange={e => setNewSupplierEmail(e.target.value)}
                  placeholder="lab@example.com"
                  className="w-full border rounded-lg px-3 py-1.5 text-xs bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={addingSupplier || !newSupplierName.trim()}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-xs"
              >
                <Plus className="w-4 h-4" />
                Add Supplier
              </button>
            </form>

            {/* Suppliers Table */}
            <div className="border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b text-[11px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Supplier / Lab</th>
                    <th className="py-2.5 px-4">Contact Person</th>
                    <th className="py-2.5 px-4">Phone</th>
                    <th className="py-2.5 px-4">Email</th>
                    <th className="py-2.5 px-4 text-center">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">No suppliers or testing labs added yet.</td>
                    </tr>
                  ) : (
                    suppliers.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4 font-semibold text-slate-800">{s.name}</td>
                        <td className="py-2.5 px-4 text-slate-600">{s.contact_person || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-600">{s.phone || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-600">{s.email || '-'}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {s.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteSupplier(s.id, s.name)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
