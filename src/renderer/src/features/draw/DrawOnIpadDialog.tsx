import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Lock, Tablet, WifiOff } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { APP_NAME } from '@shared/brand'
import type { DrawInterface } from '@shared/draw'
import type { DrawSubmission } from '@shared/drawProtocol'

/** Dispatch on window to open the dialog on the active whiteboard (command palette). */
export const SIDERA_DRAW_OPEN_EVENT = 'sidera:draw-on-ipad'

type Phase =
  | { kind: 'starting' }
  | { kind: 'waiting' | 'connected' | 'disconnected'; sessionId: string; url: string; qrSvg: string; address: string; interfaces: DrawInterface[] }
  | { kind: 'ended'; title: string; message: string; network?: boolean }

const ENDED: Record<string, { title: string; message: string }> = {
  'pairing-timeout': { title: 'Code expired', message: 'Nobody scanned the code for 3 minutes, so the connection was closed.' },
  'heartbeat-timeout': { title: 'iPad disconnected', message: 'The iPad stopped responding for a minute, so the connection was closed.' },
  'time-limit': { title: 'Session timed out', message: 'Drawing sessions close automatically after 30 minutes.' },
  'auth-failures': { title: 'Connection closed', message: 'Closed after several invalid messages. Scan a new code to continue.' },
  'device-left': { title: 'Session ended on the iPad', message: 'The drawing was not sent.' }
}

interface Props {
  open: boolean
  whiteboardId: string
  onOpenChange: (open: boolean) => void
  /** insert the drawing on the board (the dialog closes afterwards) */
  onReceived: (drawing: DrawSubmission) => Promise<void>
}

/** "Draw on iPad": shows a QR code for the Sidera Draw companion and waits for the drawing to arrive. */
export function DrawOnIpadDialog({ open, whiteboardId, onOpenChange, onReceived }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const session = useRef<string | null>(null)
  const received = useRef(onReceived)
  received.current = onReceived
  const close = useRef(onOpenChange)
  close.current = onOpenChange

  const start = useCallback(
    async (address?: string) => {
      session.current = null
      setPhase({ kind: 'starting' })
      const res = await window.draw.start(whiteboardId, address)
      if (!res.ok) {
        setPhase({ kind: 'ended', title: res.error === 'no-network' ? 'No local network' : 'Could not start', message: res.message, network: res.error === 'no-network' })
        return
      }
      session.current = res.sessionId
      setPhase({ kind: 'waiting', sessionId: res.sessionId, url: res.url, qrSvg: res.qrSvg, address: res.address, interfaces: res.interfaces })
    },
    [whiteboardId]
  )

  useEffect(() => {
    if (!open) return
    const off = window.draw.onEvent((e) => {
      if (e.sessionId !== session.current) return
      if (e.type === 'received') {
        session.current = null
        void received.current(e.drawing).finally(() => close.current(false))
        return
      }
      if (e.state === 'connected' || e.state === 'disconnected' || e.state === 'waiting')
        setPhase((p) => ('sessionId' in p && p.sessionId === e.sessionId ? { ...p, kind: e.state as 'connected' } : p))
      else if (e.state === 'closed' && e.reason && ENDED[e.reason]) {
        session.current = null
        setPhase({ kind: 'ended', ...ENDED[e.reason] })
      }
    })
    void start()
    return () => {
      off()
      session.current = null
      void window.draw.cancel()
    }
  }, [open, start])

  const copy = (url: string): void => {
    void navigator.clipboard.writeText(url).then(() => toast('Link copied'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-[400px]">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mb-1 grid size-10 place-items-center rounded-xl border bg-muted/60">
            <Tablet className="size-5" />
          </div>
          <DialogTitle>Draw on iPad</DialogTitle>
          <DialogDescription>
            {phase.kind === 'connected' || phase.kind === 'disconnected'
              ? `Tap “Send to ${APP_NAME}” on the iPad when you’re done.`
              : `Scan with your iPad camera to open ${APP_NAME} Draw.`}
          </DialogDescription>
        </DialogHeader>

        <div className="relative grid min-h-[256px] place-items-center">
          <AnimatePresence mode="wait" initial={false}>
            {phase.kind === 'starting' && (
              <motion.div key="starting" {...fade} className="size-[232px] animate-pulse rounded-2xl border bg-muted/60" />
            )}
            {phase.kind === 'waiting' && (
              <motion.div key={`qr-${phase.sessionId}`} {...fade} className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border bg-white p-3 shadow-sm">
                  <img
                    alt="QR code for Sidera Draw"
                    draggable={false}
                    className="size-[208px] [image-rendering:pixelated]"
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(phase.qrSvg)}`}
                  />
                </div>
                <div className="flex max-w-[300px] items-center gap-1 text-xs text-muted-foreground">
                  <span data-draw-url className="truncate font-mono">
                    {phase.url}
                  </span>
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label="Copy link" onClick={() => copy(phase.url)}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </motion.div>
            )}
            {(phase.kind === 'connected' || phase.kind === 'disconnected') && (
              <motion.div key="connected" {...fade} className="flex flex-col items-center gap-4 text-center">
                <span className="relative grid size-16 place-items-center">
                  {phase.kind === 'connected' && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/25 [animation-duration:1.8s]" />}
                  <span className={cn('size-4 rounded-full', phase.kind === 'connected' ? 'bg-emerald-500' : 'bg-amber-500')} />
                </span>
                <div>
                  <p className="font-medium">{phase.kind === 'connected' ? 'Drawing on iPad…' : 'Waiting for the iPad…'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {phase.kind === 'connected' ? 'The sketch will appear on this whiteboard.' : 'The iPad lost the connection. Keep Safari open on the same Wi-Fi.'}
                  </p>
                </div>
              </motion.div>
            )}
            {phase.kind === 'ended' && (
              <motion.div key="ended" {...fade} className="flex max-w-[300px] flex-col items-center gap-3 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-muted">{phase.network ? <WifiOff className="size-5" /> : <Tablet className="size-5" />}</div>
                <div>
                  <p className="font-medium">{phase.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{phase.message}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void start()}>
                  New code
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {phase.kind === 'waiting' && phase.interfaces.length > 1 && (
          <Select value={phase.address} onValueChange={(a) => void start(a)}>
            <SelectTrigger size="sm" className="mx-auto w-[260px] text-xs" aria-label="Network">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {phase.interfaces.map((i) => (
                <SelectItem key={i.address} value={i.address} className="text-xs">
                  {i.label} · {i.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="space-y-1.5 rounded-xl bg-muted/50 px-3.5 py-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground/80">
            <Lock className="size-3.5" /> End-to-end encrypted · stays on your local network · closes automatically
          </p>
          <p>Your iPad must be on the same Wi-Fi. If macOS asks whether {APP_NAME} may accept incoming connections, choose Allow.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const fade = { initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 }, transition: { duration: 0.18 } }
