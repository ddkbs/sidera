/**
 * Shape recognition for "hold the pen still": a held stroke snaps to the shape it looks like. Pure geometry on board
 * points ([x, y, pressure]); the result is again a list of pen points, so it stays an ordinary ink stroke.
 * Open strokes become a straight line (whose end then follows the pen); closed ones a circle / ellipse, triangle,
 * rectangle / square, other quadrilateral or polygon — or nothing, when no shape fits well enough.
 */
export type Pt = [number, number, number]
export type RecognizedKind = 'line' | 'circle' | 'ellipse' | 'triangle' | 'square' | 'rectangle' | 'polygon'
export interface Recognized {
  kind: RecognizedKind
  points: Pt[]
}

type V = [number, number]

const dist = (a: V, b: V): number => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Distance of p from segment a–b. */
function segDist(p: V, a: V, b: V): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  if (!l2) return dist(p, a)
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
  return dist(p, [a[0] + t * dx, a[1] + t * dy])
}

/** Ramer–Douglas–Peucker on an open polyline. */
function rdp(pts: V[], eps: number): V[] {
  if (pts.length < 3) return pts
  let max = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]]
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)]
}

/** Interior turn at b (0 = straight on, π = reversal). */
const turn = (a: V, b: V, c: V): number => {
  const a1 = Math.atan2(b[1] - a[1], b[0] - a[0])
  const a2 = Math.atan2(c[1] - b[1], c[0] - b[0])
  let d = Math.abs(a2 - a1)
  if (d > Math.PI) d = 2 * Math.PI - d
  return d
}

/** Evenly sampled closed outline through `vertices` (board units), constant pressure. */
function outline(vertices: V[], pressure: number, step = 4): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    const n = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, pressure])
  }
  out.push([vertices[0][0], vertices[0][1], pressure])
  return out
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] ?? 0.5
}

/** Straight stroke from `a` to `b`, evenly sampled. */
export function straightLine(a: Pt, b: [number, number], pressure: number): Pt[] {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, pressure] as Pt)
}

export function recognize(points: Pt[]): Recognized | null {
  if (points.length < 3) return null
  const pressure = median(points.map((p) => p[2]))
  const xy = points.map((p) => [p[0], p[1]] as V)
  const xs = xy.map((p) => p[0])
  const ys = xy.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const w = maxX - minX
  const h = maxY - minY
  const diag = Math.hypot(w, h)
  if (!diag) return null
  let length = 0
  for (let i = 1; i < xy.length; i++) length += dist(xy[i - 1], xy[i])
  const gap = dist(xy[0], xy[xy.length - 1])

  // open stroke → straight line (the hold gesture's original meaning)
  if (gap > Math.max(0.2 * length, 0.25 * diag)) return { kind: 'line', points: straightLine(points[0], xy[xy.length - 1], pressure) }

  // closed: corners first (polygons), then the ellipse fit
  const eps = 0.07 * diag
  let corners = rdp([...xy, xy[0]], eps).slice(0, -1)
  // drop vertices where the line runs straight on (start / end mid-edge) and merge near-duplicates
  for (let changed = true; changed && corners.length > 2; ) {
    changed = false
    for (let i = 0; i < corners.length; i++) {
      const a = corners[(i - 1 + corners.length) % corners.length]
      const b = corners[i]
      const c = corners[(i + 1) % corners.length]
      if (turn(a, b, c) < (25 * Math.PI) / 180 || dist(a, b) < 0.12 * diag) {
        corners.splice(i, 1)
        changed = true
        break
      }
    }
  }
  const polyError = (vs: V[]): number => {
    let sum = 0
    for (const p of xy) sum += Math.min(...vs.map((v, i) => segDist(p, v, vs[(i + 1) % vs.length])))
    return sum / xy.length / diag
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const rx = w / 2
  const ry = h / 2
  const ellipseError =
    rx && ry ? xy.reduce((s, p) => s + Math.abs(Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry) - 1), 0) / xy.length : Infinity

  if (corners.length >= 3 && corners.length <= 6 && polyError(corners) < 0.035 && !(ellipseError < 0.07)) {
    if (corners.length === 3) return { kind: 'triangle', points: outline(corners, pressure) }
    if (corners.length === 4) {
      const right = corners.every((b, i) => {
        const t = turn(corners[(i + 3) % 4], b, corners[(i + 1) % 4])
        return Math.abs(t - Math.PI / 2) < (22 * Math.PI) / 180
      })
      if (right) {
        // rectangle: square up along its dominant edge direction
        const ang = Math.atan2(corners[1][1] - corners[0][1], corners[1][0] - corners[0][0])
        const axisAligned = Math.abs(Math.sin(2 * ang)) < Math.sin((14 * Math.PI) / 180)
        const ca = axisAligned ? 1 : Math.cos(ang)
        const sa = axisAligned ? 0 : Math.sin(ang)
        // corners in the rectangle's own frame
        const local = xy.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca] as V)
        const lx = local.map((p) => p[0])
        const ly = local.map((p) => p[1])
        let x0 = Math.min(...lx)
        let x1 = Math.max(...lx)
        let y0 = Math.min(...ly)
        let y1 = Math.max(...ly)
        const square = Math.abs(x1 - x0 - (y1 - y0)) < 0.12 * Math.max(x1 - x0, y1 - y0)
        if (square) {
          const s = (x1 - x0 + (y1 - y0)) / 2
          const mx = (x0 + x1) / 2
          const my = (y0 + y1) / 2
          ;[x0, x1, y0, y1] = [mx - s / 2, mx + s / 2, my - s / 2, my + s / 2]
        }
        const back = ([x, y]: V): V => [x * ca - y * sa, x * sa + y * ca]
        return { kind: square ? 'square' : 'rectangle', points: outline([back([x0, y0]), back([x1, y0]), back([x1, y1]), back([x0, y1])], pressure) }
      }
    }
    return { kind: 'polygon', points: outline(corners, pressure) }
  }

  if (ellipseError < 0.16) {
    const circle = Math.min(rx, ry) / Math.max(rx, ry) > 0.85
    const r = (rx + ry) / 2
    const ex = circle ? r : rx
    const ey = circle ? r : ry
    const n = Math.max(32, Math.ceil((2 * Math.PI * Math.max(ex, ey)) / 4))
    const start = Math.atan2((xy[0][1] - cy) / (ey || 1), (xy[0][0] - cx) / (ex || 1))
    const pts: Pt[] = Array.from({ length: n + 1 }, (_, i) => {
      const a = start + (2 * Math.PI * i) / n
      return [cx + ex * Math.cos(a), cy + ey * Math.sin(a), pressure]
    })
    return { kind: circle ? 'circle' : 'ellipse', points: pts }
  }
  return null
}
