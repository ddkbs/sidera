/**
 * Palm rejection (pen tool). While writing, the hand rests on the glass: Safari reports it as finger touches, which would pan the
 * board, select the ink just written (its resize box popped up every few letters) or open a long-press menu. Touches
 * on the board are dropped — before every other listener, so neither xyflow nor longPress.ts sees them — when they
 * start while the Pencil is down or just lifted, or when the contact is palm-sized. A hand already resting when the
 * Pencil touches down is frozen: its moves are dropped (the board no longer drifts under the palm), its lift still
 * passes so the board's gesture state ends cleanly, and it never clicks.
 */
const AFTER_PEN_MS = 700
/** Touch radius (CSS px) from which a contact is a palm, not a fingertip. */
const PALM_RADIUS_PX = 28
const CLICK_AFTER_MS = 450

type StylusTouch = Touch & { touchType?: string }

const onBoard = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  // only in the pen tool: with the cursor, fingers and the Pencil select and move as usual
  return !!el?.closest?.('.canvas-root.tool-pen .react-flow') && !el.closest('.react-flow__panel, [data-pen-ui], [contenteditable="true"], input, textarea, select, button')
}

export function installPalmRejection(): void {
  let penDown = false
  let penDownAt = -Infinity
  let penUpAt = -Infinity
  let lastTouchStart = -Infinity
  let blockedEndAt = -Infinity
  const pointers = new Set<number>()
  const touches = new Set<number>()
  /** finger touches / pointers on the board that are not blocked (yet) */
  const livePointers = new Set<number>()
  const liveTouches = new Set<number>()
  /** live when the Pencil touched down: moves dropped, the end passes */
  const frozenPointers = new Set<number>()
  const frozenTouches = new Set<number>()
  const penNear = (): boolean => penDown || performance.now() - penUpAt < AFTER_PEN_MS
  const kill = (e: Event): void => {
    e.stopImmediatePropagation()
    if (e.cancelable) e.preventDefault()
  }

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'pen') {
        penDown = true
        penDownAt = performance.now()
        livePointers.forEach((id) => frozenPointers.add(id))
        liveTouches.forEach((id) => frozenTouches.add(id))
        return
      }
      if (e.pointerType !== 'touch' || !onBoard(e.target)) return
      if (penNear() || Math.max(e.width, e.height) / 2 > PALM_RADIUS_PX) {
        pointers.add(e.pointerId)
        kill(e)
      } else livePointers.add(e.pointerId)
    },
    true
  )
  window.addEventListener('pointermove', (e) => (pointers.has(e.pointerId) || frozenPointers.has(e.pointerId)) && kill(e), true)
  const up = (e: PointerEvent): void => {
    if (e.pointerType === 'pen') {
      penDown = false
      penUpAt = performance.now()
    }
    livePointers.delete(e.pointerId)
    if (frozenPointers.delete(e.pointerId)) blockedEndAt = performance.now()
    if (!pointers.delete(e.pointerId)) return
    blockedEndAt = performance.now()
    kill(e)
  }
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)

  const fingers = (e: TouchEvent): StylusTouch[] => Array.from(e.changedTouches as ArrayLike<StylusTouch>).filter((t) => t.touchType !== 'stylus')
  window.addEventListener(
    'touchstart',
    (e) => {
      const fs = fingers(e)
      if (!fs.length || !onBoard(e.target)) return
      lastTouchStart = performance.now()
      for (const t of fs) {
        if (penNear() || Math.max(t.radiusX, t.radiusY) > PALM_RADIUS_PX) touches.add(t.identifier)
        else liveTouches.add(t.identifier)
      }
      if (fs.every((t) => touches.has(t.identifier))) kill(e)
    },
    { capture: true, passive: false }
  )
  const moveOrEnd = (e: TouchEvent): void => {
    const fs = fingers(e)
    if (!fs.length) return
    if (e.type === 'touchmove') {
      if (fs.every((t) => touches.has(t.identifier) || frozenTouches.has(t.identifier))) kill(e)
      return
    }
    for (const t of fs) {
      liveTouches.delete(t.identifier)
      if (frozenTouches.delete(t.identifier)) blockedEndAt = performance.now()
    }
    if (!fs.every((t) => touches.has(t.identifier))) return
    fs.forEach((t) => touches.delete(t.identifier))
    blockedEndAt = performance.now()
    kill(e)
  }
  window.addEventListener('touchmove', moveOrEnd, { capture: true, passive: false })
  window.addEventListener('touchend', moveOrEnd, true)
  window.addEventListener('touchcancel', moveOrEnd, true)

  window.addEventListener(
    'click',
    (e) => {
      // the Pencil's own taps are handled by InkLayer; this only drops clicks of rejected / palm-placed touches
      if (!onBoard(e.target) || (e as PointerEvent).pointerType === 'pen') return
      const now = performance.now()
      if (now - blockedEndAt < CLICK_AFTER_MS || penDownAt > lastTouchStart || penNear()) kill(e)
    },
    true
  )
}
