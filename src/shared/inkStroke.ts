/**
 * Ink strokes (pen mode on the board, Apple Pencil on Sidera for iPad) before they become Excalidraw elements.
 * Pure, shared by the renderer and the welcome-board seed.
 */

/**
 * Pressure → width factor of perfect-freehand (Excalidraw's freedraw renderer: thinning 0.6, easeOutSine),
 * normalised so pressure 0.5 → 1.
 */
export const pressureFactor = (p: number): number => Math.sin((Math.PI / 2) * (0.2 + 0.6 * p)) / Math.SQRT1_2

/** Excalidraw freedraw diameter at pressure 0.5 is `strokeWidth × 4.25 × 2 × sin(π/4)`: divide a nominal width by this. */
export const FREEDRAW_DIAMETER_PER_STROKE_WIDTH = 4.25 * 2 * Math.SQRT1_2

export type DrawTool = 'pen' | 'highlighter'

/** One stroke in board coordinates. `width` is the nominal diameter at pressure 0.5. */
export interface DrawStroke {
  tool: DrawTool
  color: string
  width: number
  /** 0–1 */
  opacity: number
  /** [x, y, pressure 0–1] */
  points: [number, number, number][]
  /** snapped to a straight line ("hold to straighten"): exactly two points */
  straight?: boolean
  /** true when the pen reported real pressure (Apple Pencil); false = constant/simulated */
  pressure?: boolean
}
