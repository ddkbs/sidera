import { describe, expect, it } from 'vitest'
import { recognize, type Pt } from '../src/renderer/src/features/ink/recognize'

// deterministic wobble so the shapes look hand-drawn
const wobble = (i: number, amp: number): number => Math.sin(i * 1.7) * amp + Math.cos(i * 0.9) * amp * 0.5
const poly = (vs: [number, number][], closeGap = 0, amp = 2): Pt[] => {
  const out: Pt[] = []
  vs.forEach((a, i) => {
    const b = vs[(i + 1) % vs.length]
    for (let k = 0; k < 20; k++) out.push([a[0] + ((b[0] - a[0]) * k) / 20 + wobble(out.length, amp), a[1] + ((b[1] - a[1]) * k) / 20 + wobble(out.length + 3, amp), 0.5])
  })
  out.push([vs[0][0] + closeGap, vs[0][1] + closeGap, 0.5])
  return out
}
const ellipse = (rx: number, ry: number, start = 0.3): Pt[] =>
  Array.from({ length: 80 }, (_, i) => {
    const a = start + (i / 76) * 2 * Math.PI
    return [200 + rx * Math.cos(a) + wobble(i, 3), 200 + ry * Math.sin(a) + wobble(i + 5, 3), 0.5] as Pt
  })

describe('ink shape recognition', () => {
  it('snaps open strokes to a line', () => {
    const pts = Array.from({ length: 40 }, (_, i) => [i * 5, i * 2 + wobble(i, 4), 0.5] as Pt)
    expect(recognize(pts)?.kind).toBe('line')
  })
  it('recognizes circles and ellipses', () => {
    expect(recognize(ellipse(100, 95))?.kind).toBe('circle')
    expect(recognize(ellipse(160, 70))?.kind).toBe('ellipse')
  })
  it('recognizes rectangles, squares and triangles', () => {
    expect(recognize(poly([[0, 0], [300, 0], [300, 150], [0, 150]], 6))?.kind).toBe('rectangle')
    expect(recognize(poly([[0, 0], [200, 0], [200, 205], [0, 205]], 5))?.kind).toBe('square')
    expect(recognize(poly([[0, 200], [120, 0], [240, 200]], 6))?.kind).toBe('triangle')
  })
  it('squares up rotated squares (a diamond)', () => {
    expect(recognize(poly([[100, 0], [200, 100], [100, 200], [0, 100]], 4))?.kind).toBe('square')
  })
  it('keeps other quadrilaterals as polygons', () => {
    expect(recognize(poly([[60, 0], [300, 0], [240, 160], [0, 160]], 4))?.kind).toBe('polygon')
  })
})
