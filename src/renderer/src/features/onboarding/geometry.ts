/** Pure geometry for the onboarding tour's spotlight + popover — no DOM access, easy to unit test. */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))

/** Keeps a box fully inside the viewport, with a margin from the edges. */
export function clampToViewport(pos: { x: number; y: number }, size: Size, viewport: Size, margin = 12): { x: number; y: number } {
  return {
    x: clamp(pos.x, margin, viewport.width - size.width - margin),
    y: clamp(pos.y, margin, viewport.height - size.height - margin)
  }
}

/**
 * Places the popover next to `target` (right, then below, then left, then above — whichever fits fully
 * inside the viewport first), or centered when there's no target. Always returns a position inside the
 * viewport.
 */
export function placePopover(target: Rect | null, popover: Size, viewport: Size, gap = 16, margin = 12): { x: number; y: number } {
  if (!target) return clampToViewport({ x: (viewport.width - popover.width) / 2, y: (viewport.height - popover.height) / 2 }, popover, viewport, margin)

  const centeredX = target.x + target.width / 2 - popover.width / 2
  const centeredY = target.y + target.height / 2 - popover.height / 2
  const candidates = [
    { x: target.x + target.width + gap, y: centeredY }, // right
    { x: centeredX, y: target.y + target.height + gap }, // below
    { x: target.x - popover.width - gap, y: centeredY }, // left
    { x: centeredX, y: target.y - popover.height - gap } // above
  ]

  const fits = (c: { x: number; y: number }): boolean =>
    c.x >= margin && c.y >= margin && c.x + popover.width <= viewport.width - margin && c.y + popover.height <= viewport.height - margin

  const best = candidates.find(fits)
  return clampToViewport(best ?? candidates[0], popover, viewport, margin)
}
