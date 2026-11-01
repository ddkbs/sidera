import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Tablet } from '@/components/icons'
import { t } from '@/lib/i18n'
import { useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { openSettings } from '@/store/ui'
import { PairIpadDialog } from './PairIpadDialog'
import { setIpadStatus, useIpadStatus } from './status'

/** Window event (sidebar row, command palette) → switch the iPad connection on, or manage it when it is on. */
export const IPAD_OPEN_EVENT = 'sidera:ipad-open'

/** Switches the iPad connection on; the first time (no iPad paired yet) the pairing QR follows. */
export async function startIpad(onPair: () => void): Promise<void> {
  const res = await window.ipad.start()
  if (!res.ok) return void toast.error(t('ipad.startFailed'), { description: res.message })
  setIpadStatus(res.status)
  if (!res.status.devices.length) onPair()
  else toast.success(t('ipad.onToast'), { description: t('ipad.onToastHint') })
}

/**
 * App-wide iPad control (mounted once in the shell): the shortcut / palette / sidebar row switch the connection on,
 * or open Settings → iPad while it is on. Owns the pairing dialog.
 */
export function IpadControl() {
  const dispatch = useAppDispatch()
  const status = useIpadStatus()
  const [pairOpen, setPairOpen] = useState(false)

  useEffect(() => {
    const on = (): void => {
      if (status.enabled && status.running) dispatch(openSettings('ipad'))
      else void startIpad(() => setPairOpen(true))
    }
    window.addEventListener(IPAD_OPEN_EVENT, on)
    return () => window.removeEventListener(IPAD_OPEN_EVENT, on)
  }, [dispatch, status.enabled, status.running])
  useCommands({ 'canvas.ipad': () => void window.dispatchEvent(new Event(IPAD_OPEN_EVENT)) })

  return <PairIpadDialog open={pairOpen} onOpenChange={setPairOpen} />
}

/** Sidebar row: "iPad" with its state (off / on / an iPad connected and which board it has open). */
export function IpadNavItem() {
  const status = useIpadStatus()
  const live = status.running && status.connected.length > 0
  const open = status.connected.find((c) => c.board)?.board
  const hint = !status.enabled ? t('ipad.navOff') : !status.running ? t('ipad.navError') : live ? (open ? open.name : t('ipad.navConnected')) : t('ipad.navOn')
  return (
    <button
      data-tour="nav-ipad"
      title={live ? t('ipad.tipLive', { names: status.connected.map((c) => c.name).join(', ') }) : undefined}
      onClick={() => window.dispatchEvent(new Event(IPAD_OPEN_EVENT))}
      className="flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent"
    >
      <span className="shrink-0 text-muted-foreground">
        <Tablet className="size-4" />
      </span>
      <span className="truncate">iPad</span>
      <span className="ml-auto flex min-w-0 items-center gap-1.5 pr-0.5 text-[11px] text-muted-foreground">
        <span className="truncate">{hint}</span>
        {status.enabled && (
          <span className={cn('size-1.5 shrink-0 rounded-full', live ? 'bg-emerald-500 shadow-[0_0_6px_rgb(16_185_129)]' : status.running ? 'bg-muted-foreground/50' : 'bg-amber-500')} />
        )}
      </span>
    </button>
  )
}
