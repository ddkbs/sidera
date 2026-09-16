import type { NodeProps } from '@xyflow/react'
import { FileText } from '@/components/icons'
import { memo, useEffect, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { cn } from '@/lib/utils'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export const FileNode = memo(function FileNode({ data, selected, width }: NodeProps<ObjectNode>) {
  const [url, setUrl] = useState<string | null>(null)
  const name = String(data.object.data.name ?? 'File')
  const mime = String(data.object.data.mime ?? '')
  useEffect(() => {
    if (data.object.refId) void window.api.getFileUrl(data.object.refId).then(setUrl)
  }, [data.object.refId])

  return (
    <>
      <Resizer selected={selected} minWidth={140} minHeight={100} />
      <div className={cn('flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm', selected && 'ring-2 ring-brand/70')}>
        <div className={cn("flex min-h-0 flex-1 justify-center overflow-hidden bg-muted/40", mime === "application/pdf" ? "items-start" : "items-center")}>
          {url && mime.startsWith('image/') && <img src={url} alt={name} draggable={false} className="h-full w-full object-contain" />}
          {url && mime === 'application/pdf' && (
            <Document file={url} loading={<FileText className="size-8 text-muted-foreground" />} error={<FileText className="size-8 text-muted-foreground" />}>
              <Page pageNumber={1} width={Math.max(100, (width ?? 320) - 2)} renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
          )}
          {!mime.startsWith('image/') && mime !== 'application/pdf' && <FileText className="size-8 text-muted-foreground" />}
        </div>
        <div className="truncate border-t px-3 py-2 text-xs font-medium">{name}</div>
      </div>
      <Handles />
    </>
  )
})
