import type { DrawStroke } from '@shared/drawProtocol'
import { strokeToSkeleton } from '../draw/sketch'
import { fitTransform, inkBounds, reboxed, type InkElement, type Rect } from './geometry'

/**
 * Pen-mode strokes → complete Excalidraw elements. The conversion itself is the iPad path's (`strokeToSkeleton`:
 * freedraw with real or simulated pressure, highlighter with even width); this only adds the bookkeeping fields
 * Excalidraw's element factory would, so the sketch opens in the editor without loading Excalidraw to create it.
 */

const nonce = (): number => Math.floor(Math.random() * 2 ** 31)

export function strokeToElement(stroke: DrawStroke, id: string, now = Date.now()): InkElement & Record<string, unknown> {
  return {
    ...strokeToSkeleton(stroke),
    id,
    version: 1,
    versionNonce: nonce(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    frameId: null
  }
}

/** Ink pens (nominal diameter in px at pressure 0.5). */
export const PEN_WIDTHS = [2.5, 4.5, 8] as const
export const HIGHLIGHTER_WIDTH = 20
export const HIGHLIGHTER_OPACITY = 0.35

/** Default ink is Excalidraw's near-black: shown light in dark mode like every other sketch. */
export const INK_COLORS = [
  { name: 'Ink', value: '#1e1e1e' },
  { name: 'Blue', value: '#1971c2' },
  { name: 'Red', value: '#e03131' },
  { name: 'Green', value: '#2f9e44' },
  { name: 'Orange', value: '#f08c00' },
  { name: 'Purple', value: '#9c36b5' }
] as const

/** The highlighter turns "ink" into classic yellow; other colours stay. */
export const highlighterColor = (color: string): string => (color === INK_COLORS[0].value ? '#fab005' : color)

export type PenTool = 'pen' | 'highlighter' | 'eraser'

export interface PenSettings {
  tool: PenTool
  color: string
  /** index into PEN_WIDTHS */
  width: number
}

/** DrawStroke for a finished pen-mode stroke (board coordinates). */
export function penStroke(points: [number, number, number][], settings: PenSettings, realPressure: boolean): DrawStroke {
  const hl = settings.tool === 'highlighter'
  return {
    tool: hl ? 'highlighter' : 'pen',
    color: hl ? highlighterColor(settings.color) : settings.color,
    width: hl ? HIGHLIGHTER_WIDTH : PEN_WIDTHS[settings.width] ?? PEN_WIDTHS[1],
    opacity: hl ? HIGHLIGHTER_OPACITY : 1,
    points,
    pressure: realPressure && !hl
  }
}

// ─── ink objects: create / append / erase (box = the whiteboard object's box, board coordinates) ─────

export interface Ink {
  box: Rect
  elements: InkElement[]
}

export interface NewStroke {
  stroke: DrawStroke
  id: string
}

/** A new ink object: elements in board coordinates, box = their bounds (scale 1, so nothing moves). */
export function newInk(strokes: readonly NewStroke[], now = Date.now()): Ink | null {
  const elements = strokes.map((s) => strokeToElement(s.stroke, s.id, now))
  const box = inkBounds(elements)
  return box ? { box, elements } : null
}

/** Strokes drawn in board coordinates appended to an existing ink object, keeping its scale and every old stroke in place. */
export function appendStrokes(elements: readonly unknown[], box: Rect, strokes: readonly NewStroke[], now = Date.now()): Ink | null {
  const old = inkBounds(elements)
  if (!old) return null
  const t = fitTransform(old, box)
  const added = strokes.map(({ stroke, id }) =>
    strokeToElement(
      { ...stroke, width: stroke.width / t.s, points: stroke.points.map(([x, y, p]) => [(x - t.ox) / t.s, (y - t.oy) / t.s, p] as [number, number, number]) },
      id,
      now
    )
  )
  const all = [...(elements as InkElement[]), ...added]
  return { box: reboxed(t, inkBounds(all)!), elements: all }
}

/** Ink object without the erased elements (box shrunk, the rest stays in place); null when nothing is left. */
export function eraseElements(elements: readonly unknown[], box: Rect, ids: ReadonlySet<string>): Ink | null {
  const all = elements as InkElement[]
  const rest = all.filter((e) => !(e?.id && ids.has(e.id)))
  const old = inkBounds(all)
  const next = inkBounds(rest)
  if (!old || !next) return null
  return { box: reboxed(fitTransform(old, box), next), elements: rest }
}
