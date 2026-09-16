import { useEffect, useRef, useState } from 'react'
import { Check, Hash } from '@/components/icons'
import { markdownToDoc } from '@shared/doc'
import { todayISO } from '@shared/util'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppearance } from '@/lib/appearance'
import { useCreateCardMutation, useGetJournalQuery, useListTagsQuery, useUpdateCardMutation } from '@/store/api'

type Target = 'journal' | 'card'

const STORAGE_KEY = 'canvascl.captureTarget'

/** Minimal renderer shown in the frameless quick-capture window (hash route #capture). No sidebar/canvas. */
export function CaptureApp() {
  const theme = useAppearance()
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Target>(() => (localStorage.getItem(STORAGE_KEY) === 'card' ? 'card' : 'journal'))
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const today = todayISO()
  const { data: day } = useGetJournalQuery(today, { skip: target !== 'journal' })
  const { data: tags = [] } = useListTagsQuery()
  const [createCard] = useCreateCardMutation()
  const [updateCard] = useUpdateCardMutation()

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, target)
  }, [target])

  const close = (): void => void window.app.hideCapture()

  const save = async (): Promise<void> => {
    const value = text.trim()
    if (!value || busy) return close()
    setBusy(true)
    try {
      if (target === 'journal') {
        if (!day) return
        const next = markdownToDoc(value)
        await updateCard({ id: day.card.id, content: { ...day.card.content, content: [...(day.card.content.content ?? []), ...(next.content ?? [])] } })
      } else {
        const [first, ...rest] = value.split('\n')
        await createCard({ title: first.trim(), markdown: rest.join('\n').trim(), tagIds })
      }
      setSaved(true)
      setTimeout(() => {
        setText('')
        setTagIds([])
        setSaved(false)
        setBusy(false)
        close()
      }, 500)
    } catch {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, target, day, tagIds, busy])

  return (
    <div className={cn('h-screen w-screen p-2', theme)}>
      <div className="flex h-full w-full flex-col rounded-2xl border bg-popover/95 p-3 text-popover-foreground shadow-2xl backdrop-blur-xl">
        {saved ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Check className="size-6 text-emerald-500" />
            Saved
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={target === 'journal' ? "Add to today's journal…" : 'New card — first line is the title…'}
              className="min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            {target === 'card' && (
              <div className="mb-2 flex flex-wrap items-center gap-1">
                {tags.map((t) => {
                  const active = tagIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTagIds((ids) => (active ? ids.filter((id) => id !== t.id) : [...ids, t.id]))}
                      style={active ? { color: color(t.color).fg, backgroundColor: color(t.color).bg, borderColor: color(t.color).border } : undefined}
                      className={cn(
                        'flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition',
                        active ? '' : 'border-transparent text-muted-foreground hover:bg-accent'
                      )}
                    >
                      <Hash className="size-3" />
                      {t.name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex items-center justify-between border-t pt-2">
              <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                <button
                  onClick={() => setTarget('journal')}
                  className={cn('h-6 rounded-md px-2.5 transition', target === 'journal' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  Journal (today)
                </button>
                <button
                  onClick={() => setTarget('card')}
                  className={cn('h-6 rounded-md px-2.5 transition', target === 'card' ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  New card
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">↩ newline · ⌘↩ save · esc close</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
