import type { DrawStroke } from '@shared/inkStroke'
import { strokeToSkeleton } from './strokeSkeleton'
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
/** Marker widths (index = PenSettings.width, like PEN_WIDTHS). */
export const HIGHLIGHTER_WIDTHS = [12, HIGHLIGHTER_WIDTH, 32] as const
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

/**
 * The full ink palette (colour picker): neutrals, then each hue light → dark. The first row's quick colours are
 * INK_COLORS, so ink drawn before the palette existed keeps its colour.
 */
export const INK_PALETTE: readonly string[] = [
  '#1e1e1e', '#495057', '#868e96', '#ced4da', '#ffffff', '#5c3d2e',
  '#ffa8a8', '#ff6b6b', '#e03131', '#c92a2a', '#f783ac', '#c2255c',
  '#ffc078', '#f08c00', '#e8590c', '#ffe066', '#fab005', '#e67700',
  '#8ce99a', '#40c057', '#2f9e44', '#63e6be', '#12b886', '#087f5b',
  '#74c0fc', '#339af0', '#1971c2', '#66d9e8', '#1098ad', '#364fc7',
  '#b197fc', '#7950f2', '#5f3dc4', '#e599f7', '#9c36b5', '#862e9c'
]

/** Quick colours shown in the pen bar before the user picks others (most recent first). */
export const DEFAULT_RECENT_COLORS: readonly string[] = INK_COLORS.map((c) => c.value)

/** Recent colours after picking `color`: it moves to the front, the list keeps its length. */
export function pushRecentColor(recent: readonly string[], color: string, max = DEFAULT_RECENT_COLORS.length): string[] {
  return [color, ...recent.filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, max)
}

/** The highlighter turns "ink" into classic yellow; other colours stay. */
export const highlighterColor = (color: string): string => (color === INK_COLORS[0].value ? '#fab005' : color)

/** `laser`: a glowing trail that fades out, never saved (pointing while presenting). */
export type PenTool = 'pen' | 'highlighter' | 'laser' | 'eraser'

export interface PenSettings {
  tool: PenTool
  color: string
  /** index into PEN_WIDTHS */
  width: number
  /** pen strokes are cut into dashes */
  dashed?: boolean
  /** quick colours of the pen bar, most recent first */
  recent?: string[]
}

/** Dash and gap length (board units) of a dashed pen stroke of `width`. */
export const dashPattern = (width: number): [number, number] => [width * 3 + 6, width * 2.5 + 5]

/** DrawStroke for a finished pen-mode stroke (board coordinates). */
export function penStroke(points: [number, number, number][], settings: PenSettings, realPressure: boolean): DrawStroke {
  const hl = settings.tool === 'highlighter'
  return {
    tool: hl ? 'highlighter' : 'pen',
    color: hl ? highlighterColor(settings.color) : settings.color,
    width: hl ? (HIGHLIGHTER_WIDTHS[settings.width] ?? HIGHLIGHTER_WIDTH) : (PEN_WIDTHS[settings.width] ?? PEN_WIDTHS[1]),
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
