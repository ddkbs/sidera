import { describe, expect, it } from 'vitest'
import { clampToViewport, placePopover, sameRect, spotlightRect } from '../src/renderer/src/features/onboarding/geometry'

const viewport = { width: 1200, height: 800 }
const popover = { width: 320, height: 180 }

function insideViewport(pos: { x: number; y: number }) {
  expect(pos.x).toBeGreaterThanOrEqual(0)
  expect(pos.y).toBeGreaterThanOrEqual(0)
  expect(pos.x + popover.width).toBeLessThanOrEqual(viewport.width)
  expect(pos.y + popover.height).toBeLessThanOrEqual(viewport.height)
}

describe('placePopover', () => {
  it('centers the popover when there is no target', () => {
    const pos = placePopover(null, popover, viewport)
    expect(pos.x).toBeCloseTo((viewport.width - popover.width) / 2, 0)
    expect(pos.y).toBeCloseTo((viewport.height - popover.height) / 2, 0)
    insideViewport(pos)
  })

  it('places the popover to the right of a target with room to spare', () => {
    const target = { x: 100, y: 300, width: 60, height: 40 }
    const pos = placePopover(target, popover, viewport)
    expect(pos.x).toBeGreaterThan(target.x + target.width)
    insideViewport(pos)
  })

  it('falls back to a fitting side when the target hugs the right edge', () => {
    const target = { x: viewport.width - 80, y: 300, width: 60, height: 40 }
    const pos = placePopover(target, popover, viewport)
    // should not spill past the right edge
    insideViewport(pos)
  })

  it('stays inside the viewport for a target in every corner', () => {
    const corners = [
      { x: 0, y: 0, width: 40, height: 40 },
      { x: viewport.width - 40, y: 0, width: 40, height: 40 },
      { x: 0, y: viewport.height - 40, width: 40, height: 40 },
      { x: viewport.width - 40, y: viewport.height - 40, width: 40, height: 40 }
    ]
    for (const target of corners) insideViewport(placePopover(target, popover, viewport))
  })

  it('handles a popover larger than the viewport without throwing', () => {
    const huge = { width: 2000, height: 2000 }
    const pos = placePopover({ x: 10, y: 10, width: 20, height: 20 }, huge, viewport)
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.y)).toBe(true)
  })
})

describe('clampToViewport', () => {
  it('pulls an out-of-bounds position back inside with margin', () => {
    const pos = clampToViewport({ x: -50, y: 5000 }, popover, viewport, 12)
    expect(pos.x).toBe(12)
    expect(pos.y).toBe(viewport.height - popover.height - 12)
  })
})

describe('placement details', () => {
  it('honours a preferred side when it fits', () => {
    const target = { x: 500, y: 300, width: 100, height: 40 }
    expect(placePopover(target, popover, viewport, 16, 12, 'bottom').side).toBe('bottom')
    expect(placePopover(target, popover, viewport, 16, 12, 'top').side).toBe('top')
  })

  it('aims the arrow at the target centre even when the popover slides', () => {
    const target = { x: 20, y: 740, width: 200, height: 40 } // bottom-left: popover must slide up
    const p = placePopover(target, popover, viewport)
    expect(p.side).toBe('right')
    expect(p.arrow).toBeLessThanOrEqual(popover.height - 18)
    expect(p.arrow).toBeGreaterThanOrEqual(18)
  })

  it('reports center without a target', () => {
    expect(placePopover(null, popover, viewport).side).toBe('center')
  })
})

describe('spotlightRect', () => {
  it('pads the target and keeps it inside the viewport', () => {
    expect(spotlightRect({ x: 100, y: 100, width: 50, height: 20 }, viewport, 8)).toEqual({ x: 92, y: 92, width: 66, height: 36 })
    const r = spotlightRect({ x: -40, y: 780, width: 100, height: 100 }, viewport, 8, 4)
    expect(r.x).toBe(4)
    expect(r.y + r.height).toBe(viewport.height - 4)
  })

  it('compares rects with sub-pixel tolerance', () => {
    expect(sameRect({ x: 1, y: 1, width: 2, height: 2 }, { x: 1.2, y: 1, width: 2, height: 2 })).toBe(true)
    expect(sameRect({ x: 1, y: 1, width: 2, height: 2 }, null)).toBe(false)
  })
})
