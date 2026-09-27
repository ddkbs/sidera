import { useSyncExternalStore } from 'react'

/** What the onboarding layer is currently showing. Only one of them at a time. */
export type OnboardingMode = 'welcome' | 'tour' | null

let mode: OnboardingMode = null
const listeners = new Set<() => void>()

function set(next: OnboardingMode): void {
  if (next === mode) return
  mode = next
  for (const l of listeners) l()
}

/** Start the welcome slides or the spotlight tour from anywhere (menus, palette, settings). */
export const onboarding = {
  showWelcome: (): void => set('welcome'),
  startTour: (): void => set('tour'),
  close: (): void => set(null),
  get mode(): OnboardingMode {
    return mode
  }
}

export function useOnboardingMode(): OnboardingMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => mode
  )
}
