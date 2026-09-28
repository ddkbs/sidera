/** Pure stroke geometry for the Sidera Draw companion (unit-tested in Node). */
export type Pt = [number, number, number]

/**
 * Perfect-freehand (Excalidraw's freedraw renderer) radius curve, normalised so that pressure 0.5 → 1.
 * Drawing with this factor on the iPad makes strokes look the same once they are Excalidraw elements on the Mac.
 */
export const pressureFactor = (p: number): number => Math.sin((Math.PI / 2) * (0.2 + 0.6 * p)) / Math.SQRT1_2

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
