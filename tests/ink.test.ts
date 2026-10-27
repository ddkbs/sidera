import { describe, expect, it } from 'vitest'
import {
  appendTarget,
  boardToScene,
  boardToScreen,
  darkInk,
  elementBounds,
  elementsBoardBounds,
  elementsHit,
  lassoElements,
  pointInPolygon,
  fitTransform,
  freedrawOutline,
  freedrawPath,
  hitInkObject,
  inkBounds,
  joinsGroup,
  outlinePath,
  reboxed,
  sceneToBoard,
  screenToBoard,
  type InkElement,
  type Rect
} from '../src/renderer/src/features/ink/geometry'
import { HIGHLIGHTER_WIDTHS, INK_COLORS, INK_PALETTE, appendStrokes, eraseElements, moveElements, newInk, penStroke, pushRecentColor, strokeToElement, type PenSettings } from '../src/renderer/src/features/ink/elements'
import { framelessSize, toggledFrameBox } from '../src/renderer/src/features/ink/frame'

const pen: PenSettings = { tool: 'pen', color: '#1e1e1e', width: 1 }
const line = (pts: [number, number][], id: string, settings = pen): InkElement =>
  strokeToElement(
    penStroke(
      pts.map(([x, y]) => [x, y, 0.5]),
      settings,
      false
    ),
    id
  )

/** A horizontal stroke 100 → 300 at y = 100, and a vertical one far right. */
const underline = line([[100, 100], [200, 100], [300, 100]], 'u')
const bar = line([[600, 0], [600, 200]], 'b')

const near = (a: Rect, b: Rect, d = 1e-6): void => {
  expect(a.x).toBeCloseTo(b.x, 5)
  expect(a.y).toBeCloseTo(b.y, 5)
  expect(Math.abs(a.width - b.width)).toBeLessThan(d + 1e-6)
  expect(Math.abs(a.height - b.height)).toBeLessThan(d + 1e-6)
}

describe('ink elements', () => {
  it('reuses the iPad conversion: mouse strokes simulate pressure, pen strokes keep it', () => {
    expect(underline).toMatchObject({ type: 'freedraw', x: 100, y: 100, simulatePressure: true, isDeleted: false, id: 'u', version: 1 })
    const real = strokeToElement(penStroke([[0, 0, 0.2], [10, 0, 0.9]], pen, true), 'p')
    expect(real).toMatchObject({ simulatePressure: false, pressures: [0.2, 0.9] })
    const hl = strokeToElement(penStroke([[0, 0, 0.2], [10, 0, 0.9]], { ...pen, tool: 'highlighter' }, true), 'h')
    expect(hl).toMatchObject({ opacity: 35, strokeColor: '#fab005', simulatePressure: false })
  })

  it('marker widths follow the width setting; recent colours move to the front and keep their count', () => {
    expect(penStroke([[0, 0, 0.5]], { ...pen, tool: 'highlighter', width: 2 }, true).width).toBe(HIGHLIGHTER_WIDTHS[2])
    const recent = INK_COLORS.map((c) => c.value)
    expect(pushRecentColor(recent, '#7950f2')).toEqual(['#7950f2', ...recent.slice(0, -1)])
    expect(pushRecentColor(recent, recent[2].toUpperCase())).toEqual([recent[2].toUpperCase(), ...recent.filter((_, i) => i !== 2)])
    for (const c of INK_COLORS) expect(INK_PALETTE).toContain(c.value)
  })

  it('lasso picks the strokes mostly inside the loop; moving them keeps the rest in place', () => {
    const ink = newInk([{ stroke: penStroke([[0, 0, 0.5], [20, 0, 0.5]], pen, false), id: 'a' }, { stroke: penStroke([[200, 0, 0.5], [220, 0, 0.5]], pen, false), id: 'b' }])!
    const loop = [{ x: -10, y: -10 }, { x: 40, y: -10 }, { x: 40, y: 10 }, { x: -10, y: 10 }]
    expect(pointInPolygon({ x: 5, y: 0 }, loop)).toBe(true)
    expect(pointInPolygon({ x: 100, y: 0 }, loop)).toBe(false)
    expect(lassoElements(ink.elements, ink.box, loop)).toEqual(['a'])
    const before = elementsBoardBounds(ink.elements, ink.box, new Set(['b']))!
    const moved = moveElements(ink.elements, ink.box, new Set(['a']), 0, 50)!
    expect(elementsBoardBounds(moved.elements, moved.box, new Set(['a']))!.y).toBeCloseTo(elementsBoardBounds(ink.elements, ink.box, new Set(['a']))!.y + 50, 5)
    near(elementsBoardBounds(moved.elements, moved.box, new Set(['b']))!, before)
  })

  it('outline path is a closed Excalidraw-style quadratic path', () => {
    const d = outlinePath(freedrawOutline(underline))
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain(' Q')
    expect(d.endsWith('Z')).toBe(true)
  })

  it('written strokes reuse their outline (a refetched copy too); moved or live strokes are recomputed', () => {
    const a = freedrawOutline(underline)
    expect(freedrawOutline(JSON.parse(JSON.stringify(underline)))).toBe(a)
    expect(freedrawPath(underline)).toBe(outlinePath(a))
    const moved = freedrawOutline({ ...underline, x: underline.x + 5 })
    expect(moved).not.toBe(a)
    expect(moved[0][0]).toBeCloseTo(a[0][0] + 5, 5)
    const live = { ...underline, lastCommittedPoint: null }
    expect(freedrawOutline(live)).not.toBe(freedrawOutline(live))
  })

  it('bounds hug the ink (stroke width included)', () => {
    const b = elementBounds(underline)!
    expect(b.x).toBeLessThan(100)
    expect(b.x).toBeGreaterThan(90)
    expect(b.x + b.width).toBeGreaterThan(300)
    expect(b.height).toBeGreaterThan(1)
    expect(b.height).toBeLessThan(12)
    expect(inkBounds([])).toBeNull()
    expect(inkBounds([{ ...underline, isDeleted: true }])).toBeNull()
  })
})

describe('scene ↔ board ↔ screen', () => {
  it('fits bounds into a box uniformly and centred, and inverts exactly', () => {
    const bounds = { x: 10, y: 20, width: 100, height: 50 }
    const t = fitTransform(bounds, { x: 500, y: 500, width: 200, height: 200 })
    expect(t.s).toBe(2)
    // 100 px of letterbox above and below
    expect(sceneToBoard({ x: 10, y: 20 }, t)).toEqual({ x: 500, y: 550 })
    const p = { x: 37, y: 41 }
    const back = boardToScene(sceneToBoard(p, t), t)
    expect(back.x).toBeCloseTo(p.x, 10)
    expect(back.y).toBeCloseTo(p.y, 10)
  })

  it('reboxing after bounds change keeps the scale and every old point in place', () => {
    const old = { x: 0, y: 0, width: 100, height: 100 }
    const t = fitTransform(old, { x: 1000, y: 1000, width: 50, height: 50 })
    const grown = { x: -20, y: 0, width: 200, height: 100 }
    const box = reboxed(t, grown)
    expect(box).toEqual({ x: 990, y: 1000, width: 100, height: 50 })
    const t2 = fitTransform(grown, box)
    expect(sceneToBoard({ x: 50, y: 50 }, t2)).toEqual(sceneToBoard({ x: 50, y: 50 }, t))
  })

  it('converts pointer positions with the xyflow viewport (pan + zoom)', () => {
    const origin = { x: 240, y: 48 }
    const vp = { x: -300, y: 120, zoom: 2 }
    const b = screenToBoard({ x: 740, y: 368 }, origin, vp)
    expect(b).toEqual({ x: 400, y: 100 })
    expect(boardToScreen(b, origin, vp)).toEqual({ x: 740, y: 368 })
  })
})

describe('creating, appending and erasing ink objects', () => {
  it('a new ink object is exactly its ink bounds (scale 1: no jump on commit)', () => {
    const ink = newInk([{ stroke: penStroke([[100, 100, 0.5], [300, 100, 0.5]], pen, false), id: 'a' }])!
    near(ink.box, inkBounds(ink.elements)!)
    expect(fitTransform(inkBounds(ink.elements)!, ink.box).s).toBeCloseTo(1, 10)
  })

  it('appending keeps old strokes in place and puts new strokes where they were drawn', () => {
    const first = newInk([{ stroke: penStroke([[100, 100, 0.5], [300, 100, 0.5]], pen, false), id: 'a' }])!
    // the user moved and scaled the object ×2 since
    const moved = { x: first.box.x + 1000, y: first.box.y + 500, width: first.box.width * 2, height: first.box.height * 2 }
    const t = fitTransform(inkBounds(first.elements)!, moved)
    const oldStart = sceneToBoard({ x: 100, y: 100 }, t)
    const drawnAt: [number, number, number][] = [
      [oldStart.x, oldStart.y + 100, 0.5],
      [oldStart.x + 50, oldStart.y + 150, 0.5]
    ]
    const next = appendStrokes(first.elements, moved, [{ stroke: penStroke(drawnAt, pen, false), id: 'b' }])!
    const t2 = fitTransform(inkBounds(next.elements)!, next.box)
    expect(t2.s).toBeCloseTo(2, 6)
    const a = sceneToBoard({ x: 100, y: 100 }, t2)
    expect(a.x).toBeCloseTo(oldStart.x, 6)
    expect(a.y).toBeCloseTo(oldStart.y, 6)
    const added = next.elements[1]
    const b = sceneToBoard({ x: added.x, y: added.y }, t2)
    expect(b.x).toBeCloseTo(drawnAt[0][0], 6)
    expect(b.y).toBeCloseTo(drawnAt[0][1], 6)
    // drawn with the same on-screen width: scene stroke width halves at scale 2
    expect(added.strokeWidth! * 2).toBeCloseTo(next.elements[0].strokeWidth!, 1)
  })

  it('erasing shrinks the box around what is left, which stays put; erasing everything removes the object', () => {
    const elements = [underline, bar]
    const box = inkBounds(elements)!
    const rest = eraseElements(elements, box, new Set(['b']))!
    expect(rest.elements.map((e) => e.id)).toEqual(['u'])
    near(rest.box, inkBounds([underline])!)
    expect(eraseElements(elements, box, new Set(['u', 'b']))).toBeNull()
  })
})

describe('hit testing (eraser and frameless click-through)', () => {
  const elements = [underline, bar]
  it('hits the stroke itself', () => {
    expect(elementsHit(elements, { x: 200, y: 101 }, 2)).toEqual(['u'])
    expect(elementsHit(elements, { x: 603, y: 100 }, 2)).toEqual(['b'])
  })

  it('misses empty space inside the bounding box', () => {
    // centre of the ink bbox: between the underline and the bar — nothing painted there
    expect(elementsHit(elements, { x: 450, y: 60 }, 4)).toEqual([])
  })

  it('works from board coordinates for a moved and scaled object', () => {
    const b = inkBounds(elements)!
    const box = { x: 5000, y: 5000, width: b.width / 2, height: b.height / 2 }
    const t = fitTransform(b, box)
    const onUnderline = sceneToBoard({ x: 200, y: 100 }, t)
    expect(hitInkObject(elements, box, onUnderline, 2)).toEqual(['u'])
    expect(hitInkObject(elements, box, sceneToBoard({ x: 450, y: 60 }, t), 2)).toEqual([])
  })

  it('images are hit anywhere, outlined shapes only on their outline', () => {
    const img: InkElement = { id: 'i', type: 'image', x: 0, y: 0, width: 100, height: 100 }
    const rect: InkElement = { id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, strokeWidth: 2, backgroundColor: 'transparent' }
    expect(elementsHit([img], { x: 50, y: 50 }, 1)).toEqual(['i'])
    expect(elementsHit([rect], { x: 50, y: 50 }, 1)).toEqual([])
    expect(elementsHit([rect], { x: 1, y: 50 }, 1)).toEqual(['r'])
  })
})

describe('grouping strokes', () => {
  const group = { bounds: { x: 0, y: 0, width: 100, height: 100 }, lastAt: 1000 }
  it('joins while drawing continuously nearby', () => {
    expect(joinsGroup(group, { x: 150, y: 50 }, 2000, 160)).toBe(true)
  })
  it('starts a new group after a pause or far away', () => {
    expect(joinsGroup(group, { x: 150, y: 50 }, 2600, 160)).toBe(false)
    expect(joinsGroup(group, { x: 400, y: 50 }, 1200, 160)).toBe(false)
    expect(joinsGroup(null, { x: 0, y: 0 }, 0, 160)).toBe(false)
  })
  it('appends to the nearest ink object of the session within the gap', () => {
    const objs = [
      { id: 'a', box: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 'b', box: { x: 130, y: 0, width: 100, height: 100 } }
    ]
    expect(appendTarget(objs, { x: 120, y: 50 }, 40)?.id).toBe('b')
    expect(appendTarget(objs, { x: 50, y: 50 }, 40)?.id).toBe('a')
    expect(appendTarget(objs, { x: 500, y: 50 }, 40)).toBeNull()
  })
})

describe('frame toggle and sizes', () => {
  const elements = [underline]
  const b = inkBounds(elements)!
  it('frameless size is the ink bounds, capped', () => {
    const s = framelessSize(elements)
    expect(s.width).toBeCloseTo(b.width, 6)
    expect(framelessSize(elements, { width: 100, height: 100 }).width).toBeCloseTo(100, 6)
  })
  it('removing then adding the frame keeps the ink centred', () => {
    const framed = { x: 0, y: 0, width: 400, height: 200 }
    const ink = toggledFrameBox(framed, elements, true)
    expect(ink.x + ink.width / 2).toBeCloseTo(200, 6)
    expect(ink.y + ink.height / 2).toBeCloseTo(100, 6)
    expect(ink.width / ink.height).toBeCloseTo(b.width / b.height, 6)
    const back = toggledFrameBox(ink, elements, false)
    expect(back.x + back.width / 2).toBeCloseTo(200, 6)
    expect(back.width).toBeGreaterThanOrEqual(160)
    expect(back.height).toBeGreaterThanOrEqual(120)
  })
})

describe('dark ink', () => {
  it('turns near-black ink light and keeps hues recognisable', () => {
    const light = darkInk('#1e1e1e')!
    expect(parseInt(light.slice(1, 3), 16)).toBeGreaterThan(200)
    const blue = darkInk('#1971c2')!
    // still blue-ish: blue channel dominates
    expect(parseInt(blue.slice(5, 7), 16)).toBeGreaterThan(parseInt(blue.slice(1, 3), 16))
    expect(darkInk('transparent')).toBe('transparent')
    expect(darkInk('var(--x)')).toBe('var(--x)')
  })
})
