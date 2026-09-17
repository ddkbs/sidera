/**
 * Pure geometry for the "Tidy up" actions of the selection toolbar.
 * Everything here works on plain boxes so it can be unit-tested without React Flow.
 */

export interface Box {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export type AlignMode = 'left' | 'center-h' | 'right' | 'top' | 'middle' | 'bottom'
export type ArrangeMode = AlignMode | 'distribute-h' | 'distribute-v' | 'grid'

export interface Placement {
  id: string
  x: number
  y: number
}

/** Gap between cells when arranging as a grid. */
export const GRID_GAP = 32

const round = (n: number): number => Math.round(n * 100) / 100

/** Bounding box of `boxes`; `{x:0,y:0,width:0,height:0}` for an empty list. */
export function bounds(boxes: Box[]): { x: number; y: number; width: number; height: number } {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

function align(boxes: Box[], mode: AlignMode): Placement[] {
  const b = bounds(boxes)
  return boxes.map((box) => {
    switch (mode) {
      case 'left':
        return { id: box.id, x: b.x, y: box.y }
      case 'center-h':
        return { id: box.id, x: b.x + (b.width - box.width) / 2, y: box.y }
      case 'right':
        return { id: box.id, x: b.x + b.width - box.width, y: box.y }
      case 'top':
        return { id: box.id, x: box.x, y: b.y }
      case 'middle':
        return { id: box.id, x: box.x, y: b.y + (b.height - box.height) / 2 }
      case 'bottom':
        return { id: box.id, x: box.x, y: b.y + b.height - box.height }
    }
  })
}

/** Equal gaps between neighbours, keeping the outermost two boxes where they are. */
function distribute(boxes: Box[], axis: 'h' | 'v'): Placement[] {
  if (boxes.length < 3) return boxes.map((b) => ({ id: b.id, x: b.x, y: b.y }))
  const size = (b: Box): number => (axis === 'h' ? b.width : b.height)
  const start = (b: Box): number => (axis === 'h' ? b.x : b.y)
  const sorted = [...boxes].sort((a, b) => start(a) + size(a) / 2 - (start(b) + size(b) / 2))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = start(last) + size(last) - start(first)
  const used = sorted.reduce((sum, b) => sum + size(b), 0)
  const gap = (span - used) / (sorted.length - 1)
  let cursor = start(first)
  const byId = new Map<string, number>()
  for (const b of sorted) {
    byId.set(b.id, cursor)
    cursor += size(b) + gap
  }
  return boxes.map((b) => {
    const v = byId.get(b.id)!
    return axis === 'h' ? { id: b.id, x: v, y: b.y } : { id: b.id, x: b.x, y: v }
  })
}

/** Reading-order grid of uniform cells, anchored at the selection's top-left corner. */
function grid(boxes: Box[], gap = GRID_GAP): Placement[] {
  const b = bounds(boxes)
  const cols = Math.max(1, Math.ceil(Math.sqrt(boxes.length)))
  const cellW = Math.max(...boxes.map((x) => x.width))
  const cellH = Math.max(...boxes.map((x) => x.height))
  // Reading order: rows first (boxes roughly on one row keep their left-to-right order).
  const rowTolerance = cellH / 2
  const sorted = [...boxes].sort((p, q) => (Math.abs(p.y - q.y) > rowTolerance ? p.y - q.y : p.x - q.x))
  return sorted.map((box, i) => ({
    id: box.id,
    x: b.x + (i % cols) * (cellW + gap) + (cellW - box.width) / 2,
    y: b.y + Math.floor(i / cols) * (cellH + gap) + (cellH - box.height) / 2
  }))
}

/** New positions for `boxes` under `mode`; only boxes that actually move are returned. */
export function arrange(boxes: Box[], mode: ArrangeMode, gap = GRID_GAP): Placement[] {
  if (boxes.length < 2) return []
  const next =
    mode === 'grid' ? grid(boxes, gap) : mode === 'distribute-h' ? distribute(boxes, 'h') : mode === 'distribute-v' ? distribute(boxes, 'v') : align(boxes, mode)
  const before = new Map(boxes.map((b) => [b.id, b]))
  return next
    .map((p) => ({ id: p.id, x: round(p.x), y: round(p.y) }))
    .filter((p) => {
      const b = before.get(p.id)!
      return Math.abs(b.x - p.x) > 0.01 || Math.abs(b.y - p.y) > 0.01
    })
}
