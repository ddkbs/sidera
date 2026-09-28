import { describe, expect, it } from 'vitest'
import { hitsStroke, isRoughlyStraight, pressureFactor, type Pt } from '../src/companion/geometry'

const line = (n: number, f: (t: number) => [number, number]): Pt[] => Array.from({ length: n + 1 }, (_, i) => [...f(i / n), 0.5] as Pt)

describe('companion geometry', () => {
  it('normalises the pressure curve to 1 at p = 0.5', () => {
    expect(pressureFactor(0.5)).toBeCloseTo(1)
    expect(pressureFactor(1)).toBeGreaterThan(1)
    expect(pressureFactor(0)).toBeLessThan(0.5)
  })

  it('recognises roughly straight strokes for hold-to-straighten', () => {
    expect(isRoughlyStraight(line(40, (t) => [t * 300, t * 120 + Math.sin(t * 20) * 3]))).toBe(true)
    // an arc with a big sag is not a line
    expect(isRoughlyStraight(line(40, (t) => [t * 300, Math.sin(t * Math.PI) * 80]))).toBe(false)
    // back-and-forth scribble along a line is not a line either
    expect(isRoughlyStraight(line(40, (t) => [Math.abs(Math.sin(t * 9)) * 300, 0]))).toBe(false)
    // too short
    expect(isRoughlyStraight(line(4, (t) => [t * 10, 0]))).toBe(false)
  })

  it('hit-tests strokes for the stroke eraser', () => {
    const pts = line(10, (t) => [t * 100, 0])
    expect(hitsStroke(pts, 2, 50, 10, 9)).toBe(true)
    expect(hitsStroke(pts, 2, 50, 20, 9)).toBe(false)
    expect(hitsStroke([[0, 0, 0.5]], 2, 3, 0, 2)).toBe(true)
  })
})
