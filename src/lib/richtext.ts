// Small allow-list sanitizer for the rich "Details" text on meeting items.
//
// The editor produces HTML (bold, lists, links…). It is cleaned on the server
// before saving AND again before display, so stored or pasted markup can never
// run script. It works by REBUILDING the output from scratch: only the tags
// below survive, every attribute is dropped (except a validated https/http/mailto
// href on links), and any stray "<" in text is escaped.

const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'h3', 'blockquote', 'a', 'code', 'hr'])
// Browser-produced synonyms mapped onto the allowed set.
const RENAME: Record<string, string> = { b: 'strong', i: 'em', strike: 's', del: 's', div: 'p', h1: 'h3', h2: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' }
const VOID = new Set(['br', 'hr'])
const MAX_LENGTH = 20000

function escapeText(s: string) {
  return s
    .replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function safeHref(attrs: string): string | null {
  const m = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs)
  if (!m) return null
  const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim()
  try {
    const u = new URL(raw)
    return ['http:', 'https:', 'mailto:'].includes(u.protocol) ? u.href : null
  } catch {
    return null
  }
}

export function sanitizeRich(input: string | null | undefined): string {
  let src = (input ?? '').slice(0, MAX_LENGTH * 2)
  // Drop whole blocks whose CONTENT must never survive.
  src = src.replace(/<(script|style|iframe|object|embed|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi, '')

  const out: string[] = []
  const stack: string[] = []
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    out.push(escapeText(src.slice(last, m.index)))
    last = re.lastIndex
    if (!m[2]) continue // comment

    const closing = m[1] === '/'
    let tag = m[2].toLowerCase()
    tag = RENAME[tag] ?? tag
    if (!ALLOWED.has(tag)) continue

    if (VOID.has(tag)) {
      if (!closing) out.push(`<${tag}>`)
      continue
    }
    if (closing) {
      const at = stack.lastIndexOf(tag)
      if (at === -1) continue
      while (stack.length > at) out.push(`</${stack.pop()}>`)
      continue
    }
    // A new list item ends the previous one (browsers allow an unclosed <li>).
    if (tag === 'li' && stack[stack.length - 1] === 'li') out.push(`</${stack.pop()}>`)
    if (tag === 'a') {
      const href = safeHref(m[3] ?? '')
      if (!href) continue // an unsafe link is dropped, its text is kept
      out.push(`<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">`)
    } else {
      out.push(`<${tag}>`)
    }
    stack.push(tag)
  }
  out.push(escapeText(src.slice(last)))
  while (stack.length) out.push(`</${stack.pop()}>`)

  const html = out.join('').replace(/(<p>\s*(?:<br>)?\s*<\/p>\s*)+$/g, '').trim()
  return html.slice(0, MAX_LENGTH)
}

// Stored details may be plain text from before the rich editor existed (or from
// an escalation note). Plain text becomes paragraphs; real markup is sanitised.
export function richFromStored(stored: string | null | undefined): string {
  const s = stored ?? ''
  if (!s.trim()) return ''
  if (/<\/?(p|br|ul|ol|li|strong|em|b|i|u|s|h[1-6]|blockquote|a|div)\b/i.test(s)) return sanitizeRich(s)
  const escaped = escapeText(s)
  return escaped
    .split(/\n{2,}/)
    .map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Plain-text version for places that cannot show markup (emails, list previews).
export function richToText(stored: string | null | undefined): string {
  const html = richFromStored(stored)
  return html
    .replace(/<\/(p|li|h3|blockquote)>/g, '\n')
    .replace(/<br>/g, '\n')
    .replace(/<li>/g, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function hasRichContent(stored: string | null | undefined): boolean {
  return richToText(stored).length > 0
}
