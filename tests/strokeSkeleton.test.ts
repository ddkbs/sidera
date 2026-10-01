import { describe, expect, it } from 'vitest'
import { strokeToSkeleton } from '../src/renderer/src/features/ink/strokeSkeleton'
import { FREEDRAW_DIAMETER_PER_STROKE_WIDTH, type DrawStroke } from '../src/shared/inkStroke'

const strokes: DrawStroke[] = [
  { tool: 'pen', color: '#1e1e1e', width: 4, opacity: 1, pressure: true, points: [[100, 100, 0.3], [110, 90, 0.5], [130, 95, 0.8]] },
  { tool: 'pen', color: '#1971c2', width: 4, opacity: 1, straight: true, points: [[200, 300, 0.5], [500, 200, 0.5]] },
  { tool: 'highlighter', color: '#fab005', width: 22, opacity: 0.35, points: [[50, 400, 0.5], [60, 402, 0.5], [300, 410, 0.5]] },
  { tool: 'pen', color: '#e03131', width: 2, opacity: 1, points: [[700, 700, 0.5]] }
]

describe('ink strokes → Excalidraw skeletons', () => {
  const [pen, line, hl, dot] = strokes.map(strokeToSkeleton)

  it('turns pencil strokes into freedraw elements with real pressures', () => {
    expect(pen).toMatchObject({ type: 'freedraw', x: 100, y: 100, strokeColor: '#1e1e1e', opacity: 100, simulatePressure: false })
    if (pen.type !== 'freedraw') throw new Error()
    expect(pen.points).toEqual([[0, 0], [10, -10], [30, -5]])
    expect(pen.pressures).toEqual([0.3, 0.5, 0.8])
    expect(pen.width).toBe(30)
    expect(pen.height).toBe(10)
    expect(pen.strokeWidth).toBeCloseTo(4 / FREEDRAW_DIAMETER_PER_STROKE_WIDTH, 2)
    expect(pen.lastCommittedPoint).toEqual([30, -5])
  })

  it('turns snapped strokes into two-point lines (draggable ends)', () => {
    expect(line).toMatchObject({ type: 'line', x: 200, y: 300, points: [[0, 0], [300, -100]], width: 300, height: 100, strokeWidth: 4, roughness: 0, roundness: null })
  })

  it('keeps the highlighter translucent and even', () => {
    expect(hl).toMatchObject({ type: 'freedraw', opacity: 35, simulatePressure: false })
    if (hl.type !== 'freedraw') throw new Error()
    expect(new Set(hl.pressures)).toEqual(new Set([0.5]))
  })

  it('never produces an invisibly small element for a single tap', () => {
    if (dot.type !== 'freedraw') throw new Error()
    expect(dot.points).toHaveLength(2)
    expect(dot.simulatePressure).toBe(true)
  })
})
