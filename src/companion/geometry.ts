/** Pure stroke geometry for the Sidera Draw companion (unit-tested in Node). */
export { pressureFactor } from '../shared/drawProtocol'
export type Pt = [number, number, number]

/** Distance from point p to segment ab. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * "Hold to straighten": is this stroke close enough to its start→end chord to snap to a line?
 * `minLen` / `tol` are in the same units as the points (world px, already divided by zoom by the caller).
 */
export function isRoughlyStraight(points: Pt[], minLen = 24, tol = 10): boolean {
  if (points.length < 2) return false
  const [ax, ay] = points[0]
  const [bx, by] = points[points.length - 1]
  const len = Math.hypot(bx - ax, by - ay)
  if (len < minLen) return false
  // path length must not be much longer than the chord (rules out zig-zags and back-and-forth scribbles)
  let path = 0
  for (let i = 1; i < points.length; i++) path += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  if (path > len * 1.25 + tol) return false
  const limit = Math.max(tol, len * 0.08)
  return points.every(([x, y]) => segDist(x, y, ax, ay, bx, by) <= limit)
}

/** Does a circle at (x, y) with radius r touch the stroke (whose drawn half-width is `half`)? */
export function hitsStroke(points: Pt[], half: number, x: number, y: number, r: number): boolean {
  const reach = half + r
  if (points.length === 1) return Math.hypot(points[0][0] - x, points[0][1] - y) <= reach
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (segDist(x, y, a[0], a[1], b[0], b[1]) <= reach) return true
  }
  return false
}

export function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

// ─── images ─────────────────────────────────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Scale (w, h) down (never up) so it fits into (maxW, maxH), keeping the aspect ratio. */
export function fitSize(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const k = Math.min(1, maxW / w, maxH / h)
  return { width: w * k, height: h * k }
}

/** Corners in the order top-left, top-right, bottom-right, bottom-left. */
export const corners = (r: Rect): [number, number][] => [
  [r.x, r.y],
  [r.x + r.width, r.y],
  [r.x + r.width, r.y + r.height],
  [r.x, r.y + r.height]
]

export const contains = (r: Rect, x: number, y: number): boolean => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height

/**
 * Resize by dragging `corner` (index into `corners`) to (x, y): the opposite corner stays put and the aspect ratio is
 * kept (the larger of the two relative changes wins). Never smaller than `minSide` on the short side.
 */
export function resizeFromCorner(r: Rect, corner: number, x: number, y: number, minSide = 12): Rect {
  const [ax, ay] = corners(r)[(corner + 2) % 4]
  const k = Math.max(Math.abs(x - ax) / r.width, Math.abs(y - ay) / r.height, minSide / Math.min(r.width, r.height))
  const width = r.width * k
  const height = r.height * k
  // which side of the anchor the dragged corner is on is fixed by the corner (no flipping through the anchor)
  const left = corner === 0 || corner === 3
  const top = corner === 0 || corner === 1
  return { x: left ? ax - width : ax, y: top ? ay - height : ay, width, height }
}

/**
 * The page's canvases used to be inverted with a CSS filter in dark mode (like the Mac's sketch preview). Photos must
 * not be inverted, so ink colours are mapped in JS instead: this is `invert(1) hue-rotate(180deg)` applied to one sRGB
 * colour, with the matrix from the Filter Effects spec.
 */
export function darkInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => 1 - c / 255)
  const m = [
    [-0.574, 1.43, 0.144],
    [0.426, 0.43, 0.144],
    [0.426, 1.43, -0.856]
  ]
  const out = m.map((row) => Math.round(Math.max(0, Math.min(1, row[0] * r + row[1] * g + row[2] * b)) * 255))
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
