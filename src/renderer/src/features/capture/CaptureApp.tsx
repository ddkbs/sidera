import { useEffect, useRef, useState } from 'react'
import { Check, Hash } from '@/components/icons'
import { color } from '@/lib/colors'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppearance } from '@/lib/appearance'
import { useCreateCardMutation, useListTagsQuery } from '@/store/api'

/** Minimal renderer shown in the frameless quick-capture window (hash route #capture). No sidebar/canvas. Always creates a new card. */
export function CaptureApp() {
  const theme = useAppearance()
  const [text, setText] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: tags = [] } = useListTagsQuery()
  const [createCard] = useCreateCardMutation()

  useEffect(() => {
    // the panel is hidden, not destroyed — refocus the textarea every time it is shown again
    const focus = (): void => textareaRef.current?.focus()
    focus()
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [])

  const close = (): void => void window.app.hideCapture()

  const save = async (): Promise<void> => {
    const value = text.trim()
    if (!value || busy) return close()
    setBusy(true)
    try {
      const [first, ...rest] = value.split('\n')
      await createCard({ title: first.trim(), markdown: rest.join('\n').trim(), tagIds })
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
  }, [text, tagIds, busy])

  return (
    <div className={cn('h-screen w-screen p-2', theme)}>
      <div className="flex h-full w-full flex-col rounded-2xl border bg-popover/95 p-3 text-popover-foreground shadow-2xl backdrop-blur-xl">
        {saved ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Check className="size-6 text-emerald-500" />
            {t('capture.saved')}
          </div>
        ) : (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('capture.placeholder')}
              className="min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <div className="mb-2 flex flex-wrap items-center gap-1">
              {tags.map((tag) => {
                const active = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    onClick={() => setTagIds((ids) => (active ? ids.filter((id) => id !== tag.id) : [...ids, tag.id]))}
                    style={active ? { color: color(tag.color).fg, backgroundColor: color(tag.color).bg, borderColor: color(tag.color).border } : undefined}
                    className={cn(
                      'flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition',
                      active ? '' : 'border-transparent text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <Hash className="size-3" />
                    {tag.name}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center justify-end border-t pt-2">
              <p className="text-[11px] text-muted-foreground">{t('capture.hint')}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
