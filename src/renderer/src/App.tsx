import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { api, scopeTags } from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store'
import { pushActivity, setResolvedTheme } from '@/store/ui'
import { settingsLoaded } from '@/store/settings'
import type { FontPref } from '@shared/settings'

export const FONT_STACKS: Record<FontPref, string> = {
  jost: "'Jost Variable'",
  futura: "'Futura', 'Jost Variable'",
  geist: "'Geist Variable'",
  system: '-apple-system, BlinkMacSystemFont'
}

export function App() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)
  const { theme: themePref, font, fontSize } = useAppSelector((s) => s.settings)

  // Resolve light/dark from preference + OS appearance
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => dispatch(setResolvedTheme(themePref === 'system' ? (mq.matches ? 'dark' : 'light') : themePref))
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themePref, dispatch])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--app-font', FONT_STACKS[font])
    root.setProperty('--app-font-size', `${fontSize}px`)
  }, [font, fontSize])

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

  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <Toaster theme={theme} position="bottom-center" />
    </TooltipProvider>
  )
}
