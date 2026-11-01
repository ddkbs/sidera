/**
 * iPadOS Safari fires no `contextmenu` for touch. A finger held still for LONG_PRESS_MS on the board dispatches one at
 * that spot, so the board's node / canvas menus open exactly like a right-click on the Mac. The click that follows
 * the lift is swallowed (it would otherwise select or close what the menu just opened).
 */
const LONG_PRESS_MS = 500
const SLOP_PX = 10

export function installLongPress(): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let start: { id: number; x: number; y: number } | null = null
  let firedAt = 0
  const touches = new Set<number>()
  const cancel = (): void => {
    clearTimeout(timer)
    start = null
  }

  document.addEventListener(
    'pointerdown',
    (e) => {
      // the Pencil touching down means the resting finger is a palm: no menu
      if (e.pointerType === 'pen') return cancel()
      if (e.pointerType !== 'touch') return
      touches.add(e.pointerId)
      cancel()
      const target = e.target as HTMLElement
      // one finger only (two = pinch), on the board, never inside text being edited or on controls; never in the pen
      // tool (a resting hand opened an invisible menu under the palm that swallowed the next stroke)
      if (touches.size > 1 || !target.closest('.react-flow') || target.closest('.canvas-root.tool-pen') || target.closest('[contenteditable="true"], input, textarea, button, .react-flow__panel')) return
      start = { id: e.pointerId, x: e.clientX, y: e.clientY }
      timer = setTimeout(() => {
        const s = start
        start = null
        if (!s) return
        const el = document.elementFromPoint(s.x, s.y)
        if (!el) return
        firedAt = performance.now()
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: s.x, clientY: s.y, button: 2, buttons: 2 }))
      }, LONG_PRESS_MS)
    },
    true
  )
  document.addEventListener(
    'pointermove',
    (e) => {
      if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) cancel()
    },
    true
  )
  const up = (e: PointerEvent): void => {
    touches.delete(e.pointerId)
    if (start?.id === e.pointerId) cancel()
  }
  document.addEventListener('pointerup', up, true)
  document.addEventListener('pointercancel', up, true)
  document.addEventListener(
    'click',
    (e) => {
      if (performance.now() - firedAt < 700) {
        firedAt = 0
        e.stopPropagation()
        e.preventDefault()
      }
    },
    true
  )
}
