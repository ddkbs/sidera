import { beforeEach, describe, expect, it } from 'vitest'
import { invert, opLabel } from '../src/renderer/src/features/canvas/history'
import { clearUndo, record, redo, undo } from '../src/renderer/src/lib/undo'

describe('undo stack', () => {
  beforeEach(clearUndo)

  it('undoes and redoes in order, clearing redo on record', async () => {
    let x = 0
    const set = (from: number, to: number) => {
      x = to
      record({ label: `set ${to}`, undo: () => void (x = from), redo: () => void (x = to) })
    }
    set(0, 10)
    set(10, 20)
    expect(await undo()).toEqual({ label: 'set 20', ok: true })
    expect(x).toBe(10)
    await redo()
    expect(x).toBe(20)
    await undo()
    set(10, 5)
    expect(await redo()).toBeNull()
    await undo()
    await undo()
    expect(x).toBe(0)
    expect(await undo()).toBeNull()
  })

  it('does not record while undoing and drops failing steps', async () => {
    record({ label: 'boom', undo: () => { throw new Error('x') }, redo: () => {} })
    record({ label: 'nested', undo: () => record({ label: 'inner', undo: () => {}, redo: () => {} }), redo: () => {} })
    expect(await undo()).toMatchObject({ label: 'nested' })
    expect(await undo()).toEqual({ label: 'boom', ok: false })
    expect(await redo()).toMatchObject({ label: 'nested' })
    expect(await redo()).toBeNull()
  })

  it('inverts and labels canvas ops', () => {
    expect(invert({ type: 'add', objects: [], connections: [] }).type).toBe('remove')
    expect(opLabel({ type: 'patch', before: [], after: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }] })).toBe('Move 2 objects')
  })
})
