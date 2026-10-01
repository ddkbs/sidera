import { useSyncExternalStore } from 'react'
import { LOCALES, resolveLang, type Lang } from '@shared/i18n'
import { de } from './de'
import { en, type Message, type MessageKey } from './en'

export type { Lang } from '@shared/i18n'
export type { MessageKey } from './en'

/**
 * Lightweight typed i18n. English (`en.ts`) is the source dictionary; `de.ts` must provide every key
 * (missing or extra keys are type errors). Messages interpolate `{name}` placeholders; plural messages
 * are `{ one, other }` objects picked by `count` (which is also available as `{count}`).
 *
 *   t('home.title')                       → "Home"
 *   t('library.cardCount', { count: 3 })  → "3 cards"
 *
 * `t` reads the current language, so it works in plain modules too. Components re-render on a language
 * switch because `App` subscribes via `useLang()`; memoised components (canvas nodes) call `useT()`.
 */
const DICTS: Record<Lang, Record<MessageKey, Message>> = { en, de }

/** last chosen language, also used before sign-in (settings are per account) */
const LAST_LANG_KEY = 'sidera.lang'

let current: Lang = initialLang()
const listeners = new Set<() => void>()

function systemLocales(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]
}

function initialLang(): Lang {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(LAST_LANG_KEY)
  } catch {
    // no localStorage (tests)
  }
  return resolveLang(stored === 'de' || stored === 'en' ? stored : null, systemLocales())
}

/** Resolve a settings value (null = system language) to a concrete language. */
export const resolveUiLang = (pref: Lang | null | undefined): Lang => resolveLang(pref, systemLocales())

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  if (lang === current) return
  try {
    localStorage.setItem(LAST_LANG_KEY, lang)
  } catch {
    // no localStorage (tests)
  }
  current = lang
  for (const l of listeners) l()
}

/** BCP 47 locale of the current language, for `toLocale…String` / `Intl` formatters. */
export const locale = (): string => LOCALES[current]

export type Vars = Record<string, string | number>

/** Pure formatter (exported for tests): look up, pick the plural form, interpolate. */
export function format(lang: Lang, msg: Message, vars?: Vars): string {
  let text: string
  if (typeof msg === 'string') text = msg
  else {
    const n = Number(vars?.count ?? 0)
    text = new Intl.PluralRules(LOCALES[lang]).select(n) === 'one' ? msg.one : msg.other
  }
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function t(key: MessageKey, vars?: Vars): string {
  return format(current, DICTS[current][key] ?? en[key], vars)
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Current language; re-renders the component when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/** `t`, plus a re-render on language change (for memoised components). */
export function useT(): typeof t {
  useLang()
  return t
}

/** Date in the UI language (defaults to a short date like "Mar 4, 2026" / "4. März 2026"). */
export function formatDate(ms: number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Date(ms).toLocaleDateString(locale(), opts)
}
