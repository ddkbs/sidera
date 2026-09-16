import { useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { AppShell } from '@/components/layout/AppShell'
import { api, scopeTags } from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store'
import { pushActivity } from '@/store/ui'

export function App() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

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
