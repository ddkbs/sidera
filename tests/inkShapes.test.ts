import { describe, expect, it } from 'vitest'
import { buildShape, SHAPE_KINDS } from '../src/renderer/src/features/ink/shapes'
import { inkBounds } from '../src/renderer/src/features/ink/geometry'

describe('ink shapes', () => {
  for (const kind of SHAPE_KINDS) {
    it(`${kind}: builds valid, bounded, editable elements`, () => {
      const { elements, width, height } = buildShape(kind, 120)
      expect(elements.length).toBeGreaterThan(0)
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)

      for (const el of elements) {
        // fields every Excalidraw element needs to be a valid scene member / open in the editor
        expect(el).toMatchObject({
          isDeleted: false,
          boundElements: null,
          link: null,
          locked: false,
          groupIds: [],
          version: 1,
          strokeColor: '#1e1e1e',
          backgroundColor: 'transparent',
          roughness: 0,
          opacity: 100
        })
        expect(typeof el.id).toBe('string')
        expect(typeof el.seed).toBe('number')
        expect(typeof el.versionNonce).toBe('number')
      }

      // inkBounds ≈ the shape's own box, padded a little for stroke width + INK_PAD (see geometry.ts)
      const b = inkBounds(elements)
      expect(b).not.toBeNull()
      expect(b!.width).toBeLessThanOrEqual(width + 25)
      expect(b!.height).toBeLessThanOrEqual(height + 25)
    })
  }

  it('rectangle/ellipse/diamond are unfilled by default (only the outline should be hit)', () => {
    for (const kind of ['rectangle', 'ellipse', 'diamond'] as const) {
      const { elements } = buildShape(kind)
      expect(elements[0].backgroundColor).toBe('transparent')
    }
  })

  it('arrow has an end arrowhead, line does not', () => {
    expect(buildShape('arrow').elements[0].endArrowhead).toBe('arrow')
    expect(buildShape('line').elements[0].endArrowhead).toBeNull()
    expect(buildShape('curved-arrow').elements[0].endArrowhead).toBe('arrow')
  })

  it('cross is two crossing lines', () => {
    const { elements } = buildShape('cross', 100)
    expect(elements).toHaveLength(2)
    expect(elements.every((e) => e.type === 'line')).toBe(true)
  })

  it('star is a closed polygon (first and last point coincide)', () => {
    const { elements } = buildShape('star', 100)
    const points = elements[0].points as [number, number][]
    expect(points[0]).toEqual(points[points.length - 1])
    expect(points.length).toBeGreaterThan(8)
  })

  it('builds are independent (fresh ids each call)', () => {
    const a = buildShape('star')
    const b = buildShape('star')
    expect(a.elements[0].id).not.toBe(b.elements[0].id)
  })
})
