'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'

// Drag-and-drop reordering. A row only becomes draggable while its grip handle
// is held, so typing and selecting text inside the row's inputs still works.
// The handle also takes ArrowUp / ArrowDown, for keyboard users.
export function SortableList<T>({
  items, getKey, onChange, render, className = '', itemClassName = '',
}: {
  items: T[]
  getKey: (item: T) => string
  onChange: (next: T[]) => void
  render: (item: T, index: number) => React.ReactNode
  className?: string
  itemClassName?: string
}) {
  const [armed, setArmed] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const reset = () => { setArmed(null); setDragIndex(null); setOverIndex(null) }

  return (
    <ul className={className}>
      {items.map((item, i) => {
        const dropping = dragIndex !== null && overIndex === i && dragIndex !== i
        return (
          <li
            key={getKey(item)}
            draggable={armed === i}
            onDragStart={e => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
            onDragOver={e => { if (dragIndex === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overIndex !== i) setOverIndex(i) }}
            onDrop={e => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); reset() }}
            onDragEnd={reset}
            className={`flex items-center gap-2 ${itemClassName} ${dragIndex === i ? 'opacity-40' : ''} ${dropping ? (dragIndex! < i ? 'border-b-2 border-b-blue-500' : 'border-t-2 border-t-blue-500') : ''}`}
          >
            <button
              type="button"
              aria-label={`Reorder item ${i + 1}. Drag, or press the up and down arrow keys.`}
              title="Drag to reorder"
              onPointerDown={() => setArmed(i)}
              onPointerUp={() => setArmed(null)}
              onKeyDown={e => {
                if (e.key === 'ArrowUp') { e.preventDefault(); move(i, i - 1) }
                if (e.key === 'ArrowDown') { e.preventDefault(); move(i, i + 1) }
              }}
              className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 touch-none p-1 -ml-1 rounded"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            {render(item, i)}
          </li>
        )
      })}
    </ul>
  )
}
