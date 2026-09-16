import { useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Full viewer for imported files (PDF pages / images). */
export function FileViewer({ file, onClose }: { file: { refId: string; name: string; mime: string } | null; onClose: () => void }) {
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
        <div ref={box} className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-6">
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
