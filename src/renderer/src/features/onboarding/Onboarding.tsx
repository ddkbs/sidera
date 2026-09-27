import { AnimatePresence } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store'
import { updateSettings } from '@/store/settings'
import { onboarding, useOnboardingMode } from './controller'
import { Tour } from './Tour'
import { Welcome } from './Welcome'

/**
 * Onboarding layer: welcome slides on first launch (until `settings.onboarding.welcomeSeen`), then an
 * optional spotlight tour. Both can be replayed via `onboarding.showWelcome()` / `onboarding.startTour()`.
 */
export function Onboarding() {
  const dispatch = useAppDispatch()
  const mode = useOnboardingMode()
  const welcomeSeen = useAppSelector((s) => s.settings.onboarding.welcomeSeen)
  const autoShown = useRef(false)

  // Settings are loaded before the first render, so this never flashes for returning users.
  useLayoutEffect(() => {
    if (welcomeSeen || autoShown.current) return
    autoShown.current = true
    onboarding.showWelcome()
  }, [welcomeSeen])

  const welcomeDone = (next: 'tour' | 'explore'): void => {
    void dispatch(updateSettings({ onboarding: { welcomeSeen: true } }))
    if (next === 'tour') onboarding.startTour()
    else onboarding.close()
  }

  const tourDone = (completed: boolean): void => {
    if (completed) void dispatch(updateSettings({ onboarding: { tourCompletedAt: Date.now() } }))
    onboarding.close()
  }

  return (
    <AnimatePresence>
      {mode === 'welcome' && <Welcome key="welcome" onDone={welcomeDone} />}
      {mode === 'tour' && <Tour key="tour" onClose={tourDone} />}
    </AnimatePresence>
  )
}
