// Pure key-binding helpers (no store imports — unit tested).

const NAMED: Record<string, string> = {
  Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', ' ': 'Space',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
}

const ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod']

export function normalize(binding: string): string {
  const parts = binding.split('+')
  const key = parts.pop()!
  return [...ORDER.filter((m) => parts.includes(m)), key].join('+')
}

const combo = (e: KeyboardEvent, key: string, withShift: boolean): string => {
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (withShift && e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Mod')
  return normalize([...parts, key].join('+'))
}

/**
 * All bindings a key event can satisfy: the physical key with Shift ("Shift+Mod+7") and, for printed
 * symbols, the character without Shift ("Mod+/"), so shortcuts work on non-US layouts.
 */
export function eventToBindings(e: KeyboardEvent): string[] {
  if (['Meta', 'Shift', 'Alt', 'Control'].includes(e.key)) return []
  const out: string[] = []
  if (NAMED[e.key]) out.push(combo(e, NAMED[e.key], true))
  if (/^Key[A-Z]$/.test(e.code)) out.push(combo(e, e.code.slice(3), true))
  else if (/^Digit\d$/.test(e.code)) out.push(combo(e, e.code.slice(5), true))
  if (e.key.length === 1 && !/[a-z0-9]/i.test(e.key)) out.push(combo(e, e.key, false))
  else if (!out.length && e.key.length === 1) out.push(combo(e, e.key.toUpperCase(), true))
  return [...new Set(out)]
}

/** Binding to store when recording: prefer the printed symbol for punctuation, the physical key otherwise. */
export function eventToBinding(e: KeyboardEvent): string | null {
  const all = eventToBindings(e)
  if (!all.length) return null
  return e.key.length === 1 && !/[a-z0-9]/i.test(e.key) ? all[all.length - 1] : all[0]
}

/** "Shift+Mod+Z" → "⇧⌘Z" (macOS glyph order: ⌃⌥⇧⌘). */
export function formatBinding(binding: string): string {
  const parts = binding.split('+')
  const key = parts.pop()!
  const glyph: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' }
  const keyGlyph: Record<string, string> = { Enter: '↩', Esc: 'esc', Backspace: '⌫', Delete: '⌦', Tab: '⇥', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Space' }
  return ORDER.filter((m) => parts.includes(m)).map((m) => glyph[m]).join('') + (keyGlyph[key] ?? key)
}
