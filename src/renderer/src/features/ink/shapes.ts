/**
 * Pure builders for the "Shapes" insert group: complete native Excalidraw element skeletons (rectangle, ellipse,
 * diamond, line, arrow — cross/check/star/curved-arrow are built from those same primitives), the same way
 * `elements.ts` builds ink from pen strokes and `inkSeed.ts` builds seeded freedraw. Each shape becomes a
 * frameless sketch object (`data: { elements, files: {}, frameless: true }`, box == the shape's own bounds at
 * scale 1) so it renders via `InkSvg`, resizes/rotates/recolours like any sketch, and opens in the Excalidraw
 * editor on double-click.
 */

export type ShapeKind = 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'curved-arrow' | 'curve' | 'semicircle' | 'cross' | 'check' | 'star'

export const SHAPE_KINDS: readonly ShapeKind[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'curved-arrow', 'curve', 'semicircle', 'cross', 'check', 'star']

export interface ShapeInsert {
  /** Elements in their own box, top-left at (0, 0) — box == bounds at scale 1, like pen-mode ink. */
  elements: Record<string, unknown>[]
  width: number
  height: number
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const nonce = (): number => Math.floor(Math.random() * 2 ** 31)

/** Fields every Excalidraw element needs, whether or not the editor (or a future Excalidraw upgrade) reads them. */
function common(now: number): Record<string, unknown> {
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: nonce(),
    version: 1,
    versionNonce: nonce(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false
  }
}

function box(type: string, x: number, y: number, width: number, height: number, now: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...common(now), id: `${type}-${nonce()}`, type, x: r2(x), y: r2(y), width: r2(width), height: r2(height), ...extra }
}

/** A line/arrow element: `points` are relative to (x, y) — the first point is always [0, 0]. */
function linear(type: 'line' | 'arrow', x: number, y: number, points: readonly [number, number][], now: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return box(type, x, y, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), now, {
    points: points.map(([px, py]) => [r2(px), r2(py)]),
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: type === 'arrow' ? 'arrow' : null,
    ...extra
  })
}

/** Points of a regular star polygon (closed: the first point repeats at the end), centred in a `size`×`size` box. */
function starPoints(size: number, points = 5): [number, number][] {
  const cx = size / 2
  const cy = size / 2
  const outer = size / 2
  const inner = outer * 0.382
  const pts: [number, number][] = []
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    pts.push([r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r)])
  }
  return pts
}

/** Build one shape at origin (0, 0), sized around `size` px. */
export function buildShape(kind: ShapeKind, size = 120, now = Date.now()): ShapeInsert {
  switch (kind) {
    case 'rectangle': {
      const w = size
      const h = size * 0.66
      return { elements: [box('rectangle', 0, 0, w, h, now)], width: w, height: h }
    }
    case 'ellipse': {
      const w = size
      const h = size * 0.75
      return { elements: [box('ellipse', 0, 0, w, h, now)], width: w, height: h }
    }
    case 'diamond': {
      const w = size
      const h = size * 0.8
      return { elements: [box('diamond', 0, 0, w, h, now)], width: w, height: h }
    }
    case 'line': {
      const w = size
      const h = size * 0.35
      return { elements: [linear('line', 0, 0, [[0, h], [w, 0]], now)], width: w, height: h }
    }
    case 'arrow': {
      const w = size
      const h = size * 0.35
      return { elements: [linear('arrow', 0, 0, [[0, h], [w, 0]], now)], width: w, height: h }
    }
    // curved lines: few points + roundness → drawn smooth, each point draggable on the board
    case 'curved-arrow': {
      const w = size
      const h = size * 0.5
      return { elements: [linear('arrow', 0, 0, [[0, h], [w / 2, 0], [w, h * 0.4]], now, { roundness: { type: 2 } })], width: w, height: h }
    }
    case 'curve': {
      const w = size
      const h = size * 0.45
      return { elements: [linear('line', 0, 0, [[0, h], [w * 0.33, 0], [w * 0.66, h], [w, 0]], now, { roundness: { type: 2 } })], width: w, height: h }
    }
    case 'semicircle': {
      const r = size / 2
      const pts: [number, number][] = [0, 1, 2, 3, 4].map((k) => {
        const a = Math.PI + (k * Math.PI) / 4
        return [r2(r + r * Math.cos(a)), r2(r + r * Math.sin(a))]
      })
      return { elements: [linear('line', 0, 0, pts, now, { roundness: { type: 2 } })], width: size, height: r }
    }
    case 'cross': {
      const s = size * 0.8
      return {
        elements: [linear('line', 0, 0, [[0, 0], [s, s]], now), linear('line', 0, 0, [[s, 0], [0, s]], now)],
        width: s,
        height: s
      }
    }
    case 'check': {
      const w = size * 0.75
      const h = size * 0.6
      const points: [number, number][] = [[0, h * 0.55], [w * 0.38, h], [w, 0]]
      return { elements: [linear('line', 0, 0, points, now, { strokeWidth: 4 })], width: w, height: h }
    }
    case 'star': {
      const s = size * 0.85
      const points = starPoints(s)
      return { elements: [linear('line', 0, 0, points, now)], width: s, height: s }
    }
  }
}
