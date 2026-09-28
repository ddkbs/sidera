import { describe, expect, it } from 'vitest'
import { contains, darkInk, fitSize, hitsStroke, isRoughlyStraight, pressureFactor, resizeFromCorner, type Pt } from '../src/companion/geometry'

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

  it('fits and resizes images keeping the aspect ratio around the opposite corner', () => {
    expect(fitSize(2000, 1000, 500, 500)).toEqual({ width: 500, height: 250 })
    expect(fitSize(100, 50, 500, 500)).toEqual({ width: 100, height: 50 })
    const r = { x: 100, y: 100, width: 200, height: 100 }
    // bottom-right corner dragged out: top-left stays, 2× bigger
    expect(resizeFromCorner(r, 2, 500, 250)).toEqual({ x: 100, y: 100, width: 400, height: 200 })
    // top-left corner dragged in: bottom-right (300, 200) stays
    expect(resizeFromCorner(r, 0, 200, 150)).toEqual({ x: 200, y: 150, width: 100, height: 50 })
    // never below the minimum side
    expect(resizeFromCorner(r, 2, 100, 100, 20)).toEqual({ x: 100, y: 100, width: 40, height: 20 })
    expect(contains(r, 150, 150)).toBe(true)
    expect(contains(r, 99, 150)).toBe(false)
  })

  it('maps ink colours like invert(1) hue-rotate(180deg)', () => {
    expect(darkInk('#ffffff')).toBe('#000000')
    expect(darkInk('#000000')).toBe('#ffffff')
    expect(darkInk('#1e1e1e')).toBe('#e1e1e1')
    // hue is roughly preserved: blue stays bluish
    const [r, , b] = [1, 3, 5].map((i) => parseInt(darkInk('#1971c2').slice(i, i + 2), 16))
    expect(b).toBeGreaterThan(r)
  })
})
