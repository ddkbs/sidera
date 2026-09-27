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

export type Side = 'right' | 'bottom' | 'left' | 'top'

export interface Placement {
  x: number
  y: number
  /** which side of the target the popover sits on; 'center' when there is no target */
  side: Side | 'center'
  /** distance of the pointer arrow from the popover's top (left/right) or left (top/bottom) edge */
  arrow: number
}

const clamp = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max))

/** Keeps a box fully inside the viewport, with a margin from the edges. */
export function clampToViewport(pos: { x: number; y: number }, size: Size, viewport: Size, margin = 12): { x: number; y: number } {
  return {
    x: clamp(pos.x, margin, viewport.width - size.width - margin),
    y: clamp(pos.y, margin, viewport.height - size.height - margin)
  }
}

const SIDES: Side[] = ['right', 'bottom', 'left', 'top']

/**
 * Places the popover next to `target` — the `prefer`red side first, then right, below, left, above —
 * whichever fits fully inside the viewport first, or centered when there's no target. Always returns a
 * position inside the viewport, plus where the pointer arrow should sit so it keeps aiming at the target.
 */
export function placePopover(target: Rect | null, popover: Size, viewport: Size, gap = 16, margin = 12, prefer?: Side): Placement {
  if (!target) {
    const c = clampToViewport({ x: (viewport.width - popover.width) / 2, y: (viewport.height - popover.height) / 2 }, popover, viewport, margin)
    return { ...c, side: 'center', arrow: 0 }
  }

  const centeredX = target.x + target.width / 2 - popover.width / 2
  const centeredY = target.y + target.height / 2 - popover.height / 2
  const at: Record<Side, { x: number; y: number }> = {
    right: { x: target.x + target.width + gap, y: centeredY },
    bottom: { x: centeredX, y: target.y + target.height + gap },
    left: { x: target.x - popover.width - gap, y: centeredY },
    top: { x: centeredX, y: target.y - popover.height - gap }
  }
  const order = prefer ? [prefer, ...SIDES.filter((s) => s !== prefer)] : SIDES

  // A side "fits" when the popover can stay beside the target on that axis (the other axis may slide).
  const fits = (s: Side): boolean => {
    const c = at[s]
    if (s === 'right') return c.x + popover.width <= viewport.width - margin
    if (s === 'left') return c.x >= margin
    if (s === 'bottom') return c.y + popover.height <= viewport.height - margin
    return c.y >= margin
  }

  const side = order.find(fits) ?? order[0]
  const pos = clampToViewport(at[side], popover, viewport, margin)
  const horizontal = side === 'left' || side === 'right'
  const arrow = horizontal
    ? clamp(target.y + target.height / 2 - pos.y, 18, popover.height - 18)
    : clamp(target.x + target.width / 2 - pos.x, 18, popover.width - 18)
  return { ...pos, side, arrow }
}

/** Grows the target by `pad` for the spotlight cutout and keeps it on screen (targets may be partly off-view). */
export function spotlightRect(target: Rect, viewport: Size, pad = 8, inset = 4): Rect {
  const x1 = clamp(target.x - pad, inset, viewport.width - inset)
  const y1 = clamp(target.y - pad, inset, viewport.height - inset)
  const x2 = clamp(target.x + target.width + pad, inset, viewport.width - inset)
  const y2 = clamp(target.y + target.height + pad, inset, viewport.height - inset)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

/** True when two rects are equal within half a pixel — used to avoid re-rendering on every animation frame. */
export function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
}
