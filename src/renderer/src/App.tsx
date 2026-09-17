import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { api, scopeTags } from '@/store/api'
import { useAppDispatch } from '@/store'
import { openSettings, pushActivity } from '@/store/ui'
import { settingsLoaded } from '@/store/settings'
import { useAppearance } from '@/lib/appearance'

export { FONT_STACKS } from '@/lib/appearance'

export function App() {
  const dispatch = useAppDispatch()
  const theme = useAppearance()

  useEffect(() => window.app.onSettingsChanged((s) => dispatch(settingsLoaded(s))), [dispatch])

  // External writes (MCP) → refresh caches
  useEffect(
    () =>
      window.events.onDbChanged((scopes) => {
        dispatch(api.util.invalidateTags([...new Set(scopes.flatMap((s) => scopeTags[s]))]))
      }),
    [dispatch]
  )

  useEffect(() => window.events.onMcpActivity((a) => dispatch(pushActivity(a))), [dispatch])
  useEffect(() => window.events.onOpenSettings(() => dispatch(openSettings(undefined))), [dispatch])

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <Toaster theme={theme} position="bottom-center" />
    </TooltipProvider>
  )
}
