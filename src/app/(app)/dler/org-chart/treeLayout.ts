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
  isAssistant?: boolean
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

type NodeCfg = {
  cw: number
  cx: number
  sib: number
  drop: number
  indent: number
  stack: number
  rowGap: number
}

function placeSingleRow(
  row: Lay[],
  rowTop: number,
  spineStartY: number,
  cfg: NodeCfg
): { parts: Lay[]; lines: LineSeg[] } {
  const { cx, sib, drop } = cfg
  const placed: { k: Lay; dx: number }[] = []
  let cursor = 0
  for (const k of row) {
    placed.push({ k, dx: cursor - k.minX })
    cursor += k.maxX - k.minX + sib
  }
  const c0 = placed[0].dx + cx
  const cN = placed[placed.length - 1].dx + cx
  const sx = cx - (c0 + cN) / 2
  for (const p of placed) p.dx += sx

  const busY = rowTop - drop / 2
  const cs = placed.map(p => p.dx + cx)
  const lines: LineSeg[] = [{ x1: cx, y1: spineStartY, x2: cx, y2: busY }]
  const minBus = Math.min(...cs, cx)
  const maxBus = Math.max(...cs, cx)
  if (maxBus > minBus) {
    lines.push({ x1: minBus, y1: busY, x2: maxBus, y2: busY })
  }
  for (const c of cs) {
    lines.push({ x1: c, y1: busY, x2: c, y2: rowTop })
  }

  const parts = placed.map(p => shiftLay(p.k, p.dx, rowTop - p.k.minY))
  return { parts, lines }
}

function placeBalancedBoth(
  items: Lay[],
  startY: number,
  opts: LayoutOpts,
  cfg: NodeCfg
): { placed: Lay[]; lines: LineSeg[]; lastMid: number; bottom: number } {
  const { cw, cx, indent, stack } = cfg
  const placed: Lay[] = []
  const lines: LineSeg[] = []
  let leftCursor = startY
  let rightCursor = startY
  let lastMid = 0

  for (const k of items) {
    const side: 'l' | 'r' = leftCursor <= rightCursor ? 'l' : 'r'
    const y = side === 'l' ? leftCursor : rightCursor
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
    const h = k.maxY - k.minY
    if (side === 'l') leftCursor += h + stack
    else rightCursor += h + stack
  }

  const bottom = Math.max(leftCursor, rightCursor) - stack
  return { placed, lines, lastMid, bottom }
}

function placeAssistants(
  items: Lay[],
  startY: number,
  opts: LayoutOpts,
  cfg: NodeCfg
): { placed: Lay[]; lines: LineSeg[]; lastMid: number; bottom: number; maxX: number } {
  const { cw, cx, indent, stack } = cfg
  const placed: Lay[] = []
  const lines: LineSeg[] = []
  let leftCursor = startY
  let rightCursor = startY
  let lastMid = 0
  let maxX = cw

  for (const k of items) {
    // 1 assistant hangs right; 2+ alternate right-first then whichever side is shorter
    const side: 'l' | 'r' = rightCursor <= leftCursor ? 'r' : 'l'
    const y = side === 'r' ? rightCursor : leftCursor
    const dx = side === 'r' ? cx + indent - k.minX : cx - indent - k.maxX
    const dy = y - k.minY
    const shifted = shiftLay(k, dx, dy)
    placed.push(shifted)
    maxX = Math.max(maxX, shifted.maxX)
    const mid = dy + opts.getHeight(k.cards[0].id) / 2
    lastMid = Math.max(lastMid, mid)
    lines.push(
      side === 'r'
        ? { x1: cx, y1: mid, x2: dx, y2: mid }
        : { x1: cx, y1: mid, x2: dx + cw, y2: mid }
    )
    const h = k.maxY - k.minY
    if (side === 'r') rightCursor += h + stack
    else leftCursor += h + stack
  }

  const bottom = Math.max(leftCursor, rightCursor) - stack
  return { placed, lines, lastMid, bottom, maxX }
}

function layoutNode(
  node: LayoutTreeNode,
  depth: number,
  opts: LayoutOpts,
  cfg: NodeCfg
): Lay {
  const { cw, cx, drop, indent, stack, rowGap } = cfg
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
  const assistKids: Lay[] = []
  const regularNodes: LayoutTreeNode[] = []
  const regularKids: Lay[] = []
  node.children.forEach((childNode, idx) => {
    if (childNode.isAssistant) {
      assistKids.push(kids[idx])
    } else {
      regularNodes.push(childNode)
      regularKids.push(kids[idx])
    }
  })

  const assistPack = assistKids.length > 0 ? placeAssistants(assistKids, H + 16, opts, cfg) : null
  if (assistPack && regularKids.length === 0) {
    return join([
      self,
      ...assistPack.placed,
      EMPTY_LINES_BOX([{ x1: cx, y1: H, x2: cx, y2: Math.max(H, assistPack.lastMid) }, ...assistPack.lines]),
    ])
  }

  const activeKids = regularKids
  const activeNodes = regularNodes
  const childStartY = assistPack ? assistPack.bottom + drop : H + drop
  const hangStartY = assistPack ? assistPack.bottom + 18 : H + 18
  const mode = opts.getMode(node.id)

  if (mode === 'auto') {
    const leafKids: Lay[] = []
    const branchKids: Lay[] = []
    activeNodes.forEach((childNode, idx) => {
      if (opts.isOpen(childNode, depth + 1)) branchKids.push(activeKids[idx])
      else leafKids.push(activeKids[idx])
    })

    // Case 1: Only leaves -> balanced 2-column hanging if 3+, else single horizontal row
    if (branchKids.length === 0) {
      if (activeKids.length >= 3) {
        const pack = placeBalancedBoth(activeKids, hangStartY, opts, cfg)
        return join([
          self,
          ...(assistPack ? assistPack.placed : []),
          ...pack.placed,
          EMPTY_LINES_BOX([
            { x1: cx, y1: H, x2: cx, y2: Math.max(H, pack.lastMid) },
            ...(assistPack ? assistPack.lines : []),
            ...pack.lines,
          ]),
        ])
      }
      const rowPack = placeSingleRow(activeKids, childStartY, H, cfg)
      return join([
        self,
        ...(assistPack ? assistPack.placed : []),
        ...rowPack.parts,
        EMPTY_LINES_BOX([...(assistPack ? assistPack.lines : []), ...rowPack.lines]),
      ])
    }

    // Case 2: Mixed 2+ leaves + open branches -> hang leaves in 2 balanced columns, open branches in 1 clean row below
    if (leafKids.length >= 2) {
      const leafPack = placeBalancedBoth(leafKids, hangStartY, opts, cfg)
      const branchPack = placeSingleRow(branchKids, leafPack.bottom + drop, H, cfg)
      return join([
        self,
        ...(assistPack ? assistPack.placed : []),
        ...leafPack.placed,
        ...branchPack.parts,
        EMPTY_LINES_BOX([
          ...(assistPack ? assistPack.lines : []),
          ...leafPack.lines,
          ...branchPack.lines,
        ]),
      ])
    }

    // Case 3: <2 leaves with open branches -> keep all siblings aligned on one horizontal row
    const rowPack = placeSingleRow(activeKids, childStartY, H, cfg)
    return join([
      self,
      ...(assistPack ? assistPack.placed : []),
      ...rowPack.parts,
      EMPTY_LINES_BOX([...(assistPack ? assistPack.lines : []), ...rowPack.lines]),
    ])
  }

  if (mode === 'v') {
    const rowPack = placeSingleRow(activeKids, childStartY, H, cfg)
    return join([
      self,
      ...(assistPack ? assistPack.placed : []),
      ...rowPack.parts,
      EMPTY_LINES_BOX([...(assistPack ? assistPack.lines : []), ...rowPack.lines]),
    ])
  }

  if (mode === 'h') {
    const x0 = assistPack ? Math.max(cw + 40, assistPack.maxX + 36) : cw + 40
    const spineX = x0 - 20
    let cursor = 0
    const placed: Lay[] = []
    const centers: number[] = []
    for (const k of activeKids) {
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
    if (assistPack) {
      lines.push({ x1: cx, y1: H, x2: cx, y2: Math.max(H, assistPack.lastMid) })
      lines.push(...assistPack.lines)
    }
    return join([self, ...(assistPack ? assistPack.placed : []), ...kidsL, EMPTY_LINES_BOX(lines)])
  }

  if (mode === 'both') {
    const pack = placeBalancedBoth(activeKids, hangStartY, opts, cfg)
    return join([
      self,
      ...(assistPack ? assistPack.placed : []),
      ...pack.placed,
      EMPTY_LINES_BOX([
        { x1: cx, y1: H, x2: cx, y2: Math.max(H, pack.lastMid) },
        ...(assistPack ? assistPack.lines : []),
        ...pack.lines,
      ]),
    ])
  }

  // Hanging single-side layouts ('l' or 'r'): whole branches remain on their assigned side of the spine
  const placed: Lay[] = []
  const lines: LineSeg[] = []
  let lastMid = H
  let cursor = hangStartY

  for (const k of activeKids) {
    const dx = mode === 'r' ? cx + indent - k.minX : cx - indent - k.maxX
    const dy = cursor - k.minY
    placed.push(shiftLay(k, dx, dy))
    const mid = dy + opts.getHeight(k.cards[0].id) / 2
    lastMid = Math.max(lastMid, mid)
    lines.push(
      mode === 'r'
        ? { x1: cx, y1: mid, x2: dx, y2: mid }
        : { x1: cx, y1: mid, x2: dx + cw, y2: mid }
    )
    cursor += k.maxY - k.minY + stack
  }

  lines.unshift({ x1: cx, y1: H, x2: cx, y2: lastMid })
  return join([
    self,
    ...(assistPack ? assistPack.placed : []),
    ...placed,
    EMPTY_LINES_BOX([...(assistPack ? assistPack.lines : []), ...lines]),
  ])
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
