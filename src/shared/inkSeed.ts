// Hand-drawn looking pen ink for seeded boards (first-run welcome board, demo seeds) — pure, no DOM.
// Produces the same frameless-sketch data pen mode creates: Excalidraw `freedraw` elements in board coordinates
// with simulated pressure, and a box equal to the ink bounds (scale 1), so the seeded ink behaves like real ink.
import { FREEDRAW_DIAMETER_PER_STROKE_WIDTH } from './drawProtocol'

export type Pt = [number, number]

export interface SeedStroke {
  points: Pt[]
  color?: string
  /** nominal diameter in px (pen mode's widths are 2.5 / 4.5 / 8) */
  width?: number
  /** 0–1; highlighter strokes use 0.35 */
  opacity?: number
}

export interface SeedInk {
  box: { x: number; y: number; width: number; height: number }
  elements: Record<string, unknown>[]
}

const r2 = (n: number): number => Math.round(n * 100) / 100

/** Small deterministic PRNG so seeded ink looks hand-drawn but is identical on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** A slightly wavy horizontal line from x1 to x2 at y (an underline). */
export function underline(x1: number, x2: number, y: number, seed = 1): Pt[] {
  const rand = rng(seed)
  const n = Math.max(8, Math.round(Math.abs(x2 - x1) / 18))
  const phase = rand() * Math.PI
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    return [x1 + (x2 - x1) * t, y + Math.sin(phase + t * Math.PI * 1.6) * 2.2 + (t - 0.5) * 3] as Pt
  })
}

/** A loose hand-drawn loop around a centre (overshoots its start like a real circled word). */
export function loop(cx: number, cy: number, rx: number, ry: number, seed = 1, turns = 1.12): Pt[] {
  const rand = rng(seed)
  const n = 56
  const start = -Math.PI * (0.6 + rand() * 0.2)
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const a = start + t * turns * Math.PI * 2
    // radius drifts a little over the turn so the end doesn't meet the start exactly
    const k = 1 + 0.06 * t + Math.sin(t * 7 + seed) * 0.015
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as Pt
  })
}

/** A curved arrow from → to (bent sideways by `bend` px): shaft + a two-sided head, as two strokes. */
export function arrow(from: Pt, to: Pt, bend = 30): Pt[][] {
  const [x1, y1] = from
  const [x2, y2] = to
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const nx = -(y2 - y1) / len
  const ny = (x2 - x1) / len
  const c: Pt = [mx + nx * bend, my + ny * bend]
  const n = 20
  const shaft = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const u = 1 - t
    return [u * u * x1 + 2 * u * t * c[0] + t * t * x2, u * u * y1 + 2 * u * t * c[1] + t * t * y2] as Pt
  })
  // head direction = tangent at the end
  const dx = x2 - c[0]
  const dy = y2 - c[1]
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const size = Math.min(18, len * 0.3)
  const wing = (s: number): Pt => [x2 - ux * size + -uy * size * 0.6 * s, y2 - uy * size + ux * size * 0.6 * s]
  // densely sampled so simulated pressure doesn't taper the short head strokes to nothing
  return [shaft, [...segment(wing(1), [x2, y2]), ...segment([x2, y2], wing(-1)).slice(1)]]
}

function segment(a: Pt, b: Pt, n = 6): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt)
}

/** One stroke → an Excalidraw freedraw element (simulated pressure, like a mouse/trackpad pen stroke). */
export function freedrawElement(stroke: SeedStroke, id: string, now = 0): Record<string, unknown> {
  const pts = stroke.points.length > 1 ? stroke.points : [stroke.points[0], [stroke.points[0][0] + 0.01, stroke.points[0][1]] as Pt]
  const [x0, y0] = pts[0]
  const rel = pts.map(([x, y]) => [r2(x - x0), r2(y - y0)] as Pt)
  const xs = rel.map((p) => p[0])
  const ys = rel.map((p) => p[1])
  return {
    id,
    type: 'freedraw',
    x: r2(x0),
    y: r2(y0),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    strokeColor: stroke.color ?? '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: r2((stroke.width ?? 4.5) / FREEDRAW_DIAMETER_PER_STROKE_WIDTH),
    strokeStyle: 'solid',
    roughness: 0,
    opacity: Math.round((stroke.opacity ?? 1) * 100),
    angle: 0,
    seed: Math.floor(Math.abs(x0 * 131 + y0 * 17)) % 2 ** 31,
    groupIds: [],
    locked: false,
    roundness: null,
    points: rel,
    pressures: [],
    simulatePressure: true,
    lastCommittedPoint: rel[rel.length - 1],
    version: 1,
    versionNonce: Math.floor(Math.abs(x0 * 7 + y0 * 3)) % 2 ** 31,
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    frameId: null
  }
}

/**
 * Frameless ink object for `addObject({ kind: 'sketch', ...box, data: { elements, files: {}, frameless: true } })`.
 * The box is the points' bounds grown by the stroke radius (+2px like pen mode's INK_PAD) — the ink shows at scale ≈ 1.
 */
export function seedInk(strokes: SeedStroke[], idPrefix = 'seed'): SeedInk {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of strokes) {
    // simulated pressure never goes past half the perfect-freehand size (strokeWidth × 4.25)
    const half = ((s.width ?? 4.5) / FREEDRAW_DIAMETER_PER_STROKE_WIDTH) * 4.25 * 0.5 + 2
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - half)
      minY = Math.min(minY, y - half)
      maxX = Math.max(maxX, x + half)
      maxY = Math.max(maxY, y + half)
    }
  }
  if (!Number.isFinite(minX)) throw new Error('seedInk needs at least one point')
  return {
    box: { x: r2(minX), y: r2(minY), width: r2(maxX - minX), height: r2(maxY - minY) },
    elements: strokes.map((s, i) => freedrawElement(s, `${idPrefix}-${i}`))
  }
}
