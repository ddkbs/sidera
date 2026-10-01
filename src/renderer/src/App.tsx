import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { api, scopeTags } from '@/store/api'
import { useAppDispatch } from '@/store'
import { openSettings, pushActivity, setFullscreen } from '@/store/ui'
import { settingsLoaded } from '@/store/settings'
import { useAppearance } from '@/lib/appearance'
import { useLang } from '@/lib/i18n'

export { FONT_STACKS } from '@/lib/appearance'

export function App() {
  const dispatch = useAppDispatch()
  const theme = useAppearance()
  // re-render the whole tree when the UI language changes (`t()` reads the current language)
  useLang()

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

  useEffect(() => {
    void window.app.isFullScreen().then((fullscreen) => dispatch(setFullscreen(fullscreen)))
    return window.events.onFullscreenChanged((fullscreen) => dispatch(setFullscreen(fullscreen)))
  }, [dispatch])

  // Dev-only: `window.__devSetFullscreen(bool)` simulates enter/leave-full-screen for devShot,
  // since real native fullscreen can't be triggered headlessly.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __devSetFullscreen?: (v: boolean) => void }).__devSetFullscreen = (v) => dispatch(setFullscreen(v))
  }, [dispatch])

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <Toaster theme={theme} position="bottom-center" />
    </TooltipProvider>
  )
}
