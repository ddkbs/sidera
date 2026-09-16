import { describe, expect, it } from 'vitest'
import { clampToViewport, placePopover } from '../src/renderer/src/features/onboarding/geometry'

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
