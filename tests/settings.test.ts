import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mergeSettings } from '@shared/settings'

describe('settings', () => {
  it('merges nested groups and replaces shortcut maps', () => {
    const a = mergeSettings(DEFAULT_SETTINGS, { mcp: { port: 4000 }, shortcuts: { 'palette.open': 'Mod+P' } })
    expect(a.mcp).toEqual({ httpEnabled: true, port: 4000 })
    const b = mergeSettings(a, { shortcuts: {} })
    expect(b.shortcuts).toEqual({})
    expect(mergeSettings(DEFAULT_SETTINGS, null)).toBe(DEFAULT_SETTINGS)
  })
})

describe('shortcuts', async () => {
  const { eventToBinding, eventToBindings, formatBinding } = await import('../src/renderer/src/lib/keys')
  const ev = (init: Partial<KeyboardEvent>) => ({ metaKey: false, shiftKey: false, altKey: false, ctrlKey: false, ...init }) as KeyboardEvent

  it('matches bindings independent of keyboard layout', () => {
    expect(eventToBindings(ev({ key: 'k', code: 'KeyK', metaKey: true }))).toEqual(['Mod+K'])
    expect(eventToBindings(ev({ key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true }))).toEqual(['Shift+Mod+Z'])
    // German layout: "/" is Shift+7
    expect(eventToBindings(ev({ key: '/', code: 'Digit7', metaKey: true, shiftKey: true }))).toContain('Mod+/')
    // US layout: Shift+1 prints "!" but still satisfies "Shift+1"
    expect(eventToBindings(ev({ key: '!', code: 'Digit1', shiftKey: true }))).toContain('Shift+1')
    expect(eventToBindings(ev({ key: 'Tab', code: 'Tab', ctrlKey: true, shiftKey: true }))).toEqual(['Ctrl+Shift+Tab'])
    expect(eventToBinding(ev({ key: '/', code: 'Digit7', metaKey: true, shiftKey: true }))).toBe('Mod+/')
    expect(eventToBinding(ev({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull()
    expect(formatBinding('Shift+Mod+Z')).toBe('⇧⌘Z')
  })
})
