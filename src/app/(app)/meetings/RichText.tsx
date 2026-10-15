'use client'

import { useEffect, useRef, useState } from 'react'
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Link2, Unlink, Heading3, RemoveFormatting, Undo2, Redo2 } from 'lucide-react'
import { richFromStored, sanitizeRich } from '@/lib/richtext'

type Cmd = { icon: React.ComponentType<{ className?: string }>; label: string; run: () => void; active?: string }

// Rich "Details" editor: a formatting toolbar over a contentEditable area.
// Content is committed (sanitised) when the editor loses focus. Pasting is
// forced to plain text so pasted web pages / Word never inject odd markup.
export function RichEditor({
  value, onCommit, placeholder = 'Add context, links or next steps', minHeight = 140,
}: { value: string | null; onCommit: (html: string) => void; placeholder?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const initial = useRef(richFromStored(value))
  const lastCommitted = useRef(initial.current)
  const [formats, setFormats] = useState<Record<string, boolean>>({})

  // Set the starting HTML once (the parent remounts us, via key, for a new item).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial.current
  }, [])

  function exec(command: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    refreshFormats()
  }

  function refreshFormats() {
    try {
      setFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      })
    } catch { /* queryCommandState can throw when nothing is focused */ }
  }

  function addLink() {
    const url = window.prompt('Link address (https://…)')
    if (!url) return
    exec('createLink', url.trim())
  }

  function commit() {
    const el = ref.current
    if (!el) return
    const clean = sanitizeRich(el.innerHTML)
    if (clean !== lastCommitted.current) {
      lastCommitted.current = clean
      onCommit(clean)
    }
  }

  const tools: (Cmd | 'sep')[] = [
    { icon: Bold, label: 'Bold', run: () => exec('bold'), active: 'bold' },
    { icon: Italic, label: 'Italic', run: () => exec('italic'), active: 'italic' },
    { icon: Underline, label: 'Underline', run: () => exec('underline'), active: 'underline' },
    { icon: Strikethrough, label: 'Strikethrough', run: () => exec('strikeThrough'), active: 'strikeThrough' },
    'sep',
    { icon: Heading3, label: 'Heading', run: () => exec('formatBlock', 'h3') },
    { icon: List, label: 'Bulleted list', run: () => exec('insertUnorderedList'), active: 'insertUnorderedList' },
    { icon: ListOrdered, label: 'Numbered list', run: () => exec('insertOrderedList'), active: 'insertOrderedList' },
    { icon: Quote, label: 'Quote', run: () => exec('formatBlock', 'blockquote') },
    'sep',
    { icon: Link2, label: 'Add link', run: addLink },
    { icon: Unlink, label: 'Remove link', run: () => exec('unlink') },
    { icon: RemoveFormatting, label: 'Clear formatting', run: () => { exec('removeFormat'); exec('formatBlock', 'p') } },
    'sep',
    { icon: Undo2, label: 'Undo', run: () => exec('undo') },
    { icon: Redo2, label: 'Redo', run: () => exec('redo') },
  ]

  return (
    <div className="border rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-200">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b bg-gray-50 rounded-t-lg" role="toolbar" aria-label="Text formatting">
        {tools.map((t, i) =>
          t === 'sep' ? (
            <span key={i} className="w-px h-5 bg-gray-200 mx-1" />
          ) : (
            <button
              key={t.label}
              type="button"
              title={t.label}
              aria-label={t.label}
              // mousedown (not click) keeps the text selection while formatting
              onMouseDown={e => { e.preventDefault(); t.run() }}
              className={`p-1.5 rounded hover:bg-gray-200 ${t.active && formats[t.active] ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}
            >
              <t.icon className="w-4 h-4" />
            </button>
          ),
        )}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Details"
        data-placeholder={placeholder}
        onInput={() => { if (ref.current && ref.current.innerHTML === '<br>') ref.current.innerHTML = ''; refreshFormats() }}
        onKeyUp={refreshFormats}
        onMouseUp={refreshFormats}
        onBlur={commit}
        onPaste={e => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
        style={{ minHeight }}
        className="rich-text px-3 py-2 text-sm outline-none"
      />
    </div>
  )
}

// Read-only rendering of stored details (sanitised again on the way out).
export function RichView({ value, className = '' }: { value: string | null; className?: string }) {
  const html = richFromStored(value)
  if (!html) return null
  return <div className={`rich-text text-sm ${className}`} dangerouslySetInnerHTML={{ __html: html }} />
}
