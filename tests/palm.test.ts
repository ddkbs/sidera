import { beforeEach, describe, expect, it } from 'vitest'
import { installPalmRejection } from '../src/renderer/src/ipad/palm'

/**
 * Palm rejection (ipad/palm.ts) against a minimal window: events carry a fake board target, and a listener added after
 * installation stands in for the board (xyflow / d3-zoom) — it only sees what palm rejection lets through.
 */
const board = { closest: (sel: string) => (sel.includes('.canvas-root.tool-pen .react-flow') ? {} : null) }

let seen: string[]
let now = 0

const fire = (type: string, props: Record<string, unknown>): Event => {
  const e = new Event(type, { cancelable: true })
  Object.assign(e, props)
  Object.defineProperty(e, 'target', { value: board })
  window.dispatchEvent(e)
  return e
}
const pointer = (type: string, pointerType: string, pointerId: number, size = 10) => fire(type, { pointerType, pointerId, width: size, height: size })
const touch = (type: string, identifier: number, radius = 8) =>
  fire(type, { changedTouches: [{ identifier, radiusX: radius, radiusY: radius, touchType: 'direct' }] })
const click = () => fire('click', { pointerType: 'touch' })

beforeEach(() => {
  ;(globalThis as { window?: unknown }).window = new EventTarget()
  ;(globalThis as { performance: { now: () => number } }).performance = { now: () => now } as never
  now = 10_000
  installPalmRejection()
  seen = []
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'click'])
    window.addEventListener(t, (e) => seen.push(`${t}:${(e as unknown as { pointerType?: string }).pointerType ?? 'touch'}`))
})

describe('palm rejection', () => {
  it('lets a finger pan when the Pencil is not in use', () => {
    pointer('pointerdown', 'touch', 1)
    touch('touchstart', 1)
    touch('touchmove', 1)
    touch('touchend', 1)
    expect(seen).toEqual(['pointerdown:touch', 'touchstart:touch', 'touchmove:touch', 'touchend:touch'])
  })

  it('freezes a hand already resting when the Pencil touches down: no drift, no click, the lift passes', () => {
    pointer('pointerdown', 'touch', 1)
    touch('touchstart', 1)
    now += 300
    pointer('pointerdown', 'pen', 2)
    seen = []
    touch('touchmove', 1)
    pointer('pointermove', 'touch', 1)
    expect(seen).toEqual([])
    pointer('pointerup', 'pen', 2)
    touch('touchend', 1)
    pointer('pointerup', 'touch', 1)
    expect(seen).toEqual(['pointerup:pen', 'touchend:touch', 'pointerup:touch'])
    now += 2000
    expect(click().defaultPrevented).toBe(true)
  })

  it('drops touches that start while writing or right after, and palm-sized ones', () => {
    pointer('pointerdown', 'pen', 2)
    seen = []
    expect(touch('touchstart', 3).defaultPrevented).toBe(true)
    pointer('pointerup', 'pen', 2)
    now += 300
    expect(pointer('pointerdown', 'touch', 4).defaultPrevented).toBe(true)
    now += 5000
    expect(touch('touchstart', 5, 40).defaultPrevented).toBe(true)
    expect(touch('touchstart', 6).defaultPrevented).toBe(false)
    expect(seen).toEqual(['pointerup:pen', 'touchstart:touch'])
  })
})
