import { useState } from 'react'
import type { PdfHighlight } from '@shared/types'
import { Highlighter, Trash2 } from '@/components/icons'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { fillOf, quoteOf } from './highlight'

/** All highlights of the open document, newest page order, draggable onto the board. */
export function HighlightList({
  highlights,
  activeId,
  onPick,
  onNote,
  onRemove,
  onDrag
}: {
  highlights: PdfHighlight[]
  activeId: string | null
  onPick: (h: PdfHighlight) => void
  onNote: (h: PdfHighlight, note: string) => void
  onRemove: (h: PdfHighlight) => void
  onDrag: (h: PdfHighlight, e: React.DragEvent) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l bg-sidebar/60">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium text-muted-foreground">
        <Highlighter size={14} />
        {t('pdf.highlights')}
        <span className="ml-auto tabular-nums">{highlights.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {highlights.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('pdf.noHighlights')}</p>
        )}
        {highlights.map((h) => (
          <div
            key={h.id}
            draggable
            onDragStart={(e) => onDrag(h, e)}
            onClick={() => onPick(h)}
            className={cn(
              'group mb-1 cursor-grab rounded-md border border-transparent px-2 py-2 text-xs hover:bg-accent/60 active:cursor-grabbing',
              activeId === h.id && 'border-border bg-accent'
            )}
          >
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ background: fillOf(h.color) }} />
              <span>{t('pdf.page', { n: h.page })}</span>
              <button
                type="button"
                aria-label={t('pdf.removeHighlight')}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(h)
                }}
                className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <p className="mt-1 line-clamp-4 leading-snug">{quoteOf(h.text)}</p>
            {editing === h.id ? (
              <input
                autoFocus
                defaultValue={h.note ?? ''}
                placeholder={t('pdf.note')}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={(e) => {
                  setEditing(null)
                  onNote(h, e.target.value.trim())
                }}
                className="mt-1.5 w-full rounded border bg-background px-1.5 py-1 text-[11px] outline-none focus:ring-2 focus:ring-brand/40"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(h.id)
                }}
                className={cn('mt-1.5 block w-full truncate text-left text-[11px] italic', h.note ? 'text-foreground/80' : 'text-muted-foreground opacity-0 group-hover:opacity-100')}
              >
                {h.note || t('pdf.addNote')}
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
