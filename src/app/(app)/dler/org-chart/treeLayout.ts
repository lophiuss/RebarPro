export type TreeLayoutMode = 'auto' | 'v' | 'both' | 'l' | 'r' | 'h'

export const TREE_MODES: TreeLayoutMode[] = ['auto', 'v', 'both', 'l', 'r', 'h']

export const TREE_MODE_LABEL: Record<TreeLayoutMode, string> = {
  auto: 'Auto Compact',
  v: 'Standard',
  both: 'Both hanging',
  l: 'Left hanging',
  r: 'Right hanging',
  h: 'Horizontal',
}

export interface LayoutTreeNode {
  id: number
  children: LayoutTreeNode[]
}

export interface LineSeg {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface ForestPlacement {
  cards: { id: number; x: number; y: number }[]
  lines: LineSeg[]
  w: number
  h: number
}

interface Lay {
  cards: { id: number; x: number; y: number }[]
  lines: LineSeg[]
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface LayoutOpts {
  cardWidth: number
  compact: boolean
  getHeight: (id: number) => number
  getMode: (id: number) => TreeLayoutMode
  isOpen: (node: LayoutTreeNode, depth: number) => boolean
}

const shiftLay = (l: Lay, dx: number, dy: number): Lay => ({
  cards: l.cards.map(c => ({ ...c, x: c.x + dx, y: c.y + dy })),
  lines: l.lines.map(s => ({
    x1: s.x1 + dx,
    y1: s.y1 + dy,
    x2: s.x2 + dx,
    y2: s.y2 + dy,
  })),
  minX: l.minX + dx,
  maxX: l.maxX + dx,
  minY: l.minY + dy,
  maxY: l.maxY + dy,
})

const join = (parts: Lay[]): Lay => ({
  cards: parts.flatMap(p => p.cards),
  lines: parts.flatMap(p => p.lines),
  minX: Math.min(...parts.map(p => p.minX)),
  maxX: Math.max(...parts.map(p => p.maxX)),
  minY: Math.min(...parts.map(p => p.minY)),
  maxY: Math.max(...parts.map(p => p.maxY)),
})

const EMPTY_LINES_BOX = (lines: LineSeg[]): Lay => ({
  cards: [],
  lines,
  minX: Infinity,
  maxX: -Infinity,
  minY: Infinity,
  maxY: -Infinity,
})

function layoutNode(
  node: LayoutTreeNode,
  depth: number,
  opts: LayoutOpts,
  cfg: {
    cw: number
    cx: number
    sib: number
    drop: number
    indent: number
    stack: number
    rowGap: number
  }
): Lay {
  const { cw, cx, sib, drop, indent, stack, rowGap } = cfg
  const H = opts.getHeight(node.id)
  const self: Lay = {
    cards: [{ id: node.id, x: 0, y: 0 }],
    lines: [],
    minX: 0,
    maxX: cw,
    minY: 0,
    maxY: H,
  }
  if (!opts.isOpen(node, depth) || node.children.length === 0) return self

  const kids = node.children.map(c => layoutNode(c, depth + 1, opts, cfg))
  let mode = opts.getMode(node.id)
  const autoCompact = mode === 'auto'
  if (mode === 'auto') {
    mode =
      node.children.length >= 3 && node.children.every(c => !opts.isOpen(c, depth + 1))
        ? 'both'
        : 'v'
  }

  if (mode === 'v') {
    const perRow = autoCompact ? 4 : Infinity
    const rows: Lay[][] = []
    const step = perRow === Infinity ? kids.length : perRow
    for (let i = 0; i < kids.length; i += step) {
      rows.push(kids.slice(i, i + step))
    }
    const multi = rows.length > 1
    const parts: Lay[] = [self]
    const lines: LineSeg[] = []
    let rowTop = H + drop
    let lastBus = H + drop / 2

    for (const row of rows) {
      const placed: { k: Lay; dx: number }[] = []
      if (!multi) {
        let cursor = 0
        for (const k of row) {
          placed.push({ k, dx: cursor - k.minX })
          cursor += k.maxX - k.minX + sib
        }
        const c0 = placed[0].dx + cx
        const cN = placed[placed.length - 1].dx + cx
        const sx = cx - (c0 + cN) / 2
        for (const p of placed) p.dx += sx
      } else {
        const half = Math.ceil(row.length / 2)
        let right = cx - sib
        for (const k of row.slice(0, half).reverse()) {
          placed.unshift({ k, dx: right - k.maxX })
          right -= k.maxX - k.minX + sib
        }
        let left = cx + sib
        for (const k of row.slice(half)) {
          placed.push({ k, dx: left - k.minX })
          left += k.maxX - k.minX + sib
        }
      }

      const busY = rowTop - drop / 2
      const cs = placed.map(p => p.dx + cx)
      lines.push({
        x1: Math.min(cs[0], cx),
        y1: busY,
        x2: Math.max(cs[cs.length - 1], cx),
        y2: busY,
      })
      for (const c of cs) {
        lines.push({ x1: c, y1: busY, x2: c, y2: rowTop })
      }
      let bottom = rowTop
      for (const p of placed) {
        parts.push(shiftLay(p.k, p.dx, rowTop - p.k.minY))
        bottom = Math.max(bottom, rowTop + (p.k.maxY - p.k.minY))
      }
      lastBus = busY
      rowTop = bottom + drop
    }

    lines.unshift({ x1: cx, y1: H, x2: cx, y2: lastBus })
    return join([...parts, EMPTY_LINES_BOX(lines)])
  }

  if (mode === 'h') {
    const x0 = cw + 40
    const spineX = cw + 20
    let cursor = 0
    const placed: Lay[] = []
    const centers: number[] = []
    for (const k of kids) {
      const dy = cursor - k.minY
      placed.push(shiftLay(k, x0, dy))
      centers.push(dy + opts.getHeight(k.cards[0].id) / 2)
      cursor += k.maxY - k.minY + rowGap
    }
    const pcy = (centers[0] + centers[centers.length - 1]) / 2
    const sy = H / 2 - pcy
    const kidsL = placed.map(k => shiftLay(k, 0, sy))
    const cs = centers.map(c => c + sy)
    const lines: LineSeg[] = [{ x1: cw, y1: H / 2, x2: spineX, y2: H / 2 }]
    if (cs.length > 1) {
      lines.push({ x1: spineX, y1: cs[0], x2: spineX, y2: cs[cs.length - 1] })
    }
    for (const c of cs) {
      lines.push({ x1: spineX, y1: c, x2: x0, y2: c })
    }
    return join([self, ...kidsL, EMPTY_LINES_BOX(lines)])
  }

  // Hanging layouts ('l', 'r', 'both'): whole branches remain on their assigned side of the spine
  const placed: Lay[] = []
  const lines: LineSeg[] = []
  let lastMid = H
  let cursor = H + 18

  const place = (k: Lay, side: 'l' | 'r', y: number) => {
    const dx = side === 'r' ? cx + indent - k.minX : cx - indent - k.maxX
    const dy = y - k.minY
    placed.push(shiftLay(k, dx, dy))
    const mid = dy + opts.getHeight(k.cards[0].id) / 2
    lastMid = Math.max(lastMid, mid)
    lines.push(
      side === 'r'
        ? { x1: cx, y1: mid, x2: dx, y2: mid }
        : { x1: cx, y1: mid, x2: dx + cw, y2: mid }
    )
    return k.maxY - k.minY
  }

  if (mode === 'both') {
    for (let i = 0; i < kids.length; i += 2) {
      const hl = place(kids[i], 'l', cursor)
      const hr = kids[i + 1] ? place(kids[i + 1], 'r', cursor) : 0
      cursor += Math.max(hl, hr) + stack
    }
  } else {
    for (const k of kids) {
      cursor += place(k, mode as 'l' | 'r', cursor) + stack
    }
  }

  lines.unshift({ x1: cx, y1: H, x2: cx, y2: lastMid })
  return join([self, ...placed, EMPTY_LINES_BOX(lines)])
}

export function layoutForest(
  roots: LayoutTreeNode[],
  opts: LayoutOpts
): ForestPlacement {
  if (roots.length === 0) {
    return { cards: [], lines: [], w: 0, h: 0 }
  }

  const cw = opts.cardWidth
  const rootGap = opts.compact ? 36 : 48
  const pad = 16
  const cfg = {
    cw,
    cx: cw / 2,
    sib: opts.compact ? 16 : 24,
    drop: opts.compact ? 36 : 44,
    indent: opts.compact ? 22 : 28,
    stack: opts.compact ? 12 : 14,
    rowGap: opts.compact ? 12 : 16,
  }

  let cursor = 0
  const parts: Lay[] = []
  for (const r of roots) {
    const l = layoutNode(r, 0, opts, cfg)
    parts.push(shiftLay(l, cursor - l.minX, 0))
    cursor += l.maxX - l.minX + rootGap
  }

  const all = join(parts)
  const moved = shiftLay(all, pad - all.minX, pad - all.minY)
  return {
    cards: moved.cards,
    lines: moved.lines,
    w: moved.maxX + pad,
    h: moved.maxY + pad + 12,
  }
}
