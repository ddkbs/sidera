import { Quote } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Document, Page } from 'react-pdf'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Full viewer for imported files (PDF pages / images). */
export function FileViewer({
  file,
  onClose,
  onHighlight
}: {
  file: { refId: string; name: string; mime: string } | null
  onClose: () => void
  onHighlight: (text: string, page: number | null) => void
}) {
  const [selection, setSelection] = useState<{ text: string; page: number | null; x: number; y: number } | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [pages, setPages] = useState(0)
  const [width, setWidth] = useState(800)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUrl(null)
    setPages(0)
    if (file) void window.api.getFileUrl(file.refId).then(setUrl)
  }, [file])

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(1000, e.contentRect.width - 48)))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [url])

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <div className="border-b px-5 py-3">
          <DialogTitle className="truncate text-sm">{file?.name}</DialogTitle>
        </div>
        <div
          ref={box}
          className="relative min-h-0 flex-1 overflow-y-auto bg-muted/40 p-6"
          onMouseUp={() => {
            const sel = window.getSelection()
            const text = sel?.toString().trim() ?? ''
            if (!sel || !text || !box.current) return setSelection(null)
            const range = sel.getRangeAt(0)
            const rect = range.getBoundingClientRect()
            const outer = box.current.getBoundingClientRect()
            const pageEl = (range.startContainer.parentElement as HTMLElement | null)?.closest('[data-page-number]')
            setSelection({
              text,
              page: pageEl ? Number(pageEl.getAttribute('data-page-number')) : null,
              x: rect.left - outer.left + rect.width / 2,
              y: rect.top - outer.top + box.current.scrollTop - 8
            })
          }}
          onScroll={() => setSelection(null)}
        >
          {selection && (
            <Button
              size="sm"
              className="absolute z-10 -translate-x-1/2 -translate-y-full shadow-lg"
              style={{ left: selection.x, top: selection.y }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onHighlight(selection.text, selection.page)
                window.getSelection()?.removeAllRanges()
                setSelection(null)
              }}
            >
              <Quote /> Create card
            </Button>
          )}
          {url && file?.mime === 'application/pdf' && (
            <Document file={url} onLoadSuccess={(d) => setPages(d.numPages)} className="flex flex-col items-center gap-4">
              {Array.from({ length: pages }, (_, i) => (
                <Page key={i} pageNumber={i + 1} width={width} className="overflow-hidden rounded-md shadow-md" />
              ))}
            </Document>
          )}
          {url && file?.mime.startsWith('image/') && <img src={url} alt={file.name} className="mx-auto max-h-full rounded-md object-contain" />}
        </div>
      </DialogContent>
    </Dialog>
  )
}
