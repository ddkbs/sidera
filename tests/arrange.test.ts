import { describe, expect, it } from 'vitest'
import { arrange, bounds, type Box } from '../src/renderer/src/features/canvas/arrange'

const box = (id: string, x: number, y: number, width = 100, height = 50): Box => ({ id, x, y, width, height })

/** Positions after arranging, as a lookup that falls back to the original position. */
const after = (boxes: Box[], mode: Parameters<typeof arrange>[1], gap?: number): Record<string, [number, number]> => {
  const moved = new Map(arrange(boxes, mode, gap).map((p) => [p.id, p]))
  return Object.fromEntries(boxes.map((b) => [b.id, [moved.get(b.id)?.x ?? b.x, moved.get(b.id)?.y ?? b.y]]))
}

describe('arrange', () => {
  it('needs at least two boxes', () => {
    expect(arrange([], 'left')).toEqual([])
    expect(arrange([box('a', 10, 10)], 'grid')).toEqual([])
  })

  it('computes the bounding box', () => {
    expect(bounds([box('a', 0, 0), box('b', 50, 100, 200, 20)])).toEqual({ x: 0, y: 0, width: 250, height: 120 })
    expect(bounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('aligns horizontally without touching y', () => {
    const boxes = [box('a', 0, 0, 100, 50), box('b', 40, 200, 60, 50)]
    expect(after(boxes, 'left')).toEqual({ a: [0, 0], b: [0, 200] })
    expect(after(boxes, 'right')).toEqual({ a: [0, 0], b: [40, 200] }) // right edges at x = 100
    expect(after(boxes, 'center-h')).toEqual({ a: [0, 0], b: [20, 200] })
  })

  it('aligns vertically without touching x', () => {
    const boxes = [box('a', 0, 0, 100, 50), box('b', 300, 150, 100, 30)]
    expect(after(boxes, 'top')).toEqual({ a: [0, 0], b: [300, 0] })
    expect(after(boxes, 'bottom')).toEqual({ a: [0, 130], b: [300, 150] })
    expect(after(boxes, 'middle')).toEqual({ a: [0, 65], b: [300, 75] })
  })

  it('distributes with equal gaps, keeping the outer boxes', () => {
    const boxes = [box('a', 0, 0, 100, 50), box('b', 120, 0, 100, 50), box('c', 500, 0, 100, 50)]
    const h = after(boxes, 'distribute-h')
    expect(h.a).toEqual([0, 0])
    expect(h.c).toEqual([500, 0])
    expect(h.b).toEqual([250, 0]) // gap = (600 - 300) / 2 = 150
    const vertical = [box('a', 0, 0, 100, 50), box('b', 0, 20, 100, 50), box('c', 0, 400, 100, 100)]
    const v = after(vertical, 'distribute-v')
    expect(v.a).toEqual([0, 0])
    expect(v.c).toEqual([0, 400])
    expect(v.b).toEqual([0, 200]) // gap = (500 - 200) / 2 = 150
  })

  it('leaves two boxes alone when distributing', () => {
    expect(arrange([box('a', 0, 0), box('b', 300, 0)], 'distribute-h')).toEqual([])
  })

  it('arranges a grid in reading order with uniform cells', () => {
    const boxes = [box('a', 0, 0, 100, 50), box('b', 400, 10, 100, 50), box('c', 30, 300, 100, 50), box('d', 380, 320, 100, 50)]
    const g = after(boxes, 'grid', 20)
    expect(g.a).toEqual([0, 0])
    expect(g.b).toEqual([120, 0])
    expect(g.c).toEqual([0, 70])
    expect(g.d).toEqual([120, 70])
  })

  it('centres differently sized boxes inside their grid cell', () => {
    const boxes = [box('a', 0, 0, 100, 50), box('b', 200, 0, 40, 20)]
    const g = after(boxes, 'grid', 20)
    expect(g.a).toEqual([0, 0])
    expect(g.b).toEqual([150, 15])
  })

  it('reports only boxes that move', () => {
    const boxes = [box('a', 0, 0), box('b', 0, 200)]
    expect(arrange(boxes, 'left')).toEqual([])
  })
})
