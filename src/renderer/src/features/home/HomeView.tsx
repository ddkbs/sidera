import { ArrowRight, BookOpen, CalendarDays, LayoutDashboard, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useAppDispatch } from '@/store'
import { useCreateCardMutation, useCreateWhiteboardMutation, useListCardsQuery, useListWhiteboardsQuery } from '@/store/api'
import { navigate, openCard } from '@/store/ui'

export function HomeView() {
  const dispatch = useAppDispatch()
  const { data: boards = [] } = useListWhiteboardsQuery()
  const { data: cards = [] } = useListCardsQuery({ limit: 8 })
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [createCard] = useCreateCardMutation()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-10 py-14">
        <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">
          Good {greeting()}.
        </motion.h1>
        <p className="mt-1 text-muted-foreground">Think visually. Your knowledge base is local, open and MCP-ready.</p>

        <div className="mt-8 grid grid-cols-3 gap-3">
          <QuickAction
            icon={<LayoutDashboard className="size-4" />}
            title="New whiteboard"
            onClick={async () => {
              const r = await createWhiteboard({ name: 'Untitled whiteboard' })
              if ('data' in r && r.data) dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
            }}
          />
          <QuickAction
            icon={<Plus className="size-4" />}
            title="New card"
            onClick={async () => {
              const r = await createCard({})
              if ('data' in r && r.data) dispatch(openCard(r.data.id))
            }}
          />
          <QuickAction icon={<CalendarDays className="size-4" />} title="Today's journal" onClick={() => dispatch(navigate({ type: 'journal' }))} />
        </div>

        <Section title="Whiteboards" onMore={boards.length ? undefined : undefined}>
          {boards.length === 0 ? (
            <Empty>No whiteboards yet — create one to start mapping ideas.</Empty>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {boards.slice(0, 9).map((b) => (
                <button
                  key={b.id}
                  onClick={() => dispatch(navigate({ type: 'whiteboard', id: b.id }))}
                  className="group relative h-28 overflow-hidden rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
                  <div className="relative flex h-full flex-col justify-end">
                    <div className="truncate font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground">Edited {new Date(b.updatedAt).toLocaleDateString()}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Recent cards" onMore={() => dispatch(navigate({ type: 'library', tagId: null, mode: 'list' }))}>
          {cards.length === 0 ? (
            <Empty>Cards you create show up here.</Empty>
          ) : (
            <div className="divide-y rounded-xl border bg-card">
              {cards.map((c) => (
                <button key={c.id} onClick={() => dispatch(openCard(c.id))} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition first:rounded-t-xl last:rounded-b-xl hover:bg-accent">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{c.title || 'Untitled'}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.excerpt.slice(0, 80)}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{new Date(c.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

function QuickAction({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-md">
      <span className="grid size-8 place-items-center rounded-lg bg-secondary">{icon}</span>
      {title}
    </button>
  )
}

function Section({ title, onMore, children }: { title: string; onMore?: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {onMore && (
          <Button variant="ghost" size="sm" onClick={onMore} className="text-muted-foreground">
            View all <ArrowRight />
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>
)
