'use client'

import React, { useState } from 'react'
import { X, Check, Calendar, DollarSign, FileText, Building2, Beaker, Tag, ShieldAlert } from 'lucide-react'
import DropdownOrOther from '@/components/DropdownOrOther'
import { createQaqcTest, updateQaqcTest, type QaqcTestInput } from '../actions'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialData?: any | null
  userRole: string
  knownProjects: string[]
  knownSuppliers: string[]
  knownTestTypes: string[]
}

export default function TestFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialData,
  userRole,
  knownProjects,
  knownSuppliers,
  knownTestTypes,
}: Props) {
  const isEditing = Boolean(initialData?.id)

  const [project, setProject] = useState(initialData?.project || knownProjects[0] || '')
  const [supplier, setSupplier] = useState(initialData?.supplier || knownSuppliers[0] || '')
  const [marking, setMarking] = useState(initialData?.marking || '')
  const [testType, setTestType] = useState(initialData?.test_type || knownTestTypes[0] || '')
  const [dateCast, setDateCast] = useState(initialData?.date_cast || '')
  const [dateTest, setDateTest] = useState(initialData?.date_test || new Date().toISOString().slice(0, 10))
  const [reportNo, setReportNo] = useState(initialData?.report_no || '')
  const [emailDate, setEmailDate] = useState(initialData?.email_date || '')
  const [qaqcRemarks, setQaqcRemarks] = useState(initialData?.qaqc_remarks || '')

  // Purchaser
  const [poNo, setPoNo] = useState(initialData?.po_no || '')
  const [poDate, setPoDate] = useState(initialData?.po_date || '')
  const [poAmount, setPoAmount] = useState(initialData?.po_amount !== null && initialData?.po_amount !== undefined ? String(initialData.po_amount) : '')
  const [purchaserRemarks, setPurchaserRemarks] = useState(initialData?.purchaser_remarks || '')

  // Account
  const [invoiceNo, setInvoiceNo] = useState(initialData?.invoice_no || '')
  const [invoiceDate, setInvoiceDate] = useState(initialData?.invoice_date || '')
  const [invoiceAmount, setInvoiceAmount] = useState(initialData?.invoice_amount !== null && initialData?.invoice_amount !== undefined ? String(initialData.invoice_amount) : '')
  const [paymentStatus, setPaymentStatus] = useState(initialData?.payment_status || 'Pending')
  const [paymentDate, setPaymentDate] = useState(initialData?.payment_date || '')
  const [accountRemarks, setAccountRemarks] = useState(initialData?.account_remarks || '')
  const [cnNo, setCnNo] = useState((initialData as any)?.cn_no || '')
  const [cnDate, setCnDate] = useState((initialData as any)?.cn_date || '')
  const [cnAmount, setCnAmount] = useState((initialData as any)?.cn_amount !== null && (initialData as any)?.cn_amount !== undefined ? String((initialData as any).cn_amount) : '')
  const [cnRemarks, setCnRemarks] = useState((initialData as any)?.cn_remarks || '')

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const isSuper = userRole === 'admin' || userRole === 'manager'
  const canEditQaqc = isSuper || userRole === 'qaqc'
  const canEditPurchaser = isSuper || userRole === 'purchaser'
  const canEditAccount = isSuper || userRole === 'account'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project.trim() || !supplier.trim() || !testType.trim() || !dateTest) {
      setErrorMsg('Please fill in required fields: Project, Supplier, Test Type, and Date Tested.')
      return
    }

    setSaving(true)
    setErrorMsg(null)

    const payload: QaqcTestInput = {
      project: project.trim(),
      supplier: supplier.trim(),
      marking: marking.trim() || null,
      test_type: testType.trim(),
      date_cast: dateCast || null,
      date_test: dateTest,
      report_no: reportNo.trim() || null,
      email_date: emailDate || null,
      qaqc_remarks: qaqcRemarks.trim() || null,
      po_no: poNo.trim() || null,
      po_date: poDate || null,
      po_amount: poAmount ? Number(poAmount) : null,
      purchaser_remarks: purchaserRemarks.trim() || null,
      invoice_no: invoiceNo.trim() || null,
      invoice_date: invoiceDate || null,
      invoice_amount: invoiceAmount ? Number(invoiceAmount) : null,
      payment_status: paymentStatus as any,
      payment_date: paymentDate || null,
      account_remarks: accountRemarks.trim() || null,
      cn_no: cnNo.trim() || null,
      cn_date: cnDate || null,
      cn_amount: cnAmount ? Number(cnAmount) : null,
      cn_remarks: cnRemarks.trim() || null,
    }

    try {
      if (isEditing) {
        await updateQaqcTest(initialData.id, payload)
      } else {
        await createQaqcTest(payload)
      }
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {isEditing ? `Edit Test Record (${initialData.running_no})` : 'New QAQC Test Record'}
            </h2>
            <p className="text-xs text-slate-500">
              {isEditing ? 'Update details across QAQC, Purchaser, and Account stages' : 'Running number will be assigned automatically'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
              {errorMsg}
            </div>
          )}

          {/* Section 1: QAQC Details */}
          <div className={`p-4 rounded-xl border ${canEditQaqc ? 'bg-indigo-50/20 border-indigo-100' : 'bg-slate-50 border-slate-200 opacity-90'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">1</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">QAQC Stage (Test Execution & Results)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Project *</label>
                <DropdownOrOther
                  value={project}
                  options={knownProjects}
                  onChange={setProject}
                  placeholder="Type new project..."
                  className={`w-full border rounded-lg px-3 py-2 text-xs ${!canEditQaqc ? 'bg-slate-100 pointer-events-none' : 'bg-white'}`}
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Supplier / Testing Lab *</label>
                <DropdownOrOther
                  value={supplier}
                  options={knownSuppliers}
                  onChange={setSupplier}
                  placeholder="Type testing lab / supplier..."
                  className={`w-full border rounded-lg px-3 py-2 text-xs ${!canEditQaqc ? 'bg-slate-100 pointer-events-none' : 'bg-white'}`}
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Type of Test *</label>
                <DropdownOrOther
                  value={testType}
                  options={knownTestTypes}
                  onChange={setTestType}
                  placeholder="Type other test type..."
                  className={`w-full border rounded-lg px-3 py-2 text-xs ${!canEditQaqc ? 'bg-slate-100 pointer-events-none' : 'bg-white'}`}
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Marking / Sample Element</label>
                <input
                  type="text"
                  disabled={!canEditQaqc}
                  value={marking}
                  onChange={e => setMarking(e.target.value)}
                  placeholder="e.g. Beam B1-12, Column C4"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Date Cast</label>
                <input
                  type="date"
                  disabled={!canEditQaqc}
                  value={dateCast}
                  onChange={e => setDateCast(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Date Tested *</label>
                <input
                  type="date"
                  required
                  disabled={!canEditQaqc}
                  value={dateTest}
                  onChange={e => setDateTest(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Report Number</label>
                <input
                  type="text"
                  disabled={!canEditQaqc}
                  value={reportNo}
                  onChange={e => setReportNo(e.target.value)}
                  placeholder="e.g. REP-2026-981"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Email Date (Results Sent)</label>
                <input
                  type="date"
                  disabled={!canEditQaqc}
                  value={emailDate}
                  onChange={e => setEmailDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">QAQC Remarks</label>
                <input
                  type="text"
                  disabled={!canEditQaqc}
                  value={qaqcRemarks}
                  onChange={e => setQaqcRemarks(e.target.value)}
                  placeholder="Optional QAQC notes..."
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Purchaser Details */}
          <div className={`p-4 rounded-xl border ${canEditPurchaser ? 'bg-amber-50/25 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-90'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-bold">2</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Purchaser Stage (PO Issuance)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">PO Number</label>
                <input
                  type="text"
                  disabled={!canEditPurchaser}
                  value={poNo}
                  onChange={e => setPoNo(e.target.value)}
                  placeholder="e.g. PO-2026-0412"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">PO Date</label>
                <input
                  type="date"
                  disabled={!canEditPurchaser}
                  value={poDate}
                  onChange={e => setPoDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">PO Amount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!canEditPurchaser}
                  value={poAmount}
                  onChange={e => setPoAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block font-medium text-slate-700 mb-1">Purchaser Remarks</label>
                <input
                  type="text"
                  disabled={!canEditPurchaser}
                  value={purchaserRemarks}
                  onChange={e => setPurchaserRemarks(e.target.value)}
                  placeholder="Optional purchasing notes..."
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Account Details */}
          <div className={`p-4 rounded-xl border ${canEditAccount ? 'bg-emerald-50/25 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-90'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">3</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900">Account Stage (Invoicing & Payment)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Invoice Number</label>
                <input
                  type="text"
                  disabled={!canEditAccount}
                  value={invoiceNo}
                  onChange={e => setInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-9901"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Invoice Date</label>
                <input
                  type="date"
                  disabled={!canEditAccount}
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Invoice Amount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={!canEditAccount}
                  value={invoiceAmount}
                  onChange={e => setInvoiceAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Status</label>
                <select
                  disabled={!canEditAccount}
                  value={paymentStatus}
                  onChange={e => setPaymentStatus(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100 font-semibold"
                >
                  <option value="Pending">🟡 Pending</option>
                  <option value="Paid">🟢 Paid</option>
                  <option value="Partially Paid">🟠 Partially Paid</option>
                  <option value="Void">⚪ Void</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  disabled={!canEditAccount}
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Account Remarks</label>
                <input
                  type="text"
                  disabled={!canEditAccount}
                  value={accountRemarks}
                  onChange={e => setAccountRemarks(e.target.value)}
                  placeholder="Payment ref / cheque no..."
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-white disabled:bg-slate-100"
                />
              </div>

              {/* Credit Note (CN) Adjustment */}
              <div className="sm:col-span-3 bg-white p-3.5 rounded-xl border border-emerald-300 mt-2 space-y-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-950 text-xs">
                    <span>Supplier Credit Note (CN) Adjustment</span>
                    <span className="text-[11px] font-normal text-slate-500">(if supplier billed wrongly or overcharged)</span>
                  </div>
                  {Number(invoiceAmount) > 0 && Number(cnAmount) > 0 && (
                    <div className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                      Net Billed: RM {Math.max(0, Number(invoiceAmount) - Number(cnAmount)).toFixed(2)}
                      <span className="text-[10px] font-normal text-slate-500 ml-1.5">(RM {Number(invoiceAmount).toFixed(2)} - RM {Number(cnAmount).toFixed(2)})</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">CN Number</label>
                    <input
                      type="text"
                      disabled={!canEditAccount}
                      value={cnNo}
                      onChange={e => setCnNo(e.target.value)}
                      placeholder="e.g. CN-2026-004"
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">CN Date</label>
                    <input
                      type="date"
                      disabled={!canEditAccount}
                      value={cnDate}
                      onChange={e => setCnDate(e.target.value)}
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">CN Amount (RM)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={!canEditAccount}
                      value={cnAmount}
                      onChange={e => setCnAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">CN Reason / Adjustment Remarks</label>
                  <input
                    type="text"
                    disabled={!canEditAccount}
                    value={cnRemarks}
                    onChange={e => setCnRemarks(e.target.value)}
                    placeholder="e.g. Overcharged cube testing rate by RM 50; supplier credited"
                    className="w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white disabled:bg-slate-100"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Test Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
