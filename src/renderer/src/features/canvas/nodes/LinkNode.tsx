import type { NodeProps } from '@xyflow/react'
import { Bookmark, Globe } from '@/components/icons'
import { memo, useEffect, useState } from 'react'
import type { LinkPreviewData } from '@shared/types'
import { cn } from '@/lib/utils'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { t, useLang } from '@/lib/i18n'

/** Dispatched by the "Save as card" button; WhiteboardView clips the page and wires up the connection. */
export const SAVE_LINK_EVENT = 'sidera:save-link'
/** Dispatched back by WhiteboardView once a save finishes (success or failure), so the button resets. */
export const SAVE_LINK_DONE_EVENT = 'sidera:save-link-done'

export const LinkNode = memo(function LinkNode({ id, data, selected }: NodeProps<ObjectNode>) {
  useLang()
  const stored = data.object.data as Partial<LinkPreviewData> & { url: string }
  const [preview, setPreview] = useState<Partial<LinkPreviewData>>(stored)
  const [saving, setSaving] = useState(false)
  const loading = !preview.fetchedAt
  // previews saved before images were cached locally still point at remote URLs (blocked by CSP) → refetch once
  const stale = /^https?:/i.test(`${stored.image ?? ''}${stored.favicon ?? ''}`)

  useEffect(() => setPreview(stored), [stored])

  useEffect(() => {
    const onDone = (e: Event) => {
      if ((e as CustomEvent<{ nodeId: string }>).detail.nodeId === id) setSaving(false)
    }
    window.addEventListener(SAVE_LINK_DONE_EVENT, onDone)
    return () => window.removeEventListener(SAVE_LINK_DONE_EVENT, onDone)
  }, [id])

  useEffect(() => {
    if (preview.fetchedAt && !stale) return
    let cancelled = false
    void window.api.fetchLinkPreview(stored.url).then((p) => {
      if (cancelled) return
      setPreview(p)
      void window.api.updateObjects([{ id, data: { ...data.object.data, ...p } }])
    }).catch(() => {
      if (!cancelled) setPreview((p) => ({ ...p, fetchedAt: Date.now() }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored.url])

  const domain = (() => {
    try {
      return new URL(stored.url).hostname.replace(/^www\./, '')
    } catch {
      return stored.url
    }
  })()

  return (
    <>
      <Resizer selected={selected} minWidth={220} minHeight={140} />
      <div
        className={cn(
          'group relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow',
          selected && 'ring-2 ring-brand/70'
        )}
        onDoubleClick={() => window.open(stored.url, '_blank')}
      >
        <button
          className="nodrag absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md bg-card/90 px-2 py-1 text-[11px] font-medium text-muted-foreground opacity-0 shadow transition group-hover:opacity-100 hover:bg-accent hover:text-foreground disabled:opacity-60"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation()
            setSaving(true)
            window.dispatchEvent(new CustomEvent(SAVE_LINK_EVENT, { detail: { nodeId: id, url: stored.url } }))
          }}
        >
          <Bookmark className="size-3.5" /> {saving ? t('link.saving') : t('link.saveAsCard')}
        </button>

        {loading ? (
          <div className="flex flex-1 flex-col gap-2 p-3">
            <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            {preview.image && (
              <div className="h-[45%] min-h-0 w-full overflow-hidden bg-muted">
                <img src={preview.image} alt="" draggable={false} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {preview.favicon ? (
                  <img src={preview.favicon} alt="" className="size-3.5 rounded-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <Globe className="size-3.5" />
                )}
                <span className="truncate">{preview.siteName || domain}</span>
              </div>
              <div className="line-clamp-2 text-[14px] leading-snug font-semibold tracking-tight">{preview.title || stored.url}</div>
              {preview.description && <p className="line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">{preview.description}</p>}
            </div>
          </>
        )}
      </div>
      <Handles />
    </>
  )
})
