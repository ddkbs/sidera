/** Pure layout math for "Organize this board" — no DB/Electron imports so it's trivially unit-testable. */

export interface SizedObject {
  id: string
  width: number
  height: number
}

export interface GroupSized {
  title: string
  color: string
  objects: SizedObject[]
}

export interface SectionLayout {
  title: string
  color: string
  x: number
  y: number
  width: number
  height: number
  objects: { id: string; x: number; y: number }[]
}

export interface LayoutResult {
  sections: SectionLayout[]
  unsorted: { id: string; x: number; y: number }[]
}

const PADDING = 24
const TITLE_H = 44
const GAP = 20
const SECTION_GAP = 60
const MIN_SECTION_W = 220

/** Cumulative start offsets for a list of sizes laid out with a gap between them. */
function cumulative(sizes: number[], gap: number): number[] {
  const out: number[] = []
  let acc = 0
  for (let i = 0; i < sizes.length; i++) {
    out[i] = acc
    acc += sizes[i] + gap
  }
  return out
}

/** Packs objects into a roughly square grid (uniform per-column/row sizing so nothing overlaps). Returns local (0,0)-based positions. */
function packGrid(objects: SizedObject[]): { width: number; height: number; positions: Map<string, { x: number; y: number }> } {
  const positions = new Map<string, { x: number; y: number }>()
  if (!objects.length) return { width: 0, height: 0, positions }
  const cols = Math.max(1, Math.ceil(Math.sqrt(objects.length)))
  const colWidths: number[] = []
  const rowHeights: number[] = []
  objects.forEach((o, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    colWidths[col] = Math.max(colWidths[col] ?? 0, o.width)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, o.height)
  })
  const colX = cumulative(colWidths, GAP)
  const rowY = cumulative(rowHeights, GAP)
  objects.forEach((o, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    positions.set(o.id, { x: colX[col], y: rowY[row] })
  })
  const width = colWidths.reduce((a, b) => a + b, 0) + GAP * Math.max(0, colWidths.length - 1)
  const height = rowHeights.reduce((a, b) => a + b, 0) + GAP * Math.max(0, rowHeights.length - 1)
  return { width, height, positions }
}

/**
 * Lays out groups as colored sections in a tidy grid (2-3 columns depending on count), each section
 * sized to fit a grid of its objects (with title space at top), plus a grid of unsorted objects below.
 * Pure function: no overlaps between sections, and every object stays inside its section's bounds.
 */
export function layoutGroups(groups: GroupSized[], unsorted: SizedObject[] = []): LayoutResult {
  const sections: SectionLayout[] = groups.map((g) => {
    const { width, height, positions } = packGrid(g.objects)
    const w = Math.max(width, 0) + PADDING * 2
    const h = height + TITLE_H + PADDING * 2
    return {
      title: g.title,
      color: g.color,
      x: 0,
      y: 0,
      width: Math.max(w, MIN_SECTION_W),
      height: h,
      objects: g.objects.map((o) => {
        const p = positions.get(o.id)!
        return { id: o.id, x: p.x + PADDING, y: p.y + TITLE_H + PADDING }
      })
    }
  })

  const cols = sections.length <= 1 ? 1 : sections.length <= 4 ? 2 : 3
  const colWidths: number[] = []
  const rowHeights: number[] = []
  sections.forEach((sec, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    colWidths[col] = Math.max(colWidths[col] ?? 0, sec.width)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, sec.height)
  })
  const colX = cumulative(colWidths, SECTION_GAP)
  const rowY = cumulative(rowHeights, SECTION_GAP)
  sections.forEach((sec, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = colX[col]
    const y = rowY[row]
    sec.x = x
    sec.y = y
    sec.objects = sec.objects.map((o) => ({ ...o, x: o.x + x, y: o.y + y }))
  })

  const totalHeight = rowHeights.length ? rowY[rowY.length - 1] + rowHeights[rowHeights.length - 1] : 0
  const unsortedY = totalHeight + (sections.length && unsorted.length ? SECTION_GAP + 40 : 0)
  const { positions: unsortedPositions } = packGrid(unsorted)
  const unsortedPos = unsorted.map((o) => {
    const p = unsortedPositions.get(o.id)!
    return { id: o.id, x: p.x, y: p.y + unsortedY }
  })

  return { sections, unsorted: unsortedPos }
}
