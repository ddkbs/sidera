import { useEffect } from 'react'
import type { FontPref } from '@shared/settings'
import { useAppDispatch, useAppSelector } from '@/store'
import { setResolvedTheme } from '@/store/ui'

export const FONT_STACKS: Record<FontPref, string> = {
  geist: "'Geist'",
  system: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display'"
}

/** Resolves theme (from preference + OS appearance) and applies font CSS vars to the document. */
export function useAppearance(): 'light' | 'dark' {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((s) => s.ui.theme)
  const { theme: themePref, font, fontSize } = useAppSelector((s) => s.settings)

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

  return theme
}
