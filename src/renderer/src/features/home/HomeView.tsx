import { ThinkingOrb } from 'thinking-orbs'
import { LayoutDashboard, Text } from '@/components/icons'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateCardMutation, useCreateWhiteboardMutation, useListWhiteboardsWithStatsQuery } from '@/store/api'
import { navigate, openCard, setChatOpen } from '@/store/ui'
import type { WhiteboardSummary } from '@shared/types'

export function HomeView() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)
  const { data: boards = [] } = useListWhiteboardsWithStatsQuery()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [createCard] = useCreateCardMutation()

  const newBoard = async () => {
    const r = await createWhiteboard({ name: 'Untitled whiteboard' })
    if ('data' in r && r.data) dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
  }
  const quickNote = async () => {
    const r = await createCard({})
    if ('data' in r && r.data) dispatch(openCard(r.data.id))
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-10 py-14">
        <div className="flex items-center gap-4">
          <button
            onClick={() => dispatch(setChatOpen(true))}
            className="shrink-0 rounded-full transition hover:scale-105"
            title="Ask AI"
            aria-label="Ask AI"
          >
            {/* Explicit theme: relying on "auto" ancestor-class detection can pick up the OS's
                prefers-color-scheme instead of our resolved app theme when they disagree,
                rendering the dark palette (light ink) on a light background. */}
            <ThinkingOrb state="connecting" size={64} theme={theme} />
          </button>
          <div className="min-w-0">
            <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">
              Good {greeting()}.
            </motion.h1>
            <p className="mt-1 text-muted-foreground">Fast, visual notes on whiteboards — local, open and MCP-ready.</p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button size="lg" className="gap-2 shadow-sm" onClick={() => void newBoard()}>
            <LayoutDashboard className="size-4" />
            New board
          </Button>
          <button
            onClick={() => void quickNote()}
            className="flex h-10 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground hover:shadow-md"
          >
            <Text className="size-4" />
            Quick note
          </button>
        </div>

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent boards</h2>
          </div>
          {boards.length === 0 ? (
            <button
              onClick={() => void newBoard()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
            >
              <LayoutDashboard className="size-6" />
              No boards yet — create one to start mapping ideas.
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {boards.slice(0, 9).map((b) => (
                <BoardTile key={b.id} board={b} onOpen={() => dispatch(navigate({ type: 'whiteboard', id: b.id }))} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BoardTile({ board, onOpen }: { board: WhiteboardSummary; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group relative flex h-40 flex-col justify-end overflow-hidden rounded-xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="absolute inset-0 opacity-50 transition group-hover:opacity-70"
        style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
      />
      <div className="relative flex flex-col gap-0.5">
        <div className="truncate font-medium">{board.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{board.objectCount} {board.objectCount === 1 ? 'object' : 'objects'}</span>
          <span aria-hidden>·</span>
          <span>Edited {relativeTime(board.updatedAt)}</span>
        </div>
      </div>
    </button>
  )
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

/** Short relative time for board tiles ("just now", "2h ago", "3d ago"), falling back to a date. */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ms).toLocaleDateString()
}
