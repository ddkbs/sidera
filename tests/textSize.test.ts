import { describe, expect, it } from 'vitest'
import { BLOCK_DEFAULT_SIZE, TEXT_SIZE_PRESETS, TEXT_SIZE_PX, nearestPreset, stepPreset, steppedSize } from '../src/renderer/src/features/canvas/textSize'

describe('textSize', () => {
  it('defaults match the long-standing size', () => {
    expect(BLOCK_DEFAULT_SIZE).toBe(14.5)
  })

  it('finds the nearest preset', () => {
    expect(nearestPreset(14.5)).toBe('M')
    expect(nearestPreset(16.5)).toBe('L')
    expect(nearestPreset(100)).toBe('5XL')
    expect(nearestPreset(1)).toBe('XXS')
  })

  it('steps within bounds without wrapping', () => {
    expect(stepPreset('M', 1)).toBe('L')
    expect(stepPreset('M', -1)).toBe('S')
    expect(stepPreset('XXS', -1)).toBe('XXS')
    expect(stepPreset('5XL', 1)).toBe('5XL')
  })

  it('steppedSize snaps to the nearest preset then steps', () => {
    expect(steppedSize(14.5, -1)).toBe(TEXT_SIZE_PX.S)
    expect(steppedSize(24, 1)).toBe(TEXT_SIZE_PX['3XL'])
    // an odd stored size snaps to its nearest preset first
    expect(steppedSize(15, 1)).toBe(TEXT_SIZE_PX.L)
  })

  it('every preset is covered in ascending order', () => {
    const sizes = TEXT_SIZE_PRESETS.map((p) => TEXT_SIZE_PX[p])
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
  })
})
