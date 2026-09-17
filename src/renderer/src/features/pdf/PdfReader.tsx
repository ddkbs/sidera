import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import { toast } from 'sonner'
import type { HighlightRect, PdfHighlight } from '@shared/types'
import { ChevronLeft, ChevronRight, PanelRight, Search, X, ZoomIn, ZoomOut } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { record } from '@/lib/undo'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  useCreateHighlightMutation,
  useDeleteHighlightMutation,
  useListHighlightsQuery,
  useUpdateHighlightMutation
} from '@/store/api'
import { clearPdfJump, closePdf, openCard, setPdfListOpen, setPdfWidth, PDF_MAX_WIDTH, PDF_MIN_WIDTH } from '@/store/ui'
import { HighlightList } from './HighlightList'
import { SelectionBar } from './SelectionBar'
import { HIGHLIGHT_CARD_EVENT, setHighlightDrag, type HighlightDrag } from './dnd'
import { DEFAULT_HIGHLIGHT_COLOR, dominantPage, fillOf, highlightDoc, highlightTitle, quoteOf, toPageRects } from './highlight'
import './pdfjs'
import './pdf.css'

const GAP = 16
/** How far outside the viewport pages are still rendered (keeps scrolling smooth). */
const OVERSCAN = 600
const A4 = 1.414
/** Full-text search reads page text lazily; stop at this many pages so huge files stay responsive. */
const SEARCH_PAGE_LIMIT = 400

type Pending = { page: number; rects: HighlightRect[]; text: string }
type Hit = { page: number; snippet: string }

/** Split-screen PDF reader docked to the right of the board/card, with colour highlights. */
export function PdfReader() {
  const dispatch = useAppDispatch()
  const pdf = useAppSelector((s) => s.ui.pdf)
  const width = useAppSelector((s) => s.ui.pdfWidth)
  const listOpen = useAppSelector((s) => s.ui.pdfListOpen)
  const fileId = pdf?.fileId ?? ''

  const { data: highlights = [] } = useListHighlightsQuery(fileId, { skip: !fileId })
  const [createHighlight] = useCreateHighlightMutation()
  const [updateHighlight] = useUpdateHighlightMutation()
  const [deleteHighlight] = useDeleteHighlightMutation()

  const [url, setUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [ratios, setRatios] = useState<number[]>([])
  const [zoom, setZoom] = useState(1)
  const [scrollTop, setScrollTop] = useState(0)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<Pending | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const docRef = useRef<{ getPage: (n: number) => Promise<unknown> } | null>(null)
  const pageText = useRef(new Map<number, string>())

  const active = highlights.find((h) => h.id === activeId) ?? null

  useEffect(() => {
    setUrl(null)
    setNumPages(0)
    setRatios([])
    setPending(null)
    setActiveId(null)
    setHits(null)
    pageText.current.clear()
    if (fileId) void window.api.getFileUrl(fileId).then(setUrl)
  }, [fileId])

  // measure the reader body (page width follows it)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  const pageWidth = Math.max(180, (box.w - 2 * GAP) * zoom)

  /** Page tops from the real page aspect ratios, so only visible pages have to be rendered. */
  const layout = useMemo(() => {
    const items: { top: number; height: number }[] = []
    let top = GAP
    for (let i = 0; i < numPages; i++) {
      const height = pageWidth * (ratios[i] ?? ratios[0] ?? A4)
      items.push({ top, height })
      top += height + GAP
    }
    return { items, total: top }
  }, [numPages, ratios, pageWidth])

  const visible = useMemo(() => {
    const from = scrollTop - OVERSCAN
    const to = scrollTop + box.h + OVERSCAN
    const out: number[] = []
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i]
      if (it.top + it.height > from && it.top < to) out.push(i + 1)
    }
    return out
  }, [layout, scrollTop, box.h])

  const onLoad = useCallback(async (doc: { numPages: number; getPage: (n: number) => Promise<unknown> }) => {
    docRef.current = doc
    setNumPages(doc.numPages)
    const rs: number[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      try {
        const p = (await doc.getPage(n)) as { getViewport: (o: { scale: number }) => { width: number; height: number } }
        const v = p.getViewport({ scale: 1 })
        rs.push(v.height / v.width)
      } catch {
        rs.push(rs[0] ?? A4)
      }
      // only the first pages need exact ratios up front; the rest inherit until they are measured
      if (n === 8) setRatios([...rs])
    }
    setRatios(rs)
  }, [])

  const scrollToPage = useCallback(
    (n: number) => {
      const it = layout.items[n - 1]
      if (!it || !scroller.current) return
      scroller.current.scrollTop = it.top - GAP
      setPage(n)
    },
    [layout]
  )

  // jump requested when the reader was opened (e.g. from a card's source page)
  useEffect(() => {
    if (!pdf?.jumpTo || !layout.items.length) return
    scrollToPage(pdf.jumpTo)
    dispatch(clearPdfJump())
  }, [pdf?.jumpTo, layout.items.length, scrollToPage, dispatch])

  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setScrollTop(el.scrollTop)
    const i = layout.items.findIndex((it) => it.top + it.height > el.scrollTop + 8)
    setPage(i < 0 ? layout.items.length || 1 : i + 1)
  }, [layout])

  const pageBox = (n: number): DOMRect | null =>
    scroller.current?.querySelector(`[data-page-number="${n}"]`)?.getBoundingClientRect() ?? null

  /** Turn the current DOM selection into a pending highlight on the page it mostly covers. */
  const readSelection = useCallback(() => {
    const sel = window.getSelection()
    const text = sel?.toString() ?? ''
    if (!sel || sel.isCollapsed || !quoteOf(text) || !scroller.current) return setPending(null)
    const rects = [...sel.getRangeAt(0).getClientRects()]
    const groups: { page: number; rects: DOMRect[] }[] = []
    for (const el of scroller.current.querySelectorAll('[data-page-number]')) {
      const b = el.getBoundingClientRect()
      const inside = rects.filter((r) => {
        const cy = r.top + r.height / 2
        return r.width > 0.5 && r.height > 0.5 && cy >= b.top && cy <= b.bottom
      })
      if (inside.length) groups.push({ page: Number(el.getAttribute('data-page-number')), rects: inside })
    }
    const best = dominantPage(groups)
    const b = best && pageBox(best.page)
    if (!best || !b) return setPending(null)
    setActiveId(null)
    setPending({ page: best.page, rects: toPageRects(b, best.rects), text })
  }, [])

  /** A click that is not a selection either picks the highlight under the cursor or clears the bar. */
  const onClick = (e: React.MouseEvent) => {
    if (window.getSelection()?.toString().trim()) return
    const el = (e.target as HTMLElement).closest('[data-page-number]')
    if (!el) {
      setActiveId(null)
      return setPending(null)
    }
    const n = Number(el.getAttribute('data-page-number'))
    const b = el.getBoundingClientRect()
    const x = (e.clientX - b.left) / b.width
    const y = (e.clientY - b.top) / b.height
    const hit = highlights.find((h) => h.page === n && h.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h))
    setPending(null)
    setActiveId(hit?.id ?? null)
  }

  const persist = async (color: string): Promise<PdfHighlight | null> => {
    if (active) {
      const res = await updateHighlight({ id: active.id, color, fileId })
      return 'data' in res ? (res.data ?? null) : null
    }
    if (!pending || !pdf) return null
    const res = await createHighlight({ fileId, page: pending.page, text: pending.text, rects: pending.rects, color })
    if (!('data' in res) || !res.data) {
      toast.error('Could not save the highlight')
      return null
    }
    setPending(null)
    setActiveId(res.data.id)
    window.getSelection()?.removeAllRanges()
    return res.data
  }

  const dragPayload = (h: PdfHighlight | Pending, color: string, id?: string): HighlightDrag => ({
    fileId,
    fileName: pdf?.name ?? 'PDF',
    page: h.page,
    color,
    text: quoteOf(h.text),
    highlightId: id
  })

  /** Create a card from a highlight: the board handles it when one is open, otherwise it goes to the library. */
  const createCard = async (h: PdfHighlight | Pending, color: string) => {
    const payload = dragPayload(h, color, 'id' in h ? h.id : undefined)
    const handled = !window.dispatchEvent(new CustomEvent(HIGHLIGHT_CARD_EVENT, { detail: payload, cancelable: true }))
    if (handled) return
    const card = await window.api.createCard({
      title: highlightTitle(h.text),
      content: highlightDoc(h.text, payload.fileName, h.page)
    })
    await window.api.updateCard({ id: card.id, color })
    record({
      label: 'Card from highlight',
      undo: () => window.api.deleteCard(card.id),
      redo: () => window.api.restoreCard(card.id)
    })
    dispatch(openCard(card.id))
    toast.success('Card created from highlight')
  }

  const runSearch = async () => {
    const q = query.trim().toLowerCase()
    const doc = docRef.current
    if (!q || !doc) return setHits(null)
    const found: Hit[] = []
    const limit = Math.min(numPages, SEARCH_PAGE_LIMIT)
    for (let n = 1; n <= limit; n++) {
      let text = pageText.current.get(n)
      if (text === undefined) {
        try {
          const p = (await doc.getPage(n)) as { getTextContent: () => Promise<{ items: { str?: string }[] }> }
          const content = await p.getTextContent()
          text = content.items.map((i) => i.str ?? '').join(' ')
        } catch {
          text = ''
        }
        pageText.current.set(n, text)
      }
      const at = text.toLowerCase().indexOf(q)
      if (at >= 0) found.push({ page: n, snippet: text.slice(Math.max(0, at - 40), at + q.length + 40).trim() })
      if (found.length >= 50) break
    }
    setHits(found)
  }

  // divider drag
  const onResize = (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => dispatch(setPdfWidth(startW + (startX - ev.clientX)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!pdf) return null
  const barColor = active?.color ?? null

  return (
    <motion.aside
      key="pdf-reader"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      style={{ maxWidth: '85%' }}
      className="pdf-reader relative flex h-full shrink-0 flex-col overflow-hidden border-l bg-background"
    >
      <div
        onPointerDown={onResize}
        onDoubleClick={() => dispatch(setPdfWidth((PDF_MIN_WIDTH + PDF_MAX_WIDTH) / 3))}
        className="absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize hover:bg-brand/40"
        role="separator"
        aria-label="Resize PDF reader"
      />
      <header className="flex h-11 shrink-0 items-center gap-1 border-b pl-4 pr-2">
        <p className="mr-auto truncate text-sm font-medium">{pdf.name}</p>
        <div className="flex items-center gap-0.5 text-muted-foreground">
          <Button variant="ghost" size="icon" className="size-7" aria-label="Previous page" disabled={page <= 1} onClick={() => scrollToPage(page - 1)}>
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-14 text-center text-xs tabular-nums">
            {page} / {numPages || '–'}
          </span>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Next page" disabled={page >= numPages} onClick={() => scrollToPage(page + 1)}>
            <ChevronRight size={16} />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}>
            <ZoomOut size={16} />
          </Button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-10 text-center text-xs tabular-nums hover:text-foreground" aria-label="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.15).toFixed(2)))}>
            <ZoomIn size={16} />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={cn('size-7', searchOpen && 'text-foreground')} aria-label="Search in document" onClick={() => setSearchOpen((o) => !o)}>
                <Search size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search in document</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={cn('size-7', listOpen && 'text-foreground')} aria-label="Toggle highlight list" onClick={() => dispatch(setPdfListOpen(!listOpen))}>
                <PanelRight size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Highlights</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Close PDF" onClick={() => dispatch(closePdf())}>
            <X size={16} />
          </Button>
        </div>
      </header>

      {searchOpen && (
        <div className="shrink-0 border-b p-2">
          <Input
            autoFocus
            value={query}
            placeholder="Search in document…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch()
              if (e.key === 'Escape') setSearchOpen(false)
            }}
            className="h-8"
          />
          {hits && (
            <div className="mt-2 max-h-40 overflow-y-auto">
              {hits.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No matches.</p>}
              {hits.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollToPage(h.page)}
                  className="block w-full rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
                >
                  <span className="mr-2 text-muted-foreground tabular-nums">p.{h.page}</span>
                  <span className="text-foreground/80">…{h.snippet}…</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <div
            ref={scroller}
            onScroll={onScroll}
            onMouseUp={readSelection}
            onClick={onClick}
            className="h-full overflow-auto bg-muted/40"
          >
            {url && (
              <Document
                file={url}
                onLoadSuccess={(d) => void onLoad(d as unknown as { numPages: number; getPage: (n: number) => Promise<unknown> })}
                loading={<p className="p-6 text-center text-xs text-muted-foreground">Loading…</p>}
                error={<p className="p-6 text-center text-xs text-muted-foreground">This document could not be opened.</p>}
              >
                <div className="relative w-full" style={{ height: layout.total }}>
                  {visible.map((n) => (
                    <div
                      key={n}
                      data-page-number={n}
                      className="absolute left-1/2 -translate-x-1/2 bg-white shadow-sm ring-1 ring-black/5"
                      style={{ top: layout.items[n - 1].top, width: pageWidth, height: layout.items[n - 1].height }}
                    >
                      <Page pageNumber={n} width={pageWidth} renderAnnotationLayer={false} loading={null} />
                      <div className="pointer-events-none absolute inset-0 z-[2]" style={{ mixBlendMode: 'multiply' }}>
                        {highlights
                          .filter((h) => h.page === n)
                          .map((h) =>
                            h.rects.map((r, k) => (
                              <div
                                key={`${h.id}-${k}`}
                                draggable={h.id === activeId}
                                onDragStart={(e) => setHighlightDrag(e.dataTransfer, dragPayload(h, h.color, h.id))}
                                className={cn('absolute rounded-[2px]', h.id === activeId && 'pointer-events-auto cursor-grab ring-1 ring-black/25')}
                                style={{
                                  left: `${r.x * 100}%`,
                                  top: `${r.y * 100}%`,
                                  width: `${r.w * 100}%`,
                                  height: `${r.h * 100}%`,
                                  background: fillOf(h.color)
                                }}
                              />
                            ))
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </Document>
            )}
          </div>
          <AnimatePresence>
            {(pending || active) && (
              <SelectionBar
                activeColor={barColor}
                canRemove={!!active}
                onColor={(c) => void persist(c)}
                onCopy={() => {
                  void navigator.clipboard.writeText(quoteOf(active?.text ?? pending?.text ?? ''))
                  toast.success('Copied')
                }}
                onCreateCard={() => {
                  void (async () => {
                    const saved = active ?? (await persist(DEFAULT_HIGHLIGHT_COLOR))
                    if (saved) await createCard(saved, saved.color)
                  })()
                }}
                onDragCard={(e) => {
                  const src = active ?? pending
                  if (!src) return
                  const color = active?.color ?? DEFAULT_HIGHLIGHT_COLOR
                  setHighlightDrag(e.dataTransfer, dragPayload(src, color, active?.id))
                  if (!active) void persist(color)
                }}
                onRemove={() => {
                  if (!active) return
                  void deleteHighlight({ id: active.id, fileId })
                  setActiveId(null)
                }}
              />
            )}
          </AnimatePresence>
        </div>
        {listOpen && (
          <HighlightList
            highlights={highlights}
            activeId={activeId}
            onPick={(h) => {
              setPending(null)
              setActiveId(h.id)
              scrollToPage(h.page)
            }}
            onNote={(h, note) => void updateHighlight({ id: h.id, note: note || null, fileId })}
            onRemove={(h) => {
              void deleteHighlight({ id: h.id, fileId })
              if (activeId === h.id) setActiveId(null)
            }}
            onDrag={(h, e) => setHighlightDrag(e.dataTransfer, dragPayload(h, h.color, h.id))}
          />
        )}
      </div>
    </motion.aside>
  )
}
