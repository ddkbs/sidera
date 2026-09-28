import { inkBounds, type Rect } from './geometry'

/** Framed sketch chrome: node padding (p-2) + Excalidraw's export padding around the ink. */
export const FRAME_NODE_PAD = 8
export const FRAME_EXPORT_PAD = 16
export const FRAMED_MIN = { width: 160, height: 120 }

export const isFrameless = (data: Record<string, unknown> | undefined): boolean => data?.frameless === true

/**
 * Box of a sketch after toggling its frame, chosen so the ink stays where it is on the board:
 * removing the frame shrinks the box to the ink as it was displayed inside the frame; adding it grows the box by
 * the frame's padding (at least the framed minimum size), centred on the ink.
 */
export function toggledFrameBox(box: Rect, elements: readonly unknown[] | undefined, toFrameless: boolean): Rect {
  const b = inkBounds(elements)
  if (!b) return box
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  if (toFrameless) {
    const pad = FRAME_EXPORT_PAD * 2
    const s = Math.min((box.width - 2 * FRAME_NODE_PAD) / (b.width + pad), (box.height - 2 * FRAME_NODE_PAD) / (b.height + pad))
    const width = Math.max(1, b.width * s)
    const height = Math.max(1, b.height * s)
    return { x: cx - width / 2, y: cy - height / 2, width, height }
  }
  const s = Math.min(box.width / b.width, box.height / b.height)
  const pad = 2 * (FRAME_NODE_PAD + FRAME_EXPORT_PAD * s)
  const width = Math.max(FRAMED_MIN.width, b.width * s + pad)
  const height = Math.max(FRAMED_MIN.height, b.height * s + pad)
  return { x: cx - width / 2, y: cy - height / 2, width, height }
}

/** Whiteboard node size for new frameless ink: the ink bounds, scaled down to fit `max`. */
export function framelessSize(elements: readonly unknown[] | undefined, max = { width: 560, height: 420 }): { width: number; height: number } {
  const b = inkBounds(elements)
  if (!b) return { width: 160, height: 120 }
  const s = Math.min(1, max.width / b.width, max.height / b.height)
  return { width: b.width * s, height: b.height * s }
}
