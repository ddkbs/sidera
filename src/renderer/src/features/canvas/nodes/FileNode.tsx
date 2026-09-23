import { useReactFlow, type NodeProps } from '@xyflow/react'
import { FileText } from '@/components/icons'
import { memo, useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { cn } from '@/lib/utils'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export const FileNode = memo(function FileNode({ id, data, selected, width }: NodeProps<ObjectNode>) {
  const [url, setUrl] = useState<string | null>(null)
  const rf = useReactFlow()
  const name = String(data.object.data.name ?? 'File')
  const mime = String(data.object.data.mime ?? '')
  useEffect(() => {
    if (data.object.refId) void window.api.getFileUrl(data.object.refId).then(setUrl)
  }, [data.object.refId])

  const bare = mime.startsWith('image/') || mime === 'application/pdf'
  // An image node hugs its picture (no letterboxing) until the user resizes it by hand.
  const fitImage = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    if (data.object.data?.autoSize === false) return
    const img = e.currentTarget
    const w = rf.getNode(id)?.width ?? width
    if (!w || !img.naturalWidth || !img.naturalHeight) return
    const next = Math.round((w * img.naturalHeight) / img.naturalWidth)
    if (Math.abs(next - (rf.getNode(id)?.height ?? 0)) < 2) return
    rf.setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, height: next } : n)))
    persist([{ id, height: next }])
  }

  return (
    <>
      <Resizer selected={selected} minWidth={140} minHeight={100} />
      {bare ? (
        <div className={cn('flex h-full w-full justify-center overflow-hidden', mime === 'application/pdf' ? 'items-start' : 'items-center', selected && 'ring-2 ring-brand/70')}>
          {url && mime.startsWith('image/') && <img src={url} alt={name} draggable={false} onLoad={fitImage} className="h-full w-full object-contain" />}
          {url && mime === 'application/pdf' && (
            <Document file={url} loading={<FileText className="size-8 text-muted-foreground" />} error={<FileText className="size-8 text-muted-foreground" />}>
              <Page pageNumber={1} width={Math.max(100, width ?? 320)} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
          )}
        </div>
      ) : (
        <div className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm', selected && 'ring-2 ring-brand/70')}>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            <FileText className="size-8 text-muted-foreground" />
          </div>
          <div className="truncate border-t px-3 py-2 text-xs font-medium">{name}</div>
        </div>
      )}
      <Handles />
    </>
  )
})
