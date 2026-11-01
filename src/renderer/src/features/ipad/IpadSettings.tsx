import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import { toast } from 'sonner'
import { APP_NAME } from '@shared/brand'
import { Lock, Tablet } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { startIpad } from './IpadControl'
import { PairIpadDialog } from './PairIpadDialog'
import { useIpadStatus } from './status'
import { dateLocale, t } from '@/lib/i18n'

/** Settings → iPad: connection state and the paired devices (revocable). */
export function IpadSettings() {
  const status = useIpadStatus()
  const [pairOpen, setPairOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const online = new Set(status.connected.map((c) => c.id))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('ipad.settingsIntro', { app: APP_NAME })}</p>
      <section className="rounded-xl border p-4 text-sm">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t('ipad.enabled')}</div>
            <div className="mt-0.5 text-muted-foreground">{t('ipad.enabledHint', { app: APP_NAME })}</div>
          </div>
          <Switch
            checked={status.enabled}
            disabled={busy}
            onCheckedChange={async (on) => {
              setBusy(true)
              try {
                if (on) await startIpad(() => setPairOpen(true))
                else await window.ipad.stop()
              } finally {
                setBusy(false)
              }
            }}
          />
        </div>
        <div className="mt-3 border-t pt-3">
          {status.running ? (
            <>
              <div className="font-medium">{status.connected.length ? t('ipad.connectedCount', { count: status.connected.length }) : t('ipad.ready')}</div>
              <div className="mt-0.5 text-muted-foreground">{status.origin}</div>
              {status.connected.map((c) => (
                <div key={c.id} className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  {c.board ? t('ipad.onBoard', { name: c.name, board: c.board.name }) : t('ipad.onList', { name: c.name })}
                </div>
              ))}
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setPairOpen(true)}>
                {t('ipad.pairEllipsis')}
              </Button>
            </>
          ) : (
            <div className="text-muted-foreground">{t('ipad.off')}</div>
          )}
        </div>
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
