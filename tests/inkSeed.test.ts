import { describe, expect, it } from 'vitest'
import { arrow, loop, seedInk, underline } from '../src/shared/inkSeed'
import { fitTransform, inkBounds } from '../src/renderer/src/features/ink/geometry'

describe('seeded ink', () => {
  it('builds freedraw elements whose box matches the real ink bounds (scale ≈ 1, nothing jumps)', () => {
    const ink = seedInk([
      { points: underline(0, 200, 50, 1) },
      { points: loop(400, 100, 60, 40, 2), color: '#e03131' },
      ...arrow([300, 300], [420, 160], 30).map((points) => ({ points }))
    ])
    expect(ink.elements).toHaveLength(4)
    for (const e of ink.elements) expect(e).toMatchObject({ type: 'freedraw', simulatePressure: true, isDeleted: false })
    const real = inkBounds(ink.elements)!
    const t = fitTransform(real, ink.box)
    expect(t.s).toBeGreaterThan(0.97)
    expect(t.s).toBeLessThan(1.03)
    expect(Math.abs(real.x - ink.box.x)).toBeLessThan(6)
    expect(Math.abs(real.y - ink.box.y)).toBeLessThan(6)
  })

  it('is deterministic', () => {
    expect(loop(0, 0, 10, 10, 7)).toEqual(loop(0, 0, 10, 10, 7))
    expect(underline(0, 100, 0, 3)).toEqual(underline(0, 100, 0, 3))
  })
})
