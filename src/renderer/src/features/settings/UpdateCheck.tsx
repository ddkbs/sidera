import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { t } from '@/lib/i18n'
import { useAppSelector } from '@/store'

/** Once per launch: if enabled, look for a newer GitHub release and offer the download. */
export function UpdateCheck() {
  const enabled = useAppSelector((s) => s.settings.updates.check)
  const done = useRef(false)
  useEffect(() => {
    if (!enabled || done.current) return
    done.current = true
    const timer = setTimeout(() => {
      void window.app.checkForUpdate().then((u) => {
        if (!u) return
        toast(t('update.available', { version: u.version }), {
          description: t('update.hint'),
          duration: 15000,
          action: { label: t('update.download'), onClick: () => window.open(u.url, '_blank') }
        })
      })
    }, 5000)
    return () => clearTimeout(timer)
  }, [enabled])
  return null
}
