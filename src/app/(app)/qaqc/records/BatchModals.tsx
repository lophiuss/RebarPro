'use client'

import React, { useState } from 'react'
import { X, Check, FileCheck, Receipt, DollarSign, Split, Copy } from 'lucide-react'
import { batchAssignQaqcPo, batchAssignQaqcInvoice } from '../actions'
import type { QaqcTestRecord } from './RecordsClient'

interface BatchPoProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedTests: QaqcTestRecord[]
  existingPoList: string[]
}

export function BatchPoModal({
  isOpen,
  onClose,
  onSuccess,
  selectedTests,
  existingPoList,
}: BatchPoProps) {
  const [poNo, setPoNo] = useState('')
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState('')
  const [splitMode, setSplitMode] = useState<'split_equally' | 'same_each'>('split_equally')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const N = selectedTests.length
  const total = Number(totalAmount) || 0
  const perTest = splitMode === 'split_equally' ? (N > 0 ? total / N : 0) : total

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poNo.trim()) {
      setErrorMsg('Please enter a PO Number.')
      return
    }
    setSaving(true)
    setErrorMsg(null)
    try {
      await batchAssignQaqcPo(selectedTests.map(t => t.id), {
        po_no: poNo,
        po_date: poDate,
        total_amount: totalAmount ? Number(totalAmount) : null,
        split_mode: splitMode,
        purchaser_remarks: remarks,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign PO')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-amber-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <FileCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Assign PO to {N} Selected Tests</h2>
              <p className="text-[11px] text-slate-500">Attach one purchase order across multiple test records</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-6 space-y-4 text-xs">
          {/* Selected items chip list */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">Applying to {N} tests:</span>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {selectedTests.map(t => (
                <span key={t.id} className="bg-white px-2 py-0.5 rounded border text-[11px] font-mono text-slate-700">
                  {t.running_no} ({t.project})
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">PO Number *</label>
              <input
                type="text"
                required
                value={poNo}
                onChange={e => setPoNo(e.target.value)}
                placeholder="e.g. PO-2026-088"
                list="batch-po-options"
                className="w-full border rounded-lg px-3 py-2 bg-white font-mono font-bold text-amber-900"
              />
              <datalist id="batch-po-options">
                {existingPoList.map(po => <option key={po} value={po} />)}
              </datalist>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">PO Date</label>
              <input
                type="date"
                value={poDate}
                onChange={e => setPoDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">PO Total Amount (RM)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={totalAmount}
              onChange={e => setTotalAmount(e.target.value)}
              placeholder="e.g. 1500.00"
              className="w-full border rounded-lg px-3 py-2 bg-white font-semibold text-slate-900"
            />
          </div>

          {/* Amount Allocation Mode */}
          {total > 0 && (
            <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 space-y-2">
              <span className="font-semibold text-amber-950 block">Amount Distribution:</span>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${splitMode === 'split_equally' ? 'bg-white border-amber-500 shadow-2xs' : 'bg-transparent border-transparent'}`}>
                  <input
                    type="radio"
                    name="splitMode"
                    checked={splitMode === 'split_equally'}
                    onChange={() => setSplitMode('split_equally')}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Split Equally</span>
                    <span className="text-[10px] text-slate-500">RM {perTest.toFixed(2)} allocated per test</span>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${splitMode === 'same_each' ? 'bg-white border-amber-500 shadow-2xs' : 'bg-transparent border-transparent'}`}>
                  <input
                    type="radio"
                    name="splitMode"
                    checked={splitMode === 'same_each'}
                    onChange={() => setSplitMode('same_each')}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Set for Each Test</span>
                    <span className="text-[10px] text-slate-500">RM {total.toFixed(2)} on each test</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">Purchaser Remarks (Optional)</label>
            <input
              type="text"
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="e.g. Batch lab PO for week 42"
              className="w-full border rounded-lg px-3 py-2 bg-white"
            />
          </div>

          {errorMsg && <p className="text-red-600 font-medium">{errorMsg}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              {saving ? 'Applying…' : `Apply PO to ${N} Tests`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface BatchInvoiceProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedTests: QaqcTestRecord[]
  existingInvList: string[]
}

export function BatchInvoiceModal({
  isOpen,
  onClose,
  onSuccess,
  selectedTests,
  existingInvList,
}: BatchInvoiceProps) {
  const [invoiceNo, setInvoiceNo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [totalAmount, setTotalAmount] = useState('')
  const [splitMode, setSplitMode] = useState<'split_equally' | 'same_each'>('split_equally')
  const [cnNo, setCnNo] = useState('')
  const [cnDate, setCnDate] = useState('')
  const [cnAmount, setCnAmount] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<'Pending' | 'Paid' | 'Partially Paid' | 'Void'>('Pending')
  const [paymentDate, setPaymentDate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const N = selectedTests.length
  const totalInv = Number(totalAmount) || 0
  const totalCn = Number(cnAmount) || 0
  const netTotal = Math.max(0, totalInv - totalCn)
  const perTestInv = splitMode === 'split_equally' ? (N > 0 ? totalInv / N : 0) : totalInv
  const perTestCn = splitMode === 'split_equally' ? (N > 0 ? totalCn / N : 0) : totalCn
  const perTestNet = Math.max(0, perTestInv - perTestCn)

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceNo.trim()) {
      setErrorMsg('Please enter an Invoice Number.')
      return
    }
    setSaving(true)
    setErrorMsg(null)
    try {
      await batchAssignQaqcInvoice(selectedTests.map(t => t.id), {
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        total_amount: totalAmount ? Number(totalAmount) : null,
        split_mode: splitMode,
        cn_no: cnNo || null,
        cn_date: cnDate || null,
        cn_amount: cnAmount ? Number(cnAmount) : null,
        payment_status: paymentStatus,
        payment_date: paymentDate || null,
        account_remarks: remarks,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to assign Invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-emerald-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Assign Invoice / CN to {N} Selected Tests</h2>
              <p className="text-[11px] text-slate-500">Record a single supplier invoice or CN covering multiple tests</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleApply} className="p-6 space-y-4 text-xs">
          {/* Selected items chip list */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">Applying to {N} tests:</span>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {selectedTests.map(t => (
                <span key={t.id} className="bg-white px-2 py-0.5 rounded border text-[11px] font-mono text-slate-700">
                  {t.running_no} ({t.project})
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Invoice Number *</label>
              <input
                type="text"
                required
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-9901"
                list="batch-inv-options"
                className="w-full border rounded-lg px-3 py-2 bg-white font-mono font-bold text-emerald-950"
              />
              <datalist id="batch-inv-options">
                {existingInvList.map(inv => <option key={inv} value={inv} />)}
              </datalist>
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Total Invoice Amount (RM)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                placeholder="e.g. 1500.00"
                className="w-full border rounded-lg px-3 py-2 bg-white font-semibold text-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value as any)}
                className="w-full border rounded-lg px-3 py-2 bg-white font-bold"
              >
                <option value="Pending">🟡 Pending</option>
                <option value="Paid">🟢 Paid</option>
                <option value="Partially Paid">🟠 Partially Paid</option>
                <option value="Void">⚪ Void</option>
              </select>
            </div>
          </div>

          {/* Supplier Credit Note Adjustment (Optional) */}
          <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-200/80 space-y-2">
            <span className="font-bold text-emerald-950 block">Credit Note (CN) Adjustment (If supplier overbilled):</span>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={cnNo}
                onChange={e => setCnNo(e.target.value)}
                placeholder="CN No"
                className="border rounded-md px-2 py-1.5 bg-white text-xs"
              />
              <input
                type="date"
                value={cnDate}
                onChange={e => setCnDate(e.target.value)}
                className="border rounded-md px-2 py-1.5 bg-white text-xs"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={cnAmount}
                onChange={e => setCnAmount(e.target.value)}
                placeholder="CN Amount"
                className="border rounded-md px-2 py-1.5 bg-white text-xs font-semibold text-emerald-800"
              />
            </div>
            {totalInv > 0 && totalCn > 0 && (
              <div className="text-[11px] font-bold text-emerald-900">
                Net Billed: RM {netTotal.toFixed(2)} (RM {totalInv.toFixed(2)} - RM {totalCn.toFixed(2)})
              </div>
            )}
          </div>

          {/* Allocation Mode */}
          {totalInv > 0 && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
              <span className="font-semibold text-slate-700 block">Amount Distribution across {N} tests:</span>
              <div className="grid grid-cols-2 gap-2">
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${splitMode === 'split_equally' ? 'bg-white border-emerald-500 shadow-2xs' : 'bg-transparent border-transparent'}`}>
                  <input
                    type="radio"
                    name="splitModeInv"
                    checked={splitMode === 'split_equally'}
                    onChange={() => setSplitMode('split_equally')}
                    className="mt-0.5 text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Split Equally</span>
                    <span className="text-[10px] text-slate-500">RM {perTestNet.toFixed(2)} net / test</span>
                  </div>
                </label>
                <label className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer ${splitMode === 'same_each' ? 'bg-white border-emerald-500 shadow-2xs' : 'bg-transparent border-transparent'}`}>
                  <input
                    type="radio"
                    name="splitModeInv"
                    checked={splitMode === 'same_each'}
                    onChange={() => setSplitMode('same_each')}
                    className="mt-0.5 text-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">Set for Each Test</span>
                    <span className="text-[10px] text-slate-500">RM {netTotal.toFixed(2)} net / test</span>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Date (if paid)</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">Account Remarks</label>
              <input
                type="text"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Payment ref / notes..."
                className="w-full border rounded-lg px-3 py-2 bg-white"
              />
            </div>
          </div>

          {errorMsg && <p className="text-red-600 font-medium">{errorMsg}</p>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg font-bold shadow-xs transition disabled:opacity-50"
            >
              {saving ? 'Applying…' : `Apply Invoice to ${N} Tests`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
