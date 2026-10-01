import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import { APP_NAME } from '@shared/brand'
import { Lock, Tablet } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PairIpadDialog } from './PairIpadDialog'
import { useIpadStatus } from './status'

/** Settings → iPad: connection state and the paired devices (revocable). */
export function IpadSettings() {
  const status = useIpadStatus()
  const [pairOpen, setPairOpen] = useState(false)
  const online = new Set(status.connected.map((c) => c.id))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {APP_NAME} for iPad shows a whiteboard live on your iPad — edit together, draw with Apple Pencil. Click the iPad button in a board’s top-right
        corner to start or stop it; the iPad follows the board where you clicked it last.
      </p>
      <section className="rounded-xl border p-4 text-sm">
        {status.running ? (
          <>
            <div className="font-medium">{status.board ? `Sharing “${status.board.name}”` : 'Ready — no whiteboard shared'}</div>
            <div className="mt-0.5 text-muted-foreground">
              {status.origin} · {status.connected.length ? `${status.connected.length} connected` : 'no iPad connected'}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPairOpen(true)}>
                Pair an iPad…
              </Button>
              {status.board && (
                <Button size="sm" variant="ghost" onClick={() => void window.ipad.stop()}>
                  Stop sharing
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">Off. To pair an iPad, click the iPad button on a whiteboard.</div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium">Paired devices</h3>
        {status.devices.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
        <div className="divide-y rounded-xl border">
          {status.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Tablet className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {d.name}
                  {online.has(d.id) && <span className="size-2 rounded-full bg-emerald-500" title="Connected" />}
                </div>
                <div className="text-xs text-muted-foreground">
                  Paired {formatDistanceToNow(d.createdAt, { addSuffix: true })}
                  {d.lastSeenAt ? ` · last seen ${formatDistanceToNow(d.lastSeenAt, { addSuffix: true })}` : ''}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await window.ipad.revokeDevice(d.id)
                  toast.success(`${d.name} removed`, { description: 'It can no longer connect. Pair it again with a new QR code.' })
                }}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> Only on your local network, end-to-end encrypted with a key per device. Only the shared whiteboard is visible to the
        iPad.
      </p>
      <PairIpadDialog open={pairOpen} onOpenChange={setPairOpen} />
    </div>
  )
}
