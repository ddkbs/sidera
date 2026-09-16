import { describe, expect, it } from 'vitest'
import { History, invert } from '../src/renderer/src/features/canvas/history'

describe('canvas history', () => {
  it('undoes and redoes in order, clearing redo on push', () => {
    const h = new History()
    h.push({ type: 'patch', before: [{ id: 'a', x: 0 }], after: [{ id: 'a', x: 10 }] })
    h.push({ type: 'patch', before: [{ id: 'a', x: 10 }], after: [{ id: 'a', x: 20 }] })
    expect(h.undo()).toMatchObject({ after: [{ x: 20 }] })
    expect(h.redo()).toMatchObject({ after: [{ x: 20 }] })
    h.undo()
    h.push({ type: 'patch', before: [{ id: 'b', y: 0 }], after: [{ id: 'b', y: 5 }] })
    expect(h.redo()).toBeUndefined()
  })

  it('ignores no-op patches and inverts add/remove', () => {
    const h = new History()
    h.push({ type: 'patch', before: [{ id: 'a', x: 1 }], after: [{ id: 'a', x: 1 }] })
    expect(h.canUndo).toBe(false)
    expect(invert({ type: 'add', objects: [], connections: [] }).type).toBe('remove')
  })
})
