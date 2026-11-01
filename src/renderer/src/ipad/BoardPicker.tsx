import { useMemo, useState } from 'react'
import type { BoardPreview as Preview, WhiteboardSummary } from '@shared/types'
import { Logo } from '@/components/Logo'
import { Search, WifiOff } from '@/components/icons'
import { BoardPreview } from '@/features/home/BoardPreview'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { useGetBoardPreviewsQuery, useListWhiteboardsWithStatsQuery } from '@/store/api'
import type { ConnectionState } from './client'

/**
 * Sidera for iPad's start screen: every whiteboard of the Mac as a tile (live preview, most recently edited first),
 * with a search. Tapping a tile opens it.
 */
export function BoardPicker({ conn, host, onOpen }: { conn: ConnectionState; host: string; onOpen: (id: string) => void }) {
  const dark = useAppSelector((s) => s.ui.theme) === 'dark'
  const { data: boards = [], isLoading } = useListWhiteboardsWithStatsQuery(undefined, { skip: conn !== 'connected' })
  const [q, setQ] = useState('')
  const sorted = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...boards].filter((b) => !needle || b.name.toLowerCase().includes(needle)).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [boards, q])
  const { data: previews = [] } = useGetBoardPreviewsQuery(
    sorted.map((b) => b.id),
    { skip: !sorted.length }
  )
  const byId = useMemo(() => new Map(previews.map((p) => [p.id, p])), [previews])
  const live = conn === 'connected'

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-background [touch-action:pan-y]">
      <div className="mx-auto max-w-6xl px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-16">
        <header className="flex items-center gap-3">
          <Logo className="size-7 text-foreground" />
          <span className="text-xl font-semibold tracking-[-0.02em]">Sidera</span>
          <div
            className={cn(
              'ml-auto flex h-8 items-center gap-2 rounded-full border px-3 font-mono text-[10.5px] uppercase tracking-[0.14em]',
              live ? 'border-foreground/10 text-muted-foreground' : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            )}
          >
            <span className={cn('size-1.5 rounded-full', live ? 'bg-emerald-500 shadow-[0_0_8px_rgb(16_185_129)]' : 'animate-pulse bg-amber-500')} />
            {live ? t('ipadApp.live') : conn === 'connecting' ? t('ipadApp.connecting') : t('ipadApp.reconnecting')}
            {live && host && <span className="normal-case tracking-normal text-muted-foreground/70">{`· ${host}`}</span>}
            {!live && <WifiOff className="size-3.5" />}
          </div>
        </header>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('ipadApp.allBoards')}</div>
            <h1 className="mt-1.5 text-[34px] leading-none font-semibold tracking-[-0.03em]">{t('ipadApp.boards')}</h1>
          </div>
          <label className="flex h-11 w-full max-w-xs items-center gap-2 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 text-muted-foreground focus-within:border-brand/50">
            <Search className="size-4 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ipadApp.searchBoards')}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
        <div className="mt-5 h-px bg-[linear-gradient(to_right,var(--border)_50%,transparent_50%)] bg-[length:8px_1px] bg-repeat-x" />

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {sorted.map((b) => (
            <Tile key={b.id} board={b} preview={byId.get(b.id)} dark={dark} onOpen={() => onOpen(b.id)} />
          ))}
        </div>
        {!isLoading && live && !sorted.length && (
          <p className="mt-16 text-center text-sm text-muted-foreground">{q.trim() ? t('ipadApp.noMatch', { q: q.trim() }) : t('ipadApp.noBoards')}</p>
        )}
      </div>
    </div>
  )
}

function Tile({ board, preview, dark, onOpen }: { board: WhiteboardSummary; preview: Preview | undefined; dark: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card text-left shadow-[0_1px_0_0_rgb(255_255_255/0.04)_inset] transition active:scale-[0.98]"
    >
      <div className="relative aspect-[16/10] overflow-hidden border-b border-foreground/10 bg-muted/40">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
        <div className="absolute inset-3">
          <BoardPreview preview={preview} dark={dark} />
        </div>
      </div>
      <div className="flex flex-col gap-1 px-4 py-3">
        <div className="truncate text-[15px] font-medium">{board.name}</div>
        <div className="font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
          {t('home.objects', { count: board.objectCount })} · {new Date(board.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </div>
      </div>
    </button>
  )
}
