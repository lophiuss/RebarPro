'use client'

// Category -> Equipment cascading picker: choosing a category filters the
// equipment dropdown down to just that category's items, so a long
// equipment list doesn't have to be scanned one by one. Used on both the
// public Work Request form and the logged-in Jobs page.
export type EquipmentOption = { id: number; name: string; category: string | null }

export default function CategoryEquipmentPicker({
  options, categoryValue, equipmentValue, onCategoryChange, onEquipmentChange, required,
}: {
  options: EquipmentOption[]
  categoryValue: string
  equipmentValue: string
  onCategoryChange: (v: string) => void
  onEquipmentChange: (v: string) => void
  required?: boolean
}) {
  const categories = [...new Set(options.map(o => o.category).filter(Boolean))].sort() as string[]
  const filtered = categoryValue ? options.filter(o => o.category === categoryValue) : options

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
        <select
          value={categoryValue}
          onChange={e => { onCategoryChange(e.target.value); onEquipmentChange('') }}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Equipment / Machine</label>
        <select
          required={required}
          value={equipmentValue}
          onChange={e => onEquipmentChange(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">{required ? 'Select…' : '(Not equipment-specific)'}</option>
          {filtered.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
    </div>
  )
}
