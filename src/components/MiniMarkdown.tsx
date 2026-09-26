import { Fragment, type ReactNode } from 'react'

// Tiny, dependency-free renderer for the subset of Markdown Gemini actually
// replies with: **bold**, *italic*, `code`, # headings, - / 1. lists and
// | tables |. Builds React nodes (never innerHTML), so model output can't
// inject markup.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0], k = `${keyBase}-${i++}`
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k} className="font-semibold">{inline(tok.slice(2, -2), k)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k} className="bg-black/10 rounded px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>)
    else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const isTableSep = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

export default function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0, key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const h = line.match(/^\s*(#{1,6})\s+(.*)$/)
    if (h) { blocks.push(<div key={key++} className="font-bold mt-2 first:mt-0">{inline(h[2], `h${key}`)}</div>); i++; continue }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line); const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(cells(lines[i])); i++ }
      blocks.push(
        <div key={key++} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse">
            <thead><tr>{head.map((c, ci) => <th key={ci} className="border border-gray-300 bg-white/60 px-2 py-1 text-left font-semibold">{inline(c, `th${key}${ci}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-gray-300 px-2 py-1">{inline(c, `td${key}${ri}${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
      continue
    }

    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line); const items: string[] = []
      while (i < lines.length && (ordered ? ol : ul).test(lines[i])) { items.push(lines[i].replace(ordered ? ol : ul, '')); i++ }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={key++} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 my-1 space-y-0.5`}>{items.map((it, ii) => <li key={ii}>{inline(it, `li${key}${ii}`)}</li>)}</Tag>)
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|[-*•]\s|\d+[.)]\s)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) { para.push(lines[i]); i++ }
    blocks.push(<p key={key++} className="my-1 first:mt-0 last:mb-0">{para.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `p${key}${li}`)}</Fragment>)}</p>)
  }
  return <>{blocks}</>
}
