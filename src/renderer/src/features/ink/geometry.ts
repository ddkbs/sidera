import { getStroke } from 'perfect-freehand'

/**
 * Pure geometry of "ink" (frameless sketches drawn on the board). No DOM / React: unit-tested in Node.
 *
 * A sketch object stores an Excalidraw scene. Its elements live in their own scene coordinates; the whiteboard
 * object's box shows the ink bounds (`inkBounds`) scaled uniformly and centred (like SVG `xMidYMid meet`, see
 * `fitTransform`). Pen-mode sketches are created with box == bounds (scale 1), so the ink lands exactly where it
 * was drawn; appending strokes / erasing keeps the current scale so nothing already on the board moves.
 */

/** The subset of an Excalidraw element that ink rendering and hit-testing read. */
export interface InkElement {
  id?: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  angle?: number
  strokeColor?: string
  backgroundColor?: string
  strokeWidth?: number
  opacity?: number
  isDeleted?: boolean
  points?: readonly (readonly [number, number])[]
  pressures?: readonly number[]
  simulatePressure?: boolean
  lastCommittedPoint?: readonly [number, number] | null
  fileId?: string | null
  text?: string
  fontSize?: number
  endArrowhead?: string | null
  startArrowhead?: string | null
}

export interface Point {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Space kept around the ink so anti-aliased edges are never clipped. */
export const INK_PAD = 2

export const liveElements = <T extends InkElement>(elements: readonly unknown[] | undefined): T[] =>
  (Array.isArray(elements) ? elements : []).filter((e): e is T => !!e && typeof e === 'object' && !(e as InkElement).isDeleted && typeof (e as InkElement).type === 'string')

// ─── freedraw outline (identical to Excalidraw's `getFreeDrawSvgPath`) ─────────────────────────────

/** Outline polygon of a freedraw element in absolute scene coordinates — same perfect-freehand options as Excalidraw. */
export function freedrawOutline(el: InkElement): [number, number][] {
  const pts = el.points ?? []
  const input = el.simulatePressure
    ? pts.map(([x, y]) => [x, y])
    : pts.length
      ? pts.map(([x, y], i) => [x, y, el.pressures?.[i] ?? 0.5])
      : [[0, 0, 0.5]]
  const outline = getStroke(input, {
    simulatePressure: !!el.simulatePressure,
    size: (el.strokeWidth ?? 1) * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: !!el.lastCommittedPoint
  })
  return outline.map(([x, y]) => [x + el.x, y + el.y])
}

const med = (a: number[], b: number[]): number[] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const f2 = (n: number): string => (Math.round(n * 100) / 100).toString()

/** Smooth closed SVG path through an outline (Excalidraw's `getSvgPathFromStroke`). */
export function outlinePath(points: readonly (readonly [number, number])[]): string {
  if (!points.length) return ''
  const parts: string[] = [`M${f2(points[0][0])},${f2(points[0][1])} Q`]
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const next = i === points.length - 1 ? points[0] : points[i + 1]
    const m = med(p as unknown as number[], next as unknown as number[])
    parts.push(`${f2(p[0])},${f2(p[1])} ${f2(m[0])},${f2(m[1])}`)
  }
  parts.push(`L${f2(points[0][0])},${f2(points[0][1])} Z`)
  return parts.join(' ')
}

// ─── bounds ──────────────────────────────────────────────────────────────────────────────────────────

const rotate = (p: Point, c: Point, angle: number): Point => {
  if (!angle) return p
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }
}

/** Absolute points of a line-like element (line / arrow / freedraw centre line). */
/** Smooth SVG path through points (Catmull-Rom → cubic Béziers): how curved lines (`roundness`) are drawn. */
export function smoothPath(pts: readonly Point[]): string {
  if (pts.length < 3) return pts.map((p, j) => `${j ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
  }
  return d
}

/** A line/arrow with point `index` moved to absolute scene position `to` (first point stays [0, 0], size updated). */
export function movePoint<T extends InkElement>(el: T, index: number, to: Point): T {
  const abs = absPoints(el).map((p, i) => (i === index ? to : p))
  const o = abs[0]
  const pts = abs.map((p) => [p.x - o.x, p.y - o.y] as [number, number])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { ...el, x: o.x, y: o.y, points: pts, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

export const absPoints = (el: InkElement): Point[] => (el.points ?? []).map(([x, y]) => ({ x: el.x + x, y: el.y + y }))

/** Axis-aligned bounds of one element in scene coordinates, stroke width included. */
export function elementBounds(el: InkElement): Rect | null {
  let pts: Point[]
  let pad = 0
  if (el.type === 'freedraw') {
    pts = freedrawOutline(el).map(([x, y]) => ({ x, y }))
  } else if ((el.type === 'line' || el.type === 'arrow') && el.points?.length) {
    pts = absPoints(el)
    pad = (el.strokeWidth ?? 1) / 2 + (el.type === 'arrow' ? 8 : 0)
  } else {
    const w = el.width ?? 0
    const h = el.height ?? 0
    const c = { x: el.x + w / 2, y: el.y + h / 2 }
    pts = [
      { x: el.x, y: el.y },
      { x: el.x + w, y: el.y },
      { x: el.x + w, y: el.y + h },
      { x: el.x, y: el.y + h }
    ].map((p) => rotate(p, c, el.angle ?? 0))
    pad = el.type === 'image' || el.type === 'text' ? 0 : (el.strokeWidth ?? 1) / 2
  }
  if (!pts.length) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad
  return { x: minX, y: minY, width: Math.max(...xs) + pad - minX, height: Math.max(...ys) + pad - minY }
}

export function unionRects(rects: readonly (Rect | null)[]): Rect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    if (!r) continue
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null
}

/** Bounds of all live elements plus `INK_PAD`, never degenerate (a dot still gets a 1×1 box). */
export function inkBounds(elements: readonly unknown[] | undefined): Rect | null {
  const u = unionRects(liveElements(elements).map(elementBounds))
  if (!u) return null
  return { x: u.x - INK_PAD, y: u.y - INK_PAD, width: Math.max(1, u.width + 2 * INK_PAD), height: Math.max(1, u.height + 2 * INK_PAD) }
}

// ─── scene ↔ board mapping ───────────────────────────────────────────────────────────────────────────

export interface FitTransform {
  s: number
  ox: number
  oy: number
}

/** Scene → board mapping that shows `bounds` inside `box` (uniform scale, centred — SVG `xMidYMid meet`). */
export function fitTransform(bounds: Rect, box: Rect): FitTransform {
  const s = Math.min(box.width / bounds.width, box.height / bounds.height) || 1
  return { s, ox: box.x + (box.width - bounds.width * s) / 2 - bounds.x * s, oy: box.y + (box.height - bounds.height * s) / 2 - bounds.y * s }
}

export const sceneToBoard = (p: Point, t: FitTransform): Point => ({ x: p.x * t.s + t.ox, y: p.y * t.s + t.oy })
export const boardToScene = (p: Point, t: FitTransform): Point => ({ x: (p.x - t.ox) / t.s, y: (p.y - t.oy) / t.s })

/** New object box after the scene bounds changed (strokes added or erased), keeping every existing stroke in place. */
export function reboxed(t: FitTransform, newBounds: Rect): Rect {
  const tl = sceneToBoard(newBounds, t)
  return { x: tl.x, y: tl.y, width: newBounds.width * t.s, height: newBounds.height * t.s }
}

// ─── hit testing ─────────────────────────────────────────────────────────────────────────────────────

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function distToPolyline(p: Point, pts: readonly Point[]): number {
  if (!pts.length) return Infinity
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y)
  let d = Infinity
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]))
  return d
}

/** Does a circle of radius `r` (scene units) at `p` touch the element's visible ink? */
export function hitElement(el: InkElement, p: Point, r: number): boolean {
  if (el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') {
    // freedraw: centre line, radius = the widest the stroke gets (size/2 at full pressure)
    const half = el.type === 'freedraw' ? ((el.strokeWidth ?? 1) * 4.25) / 2 : (el.strokeWidth ?? 1) / 2
    return distToPolyline(p, absPoints(el)) <= r + half
  }
  const w = el.width ?? 0
  const h = el.height ?? 0
  const q = rotate(p, { x: el.x + w / 2, y: el.y + h / 2 }, -(el.angle ?? 0))
  const inside = q.x >= el.x - r && q.x <= el.x + w + r && q.y >= el.y - r && q.y <= el.y + h + r
  if (!inside) return false
  // outlined shapes are only hit on their outline unless filled; images and text anywhere in their box
  const filled = el.type === 'image' || el.type === 'text' || (!!el.backgroundColor && el.backgroundColor !== 'transparent')
  if (filled) return true
  const edge = Math.min(q.x - el.x, el.x + w - q.x, q.y - el.y, el.y + h - q.y)
  return edge <= r + (el.strokeWidth ?? 1)
}

/** Ids of the live elements the eraser circle touches (scene coordinates). */
export function elementsHit(elements: readonly unknown[] | undefined, p: Point, r: number): string[] {
  return liveElements(elements)
    .filter((el) => el.id && hitElement(el, p, r))
    .map((el) => el.id!)
}

/** The same hit test from board coordinates, for a sketch object shown in `box`. */
export function hitInkObject(elements: readonly unknown[] | undefined, box: Rect, boardPoint: Point, boardRadius: number): string[] {
  const b = inkBounds(elements)
  if (!b) return []
  const t = fitTransform(b, box)
  return elementsHit(elements, boardToScene(boardPoint, t), boardRadius / t.s)
}

// ─── grouping strokes into ink objects ───────────────────────────────────────────────────────────────

/** Strokes drawn within this pause belong to the same ink object. */
export const GROUP_PAUSE_MS = 1500
/** A stroke starting farther than this (screen px) from the current group starts a new one. */
export const GROUP_GAP_PX = 160

export const distToRect = (p: Point, r: Rect): number =>
  Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)))

/**
 * Should a stroke starting at `start` (board coords) at time `now` join the open group (board bounds `group`, last
 * stroke finished at `lastAt`)? `gap` is in board units (GROUP_GAP_PX / zoom).
 */
export function joinsGroup(group: { bounds: Rect; lastAt: number } | null, start: Point, now: number, gap: number, pauseMs = GROUP_PAUSE_MS): boolean {
  if (!group) return false
  return now - group.lastAt < pauseMs && distToRect(start, group.bounds) <= gap
}

/** Ink object (by board box) a new stroke should be appended to: the nearest one within `gap`, else null. */
export function appendTarget<T extends { id: string; box: Rect }>(candidates: readonly T[], start: Point, gap: number): T | null {
  let best: T | null = null
  let bestD = Infinity
  for (const c of candidates) {
    const d = distToRect(start, c.box)
    if (d <= gap && d < bestD) {
      best = c
      bestD = d
    }
  }
  return best
}

// ─── dark mode ───────────────────────────────────────────────────────────────────────────────────────

function parseColor(c: string): [number, number, number, number] | null {
  const s = c.trim().toLowerCase()
  if (s === 'black') return [0, 0, 0, 1]
  if (s === 'white') return [255, 255, 255, 1]
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    const h = m[1]
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((ch) => parseInt(ch + ch, 16))
      return [v[0], v[1], v[2], h.length === 4 ? v[3] / 255 : 1]
    }
    if (h.length === 6 || h.length === 8) {
      const v = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16))
      return [v[0], v[1], v[2], h.length === 8 ? v[3] / 255 : 1]
    }
    return null
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(s)
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
  return null
}

/**
 * Colour as it looks under Excalidraw's dark-mode filter `invert(93%) hue-rotate(180deg)`: dark ink becomes light,
 * hues stay recognisable. Applied per element so embedded photos keep their real colours.
 */
export function darkInk(color: string | undefined): string | undefined {
  if (!color || color === 'transparent') return color
  const rgba = parseColor(color)
  if (!rgba) return color
  const a = 0.93
  const [r, g, b] = rgba.slice(0, 3).map((v) => a + (v / 255) * (1 - 2 * a))
  const clamp = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255)
  const out = [clamp(-0.574 * r + 1.43 * g + 0.144 * b), clamp(0.426 * r + 0.43 * g + 0.144 * b), clamp(0.426 * r + 1.43 * g - 0.856 * b)]
  const hex = out.map((v) => v.toString(16).padStart(2, '0')).join('')
  return rgba[3] < 1 ? `rgba(${out.join(', ')}, ${rgba[3]})` : `#${hex}`
}

// ─── screen ↔ board (xyflow viewport: board = (screen − container origin − translate) / zoom) ──────

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export const screenToBoard = (client: Point, origin: Point, vp: Viewport): Point => ({
  x: (client.x - origin.x - vp.x) / vp.zoom,
  y: (client.y - origin.y - vp.y) / vp.zoom
})

export const boardToScreen = (p: Point, origin: Point, vp: Viewport): Point => ({ x: p.x * vp.zoom + vp.x + origin.x, y: p.y * vp.zoom + vp.y + origin.y })

/** Holding the pen still this long mid-stroke turns the stroke into a straight line (start → pen). */
export const STRAIGHTEN_HOLD_MS = 450
/** Screen px the pen may wobble while held. */
export const STRAIGHTEN_SLOP_PX = 4
/** Strokes shorter than this (screen px) are not straightened (dots, ticks). */
export const STRAIGHTEN_MIN_PX = 24

/** Points of a straight stroke from `a` to `b` (board units), evenly sampled so the outline stays smooth. */
export function straightLine(a: [number, number, number], b: [number, number], pressure: number): [number, number, number][] {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4))
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, pressure] as [number, number, number])
}

/** Cuts a stroke into dashes of `dash` board units with `gap` between them (by arc length, pressure interpolated). */
export function dashSegments(points: [number, number, number][], dash: number, gap: number): [number, number, number][][] {
  if (points.length < 2) return [points]
  const out: [number, number, number][][] = []
  let cur: [number, number, number][] = [points[0]]
  let on = true
  let left = dash
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]
    const b = points[i]
    let len = Math.hypot(b[0] - a[0], b[1] - a[1])
    while (len >= left) {
      const f = left / len
      const cut: [number, number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
      if (on) out.push([...cur, cut])
      cur = [cut]
      on = !on
      len -= left
      left = on ? dash : gap
      a = cut
    }
    left -= len
    if (on) cur.push(b)
  }
  if (on && cur.length > 1) out.push(cur)
  return out.length ? out : [points]
}
