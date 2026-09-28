import { FREEDRAW_DIAMETER_PER_STROKE_WIDTH, pressureFactor, type DrawStroke, type DrawSubmission } from '@shared/drawProtocol'

/**
 * Pure part of the iPad → Excalidraw conversion (unit-tested in Node): every stroke becomes a native Excalidraw
 * element skeleton, so the sketch stays fully editable on the Mac — freehand strokes are `freedraw` elements with
 * their real pencil pressures, snapped straight strokes are two-point `line` elements whose ends can be dragged.
 * `toExcalidraw.ts` feeds these through Excalidraw's own helpers (convertToExcalidrawElements / restoreElements).
 */

interface Common {
  x: number
  y: number
  width: number
  height: number
  strokeColor: string
  backgroundColor: 'transparent'
  fillStyle: 'solid'
  strokeWidth: number
  strokeStyle: 'solid'
  roughness: 0
  /** 0–100 */
  opacity: number
  angle: 0
  seed: number
  groupIds: string[]
  locked: false
  roundness: null
}

export interface FreedrawSkeleton extends Common {
  type: 'freedraw'
  points: [number, number][]
  pressures: number[]
  simulatePressure: boolean
  lastCommittedPoint: [number, number]
}

export interface LineSkeleton extends Common {
  type: 'line'
  points: [number, number][]
}

export type SketchSkeleton = FreedrawSkeleton | LineSkeleton

const r2 = (n: number): number => Math.round(n * 100) / 100
const seed = (): number => Math.floor(Math.random() * 2 ** 31)

function strokeToSkeleton(s: DrawStroke): SketchSkeleton {
  const pts = s.points.length === 1 ? [s.points[0], [s.points[0][0] + 0.01, s.points[0][1], s.points[0][2]] as typeof s.points[0]] : s.points
  const [x0, y0] = pts[0]
  const common = {
    x: r2(x0),
    y: r2(y0),
    strokeColor: s.color,
    backgroundColor: 'transparent' as const,
    fillStyle: 'solid' as const,
    strokeStyle: 'solid' as const,
    roughness: 0 as const,
    opacity: Math.round(s.opacity * 100),
    angle: 0 as const,
    seed: seed(),
    groupIds: [],
    locked: false as const,
    roundness: null
  }
  const rel = pts.map(([x, y]) => [r2(x - x0), r2(y - y0)] as [number, number])
  const xs = rel.map((p) => p[0])
  const ys = rel.map((p) => p[1])
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  if (s.straight) {
    const avg = pts.reduce((a, p) => a + p[2], 0) / pts.length
    return { ...common, type: 'line', points: [rel[0], rel[rel.length - 1]], width, height, strokeWidth: r2(s.pressure ? s.width * pressureFactor(avg) : s.width) }
  }
  const real = s.tool === 'pen' && !!s.pressure
  return {
    ...common,
    type: 'freedraw',
    points: rel,
    // the highlighter keeps an even width: constant pressure instead of simulated (speed-based) pressure
    pressures: real ? pts.map((p) => p[2]) : s.tool === 'highlighter' ? pts.map(() => 0.5) : [],
    simulatePressure: !real && s.tool !== 'highlighter',
    lastCommittedPoint: rel[rel.length - 1],
    width,
    height,
    strokeWidth: r2(s.width / FREEDRAW_DIAMETER_PER_STROKE_WIDTH)
  }
}

export function strokesToSkeletons(drawing: DrawSubmission): SketchSkeleton[] {
  return drawing.strokes.map(strokeToSkeleton)
}

/** Bounding box of the drawn ink (stroke widths included). */
export function drawingBounds(drawing: DrawSubmission): { minX: number; minY: number; width: number; height: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const s of drawing.strokes) {
    const half = (s.pressure ? s.width * pressureFactor(1) : s.width) / 2
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - half)
      minY = Math.min(minY, y - half)
      maxX = Math.max(maxX, x + half)
      maxY = Math.max(maxY, y + half)
    }
  }
  return Number.isFinite(minX) ? { minX, minY, width: maxX - minX, height: maxY - minY } : null
}

/** Whiteboard node size for the sketch: the drawing's aspect ratio, capped, never below the sketch node minimum. */
export function sketchNodeSize(drawing: DrawSubmission, max = { width: 560, height: 420 }, min = { width: 160, height: 120 }): { width: number; height: number } {
  const b = drawingBounds(drawing)
  // exportToSvg padding (16) on each side + the node's own inner padding (8)
  const pad = 2 * (16 + 8)
  const w = (b?.width ?? 0) + pad
  const h = (b?.height ?? 0) + pad
  const scale = Math.min(1, max.width / w, max.height / h)
  return { width: Math.round(Math.max(min.width, w * scale)), height: Math.round(Math.max(min.height, h * scale)) }
}
