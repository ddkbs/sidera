// Lightweight board previews for Home tiles: object geometry + kind (+ a short label, simplified ink), never content.
import type { BoardPreview, BoardPreviewItem, BoardPreviewKind, ID } from './types'

/** One placed object as read for a preview (card kind/title/colour joined in for card objects). */
export interface PreviewSource {
  kind: string
  x: number
  y: number
  width: number
  height: number
  z: number
  color: string | null
  data: Record<string, unknown>
  cardKind?: string | null
  cardTitle?: string | null
  cardColor?: string | null
}

export const PREVIEW_LIMITS = { items: 60, strokes: 24, points: 24, label: 40 } as const

const r1 = (n: number): number => Math.round(n * 10) / 10
const clip = (s: unknown): string | undefined => {
  const t = typeof s === 'string' ? s.trim().split('\n')[0] : ''
  return t ? t.slice(0, PREVIEW_LIMITS.label) : undefined
}

/** Keeps at most `max` points of a polyline (always the first and last). */
export function decimate<T>(pts: readonly T[], max: number): T[] {
  if (pts.length <= max) return [...pts]
  const out: T[] = []
  for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))])
  return out
}

type El = { type?: string; x?: number; y?: number; points?: [number, number][]; strokeColor?: string; strokeWidth?: number; opacity?: number; isDeleted?: boolean }

/** Frameless ink → a few simplified polylines in board coordinates (scene bounds fitted into the object's box). */
function inkStrokes(o: PreviewSource): BoardPreviewItem['strokes'] {
  const els = (Array.isArray(o.data.elements) ? (o.data.elements as El[]) : []).filter(
    (e) => e && !e.isDeleted && (e.type === 'freedraw' || e.type === 'line' || e.type === 'arrow') && Array.isArray(e.points) && e.points.length
  )
  if (!els.length) return undefined
  const abs = els.map((e) => ({ e, pts: e.points!.map(([px, py]) => [(e.x ?? 0) + px, (e.y ?? 0) + py] as [number, number]) }))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { pts } of abs)
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const s = Math.min(o.width / bw, o.height / bh) || 1
  const ox = o.x + (o.width - bw * s) / 2
  const oy = o.y + (o.height - bh * s) / 2
  return decimate(abs, PREVIEW_LIMITS.strokes).map(({ e, pts }) => ({
    color: typeof e.strokeColor === 'string' ? e.strokeColor : '#1e1e1e',
    ...(typeof e.opacity === 'number' && e.opacity < 100 ? { opacity: e.opacity / 100 } : {}),
    points: decimate(pts, PREVIEW_LIMITS.points).map(([x, y]) => [r1(ox + (x - minX) * s), r1(oy + (y - minY) * s)] as [number, number])
  }))
}

function toItem(o: PreviewSource): BoardPreviewItem {
  const base = { x: r1(o.x), y: r1(o.y), w: r1(o.width), h: r1(o.height), color: o.color ?? null }
  let kind: BoardPreviewKind = 'other'
  let label: string | undefined
  const extra: Partial<BoardPreviewItem> = {}
  switch (o.kind) {
    case 'card':
      if (o.cardKind === 'block') {
        kind = 'block'
        if (o.data.style === 'framed') extra.framed = true
      } else {
        kind = 'card'
        label = clip(o.cardTitle)
      }
      if (o.cardColor) base.color = o.cardColor
      break
    case 'text':
      kind = 'text'
      label = clip(o.data.text)
      break
    case 'section':
      kind = 'section'
      label = clip(o.data.title)
      break
    case 'table':
      kind = 'table'
      label = clip(o.data.title)
      extra.rows = Math.min(12, Array.isArray(o.data.rows) ? o.data.rows.length : 3)
      break
    case 'chart':
      kind = 'chart'
      label = clip(o.data.title)
      if (typeof o.data.chartType === 'string') extra.chartType = o.data.chartType
      break
    case 'sketch':
      if (o.data.frameless === true) {
        const strokes = inkStrokes(o)
        if (strokes) {
          kind = 'ink'
          extra.strokes = strokes
        }
      } else kind = 'sketch'
      break
  }
  return { kind, ...base, ...(label ? { label } : {}), ...extra }
}

/** Preview of one board: items in stacking order (sections first), plus the union of their boxes. */
export function buildBoardPreview(id: ID, objects: readonly PreviewSource[]): BoardPreview {
  // keep the largest objects when a board is busy, then draw in stacking order
  const kept = [...objects]
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, PREVIEW_LIMITS.items)
    .sort((a, b) => (a.kind === 'section' ? 0 : 1) - (b.kind === 'section' ? 0 : 1) || a.z - b.z)
  const items = kept.map(toItem)
  if (!items.length) return { id, bounds: null, items }
  const minX = Math.min(...items.map((i) => i.x))
  const minY = Math.min(...items.map((i) => i.y))
  const maxX = Math.max(...items.map((i) => i.x + i.w))
  const maxY = Math.max(...items.map((i) => i.y + i.h))
  return { id, bounds: { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }, items }
}
