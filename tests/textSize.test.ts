import { describe, expect, it } from 'vitest'
import {
  BLOCK_DEFAULT_SIZE,
  HEADING_DEFAULT_SIZE,
  TEXT_SIZE_PRESETS,
  TEXT_SIZE_PX,
  nearestPreset,
  stepPreset,
  steppedSize
} from '../src/renderer/src/features/canvas/textSize'

describe('textSize', () => {
  it('defaults match the long-standing sizes', () => {
    expect(HEADING_DEFAULT_SIZE).toBe(20)
    expect(BLOCK_DEFAULT_SIZE).toBe(14.5)
  })

  it('finds the nearest preset', () => {
    expect(nearestPreset('heading', 20)).toBe('M')
    expect(nearestPreset('heading', 21)).toBe('M')
    expect(nearestPreset('heading', 27)).toBe('L')
    expect(nearestPreset('block', 14.5)).toBe('M')
    expect(nearestPreset('block', 100)).toBe('XXL')
  })

  it('steps within bounds without wrapping', () => {
    expect(stepPreset('M', 1)).toBe('L')
    expect(stepPreset('M', -1)).toBe('S')
    expect(stepPreset('S', -1)).toBe('S')
    expect(stepPreset('XXL', 1)).toBe('XXL')
  })

  it('steppedSize snaps to the nearest preset then steps', () => {
    expect(steppedSize('heading', 20, 1)).toBe(TEXT_SIZE_PX.heading.L)
    expect(steppedSize('heading', 56, 1)).toBe(TEXT_SIZE_PX.heading.XXL)
    expect(steppedSize('block', 14.5, -1)).toBe(TEXT_SIZE_PX.block.S)
    // an odd stored size (e.g. legacy data) snaps to its nearest preset first
    expect(steppedSize('heading', 22, 1)).toBe(TEXT_SIZE_PX.heading.L)
  })

  it('every preset is covered in ascending order', () => {
    const heading = TEXT_SIZE_PRESETS.map((p) => TEXT_SIZE_PX.heading[p])
    const block = TEXT_SIZE_PRESETS.map((p) => TEXT_SIZE_PX.block[p])
    expect(heading).toEqual([...heading].sort((a, b) => a - b))
    expect(block).toEqual([...block].sort((a, b) => a - b))
  })
})
