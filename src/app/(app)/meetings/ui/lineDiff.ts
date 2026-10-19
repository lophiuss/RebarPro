// Line-by-line comparison used by the History view: which lines were kept, added or removed
// between two versions of a text.
export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string }

export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length
  const m = after.length
  // Longest common subsequence table (texts are small: a few hundred lines at most).
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = before[i] === after[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) { out.push({ kind: 'same', text: after[j] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'del', text: before[i] }); i++ }
    else { out.push({ kind: 'add', text: after[j] }); j++ }
  }
  while (i < n) out.push({ kind: 'del', text: before[i++] })
  while (j < m) out.push({ kind: 'add', text: after[j++] })
  return out
}
