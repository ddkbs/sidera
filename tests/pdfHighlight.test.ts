import { describe, expect, it } from 'vitest'
import {
  appendHighlight,
  dominantPage,
  highlightDoc,
  highlightTitle,
  mergeRects,
  quoteOf,
  sourceLabel,
  toPageRects
} from '../src/renderer/src/features/pdf/highlight'

const page = { left: 100, top: 50, width: 400, height: 800 }

describe('toPageRects', () => {
  it('normalises selection rects to the page box', () => {
    expect(toPageRects(page, [{ left: 140, top: 130, width: 200, height: 16 }])).toEqual([
      { x: 0.1, y: 0.1, w: 0.5, h: 0.02 }
    ])
  })

  it('drops the zero-size rects pdf.js emits between spans', () => {
    const rects = [
      { left: 140, top: 130, width: 200, height: 16 },
      { left: 340, top: 130, width: 0, height: 16 }
    ]
    expect(toPageRects(page, rects)).toHaveLength(1)
  })

  it('clamps rects that stick out of the page and ignores an unmeasured page', () => {
    const [r] = toPageRects(page, [{ left: 60, top: 30, width: 600, height: 40 }])
    expect(r.x).toBe(0)
    expect(r.x + r.w).toBeLessThanOrEqual(1)
    expect(toPageRects({ left: 0, top: 0, width: 0, height: 0 }, [{ left: 1, top: 1, width: 2, height: 2 }])).toEqual([])
  })
})

describe('mergeRects', () => {
  it('joins touching rects on the same line but keeps separate lines', () => {
    const merged = mergeRects([
      { x: 0.1, y: 0.1, w: 0.2, h: 0.02 },
      { x: 0.3, y: 0.101, w: 0.2, h: 0.02 },
      { x: 0.1, y: 0.14, w: 0.3, h: 0.02 }
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ x: 0.1, w: 0.4 })
  })

  it('keeps rects on the same line that are far apart (e.g. two columns)', () => {
    const merged = mergeRects([
      { x: 0.05, y: 0.1, w: 0.2, h: 0.02 },
      { x: 0.6, y: 0.1, w: 0.2, h: 0.02 }
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('dominantPage', () => {
  it('picks the page covering most of the selection', () => {
    const groups = [
      { page: 2, rects: [{ left: 0, top: 0, width: 10, height: 10 }] },
      { page: 3, rects: [{ left: 0, top: 0, width: 100, height: 40 }] }
    ]
    expect(dominantPage(groups)?.page).toBe(3)
    expect(dominantPage([])).toBeNull()
  })
})

describe('quotes and card content', () => {
  it('collapses PDF line breaks and re-joins hyphenated words', () => {
    expect(quoteOf('  entangle-\nment  is\n spooky ')).toBe('entanglement is spooky')
    expect(highlightTitle('a'.repeat(80))).toHaveLength(60)
    expect(highlightTitle('short')).toBe('short')
    expect(sourceLabel('paper.pdf', 3)).toBe('paper.pdf · page 3')
  })

  it('builds a quote + source card and appends to an existing one', () => {
    const doc = highlightDoc('spooky\naction', 'paper.pdf', 3)
    expect(doc.content?.[0].type).toBe('blockquote')
    expect(JSON.stringify(doc)).toContain('spooky action')
    expect(JSON.stringify(doc)).toContain('paper.pdf · page 3')

    const existing = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }] }
    const appended = appendHighlight(existing, 'more', 'paper.pdf', 4)
    expect(appended.content).toHaveLength(3)
    expect(appended.content?.[0]).toEqual(existing.content[0])
    expect(appendHighlight(null, 'x', 'p.pdf', 1).content).toHaveLength(2)
  })
})
