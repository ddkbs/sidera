import type { DocJSON, HighlightRect } from '@shared/types'
import { t } from '../../lib/i18n'

/** Colours offered in the selection bar (keys of the shared palette in `lib/colors.ts`). */
export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange'] as const
export const DEFAULT_HIGHLIGHT_COLOR = 'yellow'

/**
 * Fill used over the page. Painted with `mix-blend-mode: multiply` so the text below stays
 * readable — which also means the same values work on light and dark UI (pages stay white).
 */
export const HIGHLIGHT_FILL: Record<string, string> = {
  yellow: 'oklch(0.92 0.17 95 / 0.6)',
  green: 'oklch(0.88 0.15 150 / 0.55)',
  blue: 'oklch(0.87 0.11 250 / 0.6)',
  pink: 'oklch(0.86 0.12 350 / 0.6)',
  purple: 'oklch(0.86 0.1 300 / 0.6)',
  orange: 'oklch(0.89 0.14 60 / 0.6)'
}

export const fillOf = (c: string | null | undefined): string => HIGHLIGHT_FILL[c ?? ''] ?? HIGHLIGHT_FILL.yellow

/** The parts of a DOMRect we need — so the geometry below stays testable without a DOM. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

const clamp = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Selection rectangles (viewport pixels) → rectangles normalised to the page box, so a
 * highlight is stored zoom- and size-independent and can be re-drawn at any scale.
 */
export function toPageRects(page: Box, rects: Box[]): HighlightRect[] {
  if (page.width <= 0 || page.height <= 0) return []
  const norm = rects
    // pdf.js text layers emit zero-size rects between spans; drop them
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => {
      const x = clamp((r.left - page.left) / page.width)
      const y = clamp((r.top - page.top) / page.height)
      return { x, y, w: Math.min(clamp(r.width / page.width), 1 - x), h: Math.min(clamp(r.height / page.height), 1 - y) }
    })
    .filter((r) => r.w > 0 && r.h > 0)
  return mergeRects(norm)
}

/** Join rects that sit on the same line and touch, so one highlighted line is one box. */
export function mergeRects(rects: HighlightRect[]): HighlightRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: HighlightRect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const sameLine = last && Math.abs(last.y - r.y) < Math.min(last.h, r.h) * 0.5
    const touching = last && r.x <= last.x + last.w + 0.012
    if (last && sameLine && touching) {
      const right = Math.max(last.x + last.w, r.x + r.w)
      const bottom = Math.max(last.y + last.h, r.y + r.h)
      last.y = Math.min(last.y, r.y)
      last.x = Math.min(last.x, r.x)
      last.w = right - last.x
      last.h = bottom - last.y
    } else out.push({ ...r })
  }
  return out
}

/** Which page holds most of the selection (a highlight belongs to exactly one page). */
export function dominantPage(groups: { page: number; rects: Box[] }[]): { page: number; rects: Box[] } | null {
  let best: { page: number; rects: Box[] } | null = null
  let bestArea = 0
  for (const g of groups) {
    const area = g.rects.reduce((sum, r) => sum + r.width * r.height, 0)
    if (area > bestArea) {
      bestArea = area
      best = g
    }
  }
  return best
}

/** PDF text keeps line breaks and hyphenation from the layout — collapse it into a quotable line. */
export const quoteOf = (text: string): string => text.replace(/-\n\s*/g, '').replace(/\s+/g, ' ').trim()

export function highlightTitle(text: string, max = 60): string {
  const q = quoteOf(text)
  return q.length > max ? q.slice(0, max - 1).trimEnd() + '…' : q
}

/** "paper.pdf · page 3" — the provenance line shown on cards and in the highlight list. */
export const sourceLabel = (fileName: string, page: number): string => `${fileName} · ${t('pdf.pageLower', { n: page })}`

const quoteBlocks = (quote: string, source: string): DocJSON[] => [
  { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: quote }] }] },
  { type: 'paragraph', content: [{ type: 'text', text: source, marks: [{ type: 'italic' }] }] }
]

/** Card body for a highlight: the quote plus an italic source line naming the PDF and page. */
export const highlightDoc = (text: string, fileName: string, page: number): DocJSON => ({
  type: 'doc',
  content: quoteBlocks(quoteOf(text), sourceLabel(fileName, page))
})

/** Same blocks appended to an existing card (dropping a highlight onto a card). */
export const appendHighlight = (doc: DocJSON | null | undefined, text: string, fileName: string, page: number): DocJSON => ({
  type: 'doc',
  content: [...(doc?.content ?? []), ...quoteBlocks(quoteOf(text), sourceLabel(fileName, page))]
})
