import { ThinkingOrb } from 'thinking-orbs'
import { LayoutDashboard, Text } from '@/components/icons'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { formatDate, t } from '@/lib/i18n'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateCardMutation, useCreateWhiteboardMutation, useGetBoardPreviewsQuery, useListWhiteboardsWithStatsQuery } from '@/store/api'
import { navigate, openCard, setChatOpen } from '@/store/ui'
import type { BoardPreview as Preview, WhiteboardSummary } from '@shared/types'
import { BoardPreview } from './BoardPreview'

export function HomeView() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)
  const { data: boards = [] } = useListWhiteboardsWithStatsQuery()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [createCard] = useCreateCardMutation()
  const recent = boards.slice(0, 9)
  const { data: previews = [] } = useGetBoardPreviewsQuery(recent.map((b) => b.id), { skip: !recent.length })
  const previewById = new Map(previews.map((p) => [p.id, p]))

  const newBoard = async () => {
    const r = await createWhiteboard({ name: t('board.untitled') })
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
            title={t('sidebar.askAi')}
            aria-label={t('sidebar.askAi')}
          >
            {/* Explicit theme: relying on "auto" ancestor-class detection can pick up the OS's
                prefers-color-scheme instead of our resolved app theme when they disagree,
                rendering the dark palette (light ink) on a light background. */}
            <ThinkingOrb state="connecting" size={64} theme={theme} />
          </button>
          <div className="min-w-0">
            <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">
              {greeting()}
            </motion.h1>
            <p className="mt-1 text-muted-foreground">{t('home.tagline')}</p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button size="lg" className="gap-2 shadow-sm" onClick={() => void newBoard()}>
            <LayoutDashboard className="size-4" />
            {t('home.newBoard')}
          </Button>
          <button
            onClick={() => void quickNote()}
            className="flex h-10 items-center gap-2 rounded-md border bg-card px-3.5 text-sm font-medium text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground hover:shadow-md"
          >
            <Text className="size-4" />
            {t('home.quickNote')}
          </button>
        </div>

        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('home.recent')}</h2>
          </div>
          {boards.length === 0 ? (
            <button
              onClick={() => void newBoard()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-14 text-center text-sm text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
            >
              <LayoutDashboard className="size-6" />
              {t('home.empty')}
            </button>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {recent.map((b) => (
                <BoardTile key={b.id} board={b} preview={previewById.get(b.id)} dark={theme === 'dark'} onOpen={() => dispatch(navigate({ type: 'whiteboard', id: b.id }))} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function BoardTile({ board, preview, dark, onOpen }: { board: WhiteboardSummary; preview: Preview | undefined; dark: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group relative flex h-52 flex-col justify-end overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="absolute inset-x-0 top-0 bottom-[3.75rem] overflow-hidden border-b bg-muted/40">
        <div
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '12px 12px' }}
        />
        <div className="absolute inset-2 transition duration-300 group-hover:scale-[1.03]">
          <BoardPreview preview={preview} dark={dark} />
        </div>
      </div>
      <div className="relative flex h-[3.75rem] flex-col justify-center gap-0.5 px-4">
        <div className="truncate text-sm font-medium">{board.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('home.objects', { count: board.objectCount })}</span>
          <span aria-hidden>·</span>
          <span>{t('home.edited', { time: relativeTime(board.updatedAt) })}</span>
        </div>
      </div>
    </button>
  )
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? t('home.morning') : h < 18 ? t('home.afternoon') : t('home.evening')
}

/** Short relative time for board tiles ("just now", "2h ago", "3d ago"), falling back to a date. */
function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('time.justNow')
  if (min < 60) return t('time.minAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('time.hAgo', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 7) return t('time.dAgo', { n: day })
  return formatDate(ms)
}
