/** UI languages. English is the source language; German is type-checked against it in the renderer dictionaries. */
export type Lang = 'en' | 'de'
export const LANGS: Lang[] = ['de', 'en']

/** Native names, shown as-is in every language (language pickers). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', de: 'Deutsch' }

/** BCP 47 locale used for dates and numbers. */
export const LOCALES: Record<Lang, string> = { en: 'en-US', de: 'de-DE' }

/** The stored preference wins; otherwise the system's preferred languages decide (de* → German, else English). */
export function resolveLang(pref: Lang | null | undefined, systemLocales: readonly string[] = []): Lang {
  if (pref && LANGS.includes(pref)) return pref
  return systemLocales[0]?.toLowerCase().startsWith('de') ? 'de' : 'en'
}
