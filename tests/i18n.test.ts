import { describe, expect, it } from 'vitest'
import { resolveLang } from '../src/shared/i18n'
import { format, getLang, setLang, t } from '../src/renderer/src/lib/i18n'
import { de } from '../src/renderer/src/lib/i18n/de'
import { en } from '../src/renderer/src/lib/i18n/en'
import { authError } from '../src/renderer/src/lib/i18n/authErrors'

describe('i18n', () => {
  it('resolves the language from the setting, else the system locale', () => {
    expect(resolveLang('en', ['de-DE'])).toBe('en')
    expect(resolveLang(null, ['de-AT', 'en'])).toBe('de')
    expect(resolveLang(null, ['fr-FR', 'de'])).toBe('en')
    expect(resolveLang(undefined, [])).toBe('en')
  })

  it('interpolates and picks plural forms', () => {
    expect(format('en', 'Hi {name}, {missing}', { name: 'Ada' })).toBe('Hi Ada, {missing}')
    const msg = { one: '{count} card', other: '{count} cards' }
    expect(format('en', msg, { count: 1 })).toBe('1 card')
    expect(format('en', msg, { count: 0 })).toBe('0 cards')
    expect(format('de', { one: '{count} Karte', other: '{count} Karten' }, { count: 2 })).toBe('2 Karten')
  })

  it('switches language at runtime', () => {
    const before = getLang()
    setLang('de')
    expect(t('common.cancel')).toBe('Abbrechen')
    setLang('en')
    expect(t('common.cancel')).toBe('Cancel')
    setLang(before)
  })

  it('translates known auth errors from main', () => {
    const before = getLang()
    setLang('de')
    expect(authError('Wrong password')).toBe('Falsches Passwort')
    expect(authError('An account named “Ada” already exists')).toBe('Ein Konto namens „Ada“ existiert bereits')
    expect(authError('Something else')).toBe('Something else')
    setLang(before)
  })

  it('German covers every key with the same placeholders', () => {
    const vars = (m: unknown) => JSON.stringify(m).match(/\{\w+\}/g)?.sort() ?? []
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(de[key], key).toBeDefined()
      expect(vars(de[key]), key).toEqual(vars(en[key]))
    }
  })
})
