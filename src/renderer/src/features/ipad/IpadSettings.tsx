import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import { APP_NAME } from '@shared/brand'
import { Lock, Tablet } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PairIpadDialog } from './PairIpadDialog'
import { useIpadStatus } from './status'
import { dateLocale, t } from '@/lib/i18n'

/** Settings → iPad: connection state and the paired devices (revocable). */
export function IpadSettings() {
  const status = useIpadStatus()
  const [pairOpen, setPairOpen] = useState(false)
  const online = new Set(status.connected.map((c) => c.id))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('ipad.settingsIntro', { app: APP_NAME })}</p>
      <section className="rounded-xl border p-4 text-sm">
        {status.running ? (
          <>
            <div className="font-medium">{status.board ? t('ipad.sharing', { name: status.board.name }) : t('ipad.ready')}</div>
            <div className="mt-0.5 text-muted-foreground">
              {status.origin} · {status.connected.length ? t('ipad.connectedCount', { count: status.connected.length }) : t('ipad.noneConnected')}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPairOpen(true)}>
                {t('ipad.pairEllipsis')}
              </Button>
              {status.board && (
                <Button size="sm" variant="ghost" onClick={() => void window.ipad.stop()}>
                  {t('ipad.stop')}
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">{t('ipad.off')}</div>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-medium">{t('ipad.devices')}</h3>
        {status.devices.length === 0 && <p className="text-sm text-muted-foreground">{t('ipad.noDevices')}</p>}
        <div className="divide-y rounded-xl border">
          {status.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Tablet className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {d.name}
                  {online.has(d.id) && <span className="size-2 rounded-full bg-emerald-500" title={t('settings.ai.connected')} />}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('ipad.paired', { time: formatDistanceToNow(d.createdAt, { addSuffix: true, locale: dateLocale() }) })}
                  {d.lastSeenAt ? ` · ${t('ipad.lastSeen', { time: formatDistanceToNow(d.lastSeenAt, { addSuffix: true, locale: dateLocale() }) })}` : ''}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await window.ipad.revokeDevice(d.id)
                  toast.success(t('ipad.removed', { name: d.name }), { description: t('ipad.removedHint') })
                }}
              >
                {t('ipad.revoke')}
              </Button>
            </div>
          ))}
        </div>
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" /> {t('ipad.privacy')}
      </p>
      <PairIpadDialog open={pairOpen} onOpenChange={setPairOpen} />
    </div>
  )
}
