import { describe, expect, it } from 'vitest'
import { drawingBounds, drawingToSkeletons, sketchNodeSize, strokesToSkeletons } from '../src/renderer/src/features/draw/sketch'
import { FREEDRAW_DIAMETER_PER_STROKE_WIDTH, type DrawSubmission } from '../src/shared/drawProtocol'

const drawing: DrawSubmission = {
  width: 1000,
  height: 800,
  strokes: [
    { tool: 'pen', color: '#1e1e1e', width: 4, opacity: 1, pressure: true, points: [[100, 100, 0.3], [110, 90, 0.5], [130, 95, 0.8]] },
    { tool: 'pen', color: '#1971c2', width: 4, opacity: 1, straight: true, points: [[200, 300, 0.5], [500, 200, 0.5]] },
    { tool: 'highlighter', color: '#fab005', width: 22, opacity: 0.35, points: [[50, 400, 0.5], [60, 402, 0.5], [300, 410, 0.5]] },
    { tool: 'pen', color: '#e03131', width: 2, opacity: 1, points: [[700, 700, 0.5]] }
  ]
}

describe('iPad strokes → Excalidraw skeletons', () => {
  const [pen, line, hl, dot] = strokesToSkeletons(drawing)

  it('turns pencil strokes into freedraw elements with real pressures', () => {
    expect(pen).toMatchObject({ type: 'freedraw', x: 100, y: 100, strokeColor: '#1e1e1e', opacity: 100, simulatePressure: false })
    if (pen.type !== 'freedraw') throw new Error()
    expect(pen.points).toEqual([[0, 0], [10, -10], [30, -5]])
    expect(pen.pressures).toEqual([0.3, 0.5, 0.8])
    expect(pen.width).toBe(30)
    expect(pen.height).toBe(10)
    expect(pen.strokeWidth).toBeCloseTo(4 / FREEDRAW_DIAMETER_PER_STROKE_WIDTH, 2)
    expect(pen.lastCommittedPoint).toEqual([30, -5])
  })

  it('turns snapped strokes into two-point lines (draggable ends)', () => {
    expect(line).toMatchObject({ type: 'line', x: 200, y: 300, points: [[0, 0], [300, -100]], width: 300, height: 100, strokeWidth: 4, roughness: 0, roundness: null })
  })

  it('keeps the highlighter translucent and even', () => {
    expect(hl).toMatchObject({ type: 'freedraw', opacity: 35, simulatePressure: false })
    if (hl.type !== 'freedraw') throw new Error()
    expect(new Set(hl.pressures)).toEqual(new Set([0.5]))
  })

  it('never produces an invisibly small element for a single tap', () => {
    if (dot.type !== 'freedraw') throw new Error()
    expect(dot.points).toHaveLength(2)
    expect(dot.simulatePressure).toBe(true)
  })

  it('sizes the whiteboard node to the drawing aspect ratio', () => {
    const wide = sketchNodeSize({ width: 1, height: 1, strokes: [{ tool: 'pen', color: '#000000', width: 2, opacity: 1, points: [[0, 0, 0.5], [2000, 500, 0.5]] }] })
    expect(wide.width).toBe(560)
    expect(wide.width / wide.height).toBeCloseTo(2050 / 550, 1)
    const tiny = sketchNodeSize({ width: 1, height: 1, strokes: [{ tool: 'pen', color: '#000000', width: 2, opacity: 1, points: [[0, 0, 0.5], [10, 10, 0.5]] }] })
    expect(tiny).toEqual({ width: 160, height: 120 })
  })
})

describe('iPad images → Excalidraw image elements', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const withImages: DrawSubmission = {
    ...drawing,
    images: [
      { id: 'top', mime: 'image/png', data: png, x: 900, y: -50, width: 200, height: 100, strokesBelow: 4 },
      { id: 'bottom', mime: 'image/jpeg', data: '/9j/4AAQ', x: 10, y: 20, width: 50, height: 40, strokesBelow: 0 },
      { id: 'mid', mime: 'image/webp', data: 'UklGRg==', x: 0, y: 0, width: 10, height: 10, strokesBelow: 2 }
    ]
  }

  it('interleaves images with strokes in their stacking order and builds the files map', () => {
    const { skeletons, files } = drawingToSkeletons(withImages, 123)
    expect(skeletons.map((s) => (s.type === 'image' ? s.fileId : s.type))).toEqual(['ipad-bottom', 'freedraw', 'line', 'ipad-mid', 'freedraw', 'freedraw', 'ipad-top'])
    expect(skeletons.at(-1)).toMatchObject({ type: 'image', x: 900, y: -50, width: 200, height: 100, status: 'saved', scale: [1, 1] })
    expect(files['ipad-top']).toEqual({ id: 'ipad-top', mimeType: 'image/png', dataURL: `data:image/png;base64,${png}`, created: 123 })
    expect(Object.keys(files)).toHaveLength(3)
    // no images → unchanged
    expect(drawingToSkeletons(drawing).skeletons.every((s) => s.type !== 'image')).toBe(true)
  })

  it('includes images in the bounds and node size', () => {
    const b = drawingBounds(withImages)!
    expect(b.minX).toBe(0)
    expect(b.minY).toBe(-50)
    expect(b.minX + b.width).toBe(1100)
    const onlyImage = sketchNodeSize({ width: 1, height: 1, strokes: [], images: [withImages.images![0]] })
    expect(onlyImage.width / onlyImage.height).toBeCloseTo((200 + 48) / (100 + 48), 1)
  })
})
