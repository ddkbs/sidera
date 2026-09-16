import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { todayISO } from '@shared/util'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CardEditor } from '@/features/card/CardEditor'
import { useGetJournalQuery, useListJournalQuery, useUpdateCardMutation } from '@/store/api'

const shift = (date: string, days: number) => {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return todayISO(d)
}

const pretty = (date: string) =>
  new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

export function JournalView() {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const { data: day, isFetching } = useGetJournalQuery(date)
  const { data: past = [] } = useListJournalQuery(60)
  const [update] = useUpdateCardMutation()

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-10 py-12">
          <div className="mb-6 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{date === today ? 'Today' : 'Journal'}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{pretty(date)}</h1>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setDate(shift(date, -1))} aria-label="Previous day">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDate(today)} disabled={date === today}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDate(shift(date, 1))} aria-label="Next day">
              <ChevronRight />
            </Button>
          </div>
          {!day || (isFetching && day.date !== date) ? (
            <Skeleton className="h-40" />
          ) : (
            <CardEditor
              key={day.card.id}
              content={day.card.content}
              autofocus
              placeholder="What's on your mind today? Type @ to link cards…"
              onChange={(content) => update({ id: day.card.id, content })}
            />
          )}
        </div>
      </div>
      <aside className="w-56 shrink-0 overflow-y-auto border-l px-3 py-12">
        <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Entries</p>
        {past.filter((p) => p.card.contentText.trim() || p.date === date).map((p) => (
          <button
            key={p.date}
            onClick={() => setDate(p.date)}
            className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent ${p.date === date ? 'bg-accent font-medium' : ''}`}
          >
            <span>{new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' })}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{p.card.contentText.slice(0, 40)}</span>
          </button>
        ))}
      </aside>
    </div>
  )
}
