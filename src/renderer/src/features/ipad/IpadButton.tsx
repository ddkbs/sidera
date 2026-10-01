import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { APP_NAME } from '@shared/brand'
import { QrCode, Tablet } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { PairIpadDialog } from './PairIpadDialog'
import { setIpadStatus, useIpadStatus } from './status'
import { t } from '@/lib/i18n'

/** Window event (command palette) → toggle the iPad for the board on screen. */
export const IPAD_TOGGLE_EVENT = 'sidera:ipad-toggle'

const BUTTON = 'flex h-9 items-center gap-2 rounded-xl border bg-popover/95 px-3 text-sm shadow-lg backdrop-blur transition hover:bg-accent'

/**
 * Board corner button (next to "Cards"): shows this whiteboard live on the paired iPad(s), or stops sharing (the iPad
 * then waits; the server keeps running while devices are paired, so the home-screen app always opens).
 * Pressed on another board while running, it moves the iPad to this board. The first time, it opens the pairing QR.
 */
export function IpadButton({ boardId }: { boardId: string }) {
  const status = useIpadStatus()
  const [pairOpen, setPairOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const sharing = !!status.board
  const here = sharing && status.board?.id === boardId
  const connected = status.connected.length > 0

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      if (here) {
        await window.ipad.stop()
        return
      }
      const res = await window.ipad.share(boardId)
      if (!res.ok) return void toast.error(t('ipad.startFailed'), { description: res.message })
      setIpadStatus(res.status)
      if (!res.status.devices.length) setPairOpen(true)
    } finally {
      setBusy(false)
    }
  }, [boardId, busy, here])

  useEffect(() => {
    const on = () => void toggle()
    window.addEventListener(IPAD_TOGGLE_EVENT, on)
    return () => window.removeEventListener(IPAD_TOGGLE_EVENT, on)
  }, [toggle])
  useCommands({ 'canvas.ipad': () => void toggle() })

  const label = !here ? (sharing ? t('ipad.showOn') : 'iPad') : connected ? t('ipad.live') : t('ipad.waiting')
  const tip = !here
    ? sharing
      ? t('ipad.tipOther', { name: status.board?.name ?? '' })
      : status.devices.length
        ? t('ipad.tipShow')
        : t('ipad.tipPair')
    : connected
      ? t('ipad.tipLive', { names: status.connected.map((c) => c.name).join(', ') })
      : t('ipad.tipOpen', { app: APP_NAME })

  return (
    <div className="absolute top-3 right-[108px] z-10 flex items-center gap-2" data-tour="canvas-ipad">
      {here && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label={t('ipad.pair')} onClick={() => setPairOpen(true)} className={cn(BUTTON, 'w-9 justify-center px-0')}>
              <QrCode className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('ipad.pairAnother')}</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => void toggle()} disabled={busy} className={cn(BUTTON, here && 'bg-accent')} aria-pressed={here}>
            <Tablet className="size-4" />
            {label}
            {here && <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500')} />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
      <PairIpadDialog open={pairOpen} onOpenChange={setPairOpen} />
    </div>
  )
}
