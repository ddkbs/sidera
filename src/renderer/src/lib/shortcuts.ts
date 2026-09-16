import { useEffect, useRef } from 'react'
import { useAppSelector } from '@/store'
import { eventToBindings, normalize } from './keys'

export { eventToBinding, eventToBindings, formatBinding, normalize } from './keys'

export interface CommandDef {
  id: string
  label: string
  group: 'General' | 'Navigation' | 'Whiteboard tools' | 'Whiteboard editing'
  binding: string
  /** fire even while typing in an input/editor (only sensible for modifier combos) */
  global?: boolean
}

/** Every rebindable command. Bindings use "Mod" for ⌘, plus Shift / Alt / Ctrl, then the key. */
export const COMMANDS: CommandDef[] = [
  { id: 'palette.open', label: 'Search & commands', group: 'General', binding: 'Mod+K', global: true },
  { id: 'settings.open', label: 'Open settings', group: 'General', binding: 'Mod+,', global: true },
  { id: 'shortcuts.open', label: 'Keyboard shortcuts', group: 'General', binding: 'Mod+/', global: true },
  { id: 'chat.toggle', label: 'Toggle AI assistant', group: 'General', binding: 'Mod+J', global: true },
  { id: 'sidebar.toggle', label: 'Toggle sidebar', group: 'General', binding: 'Mod+\\', global: true },
  { id: 'nav.back', label: 'Go back', group: 'Navigation', binding: 'Mod+[', global: true },
  { id: 'nav.forward', label: 'Go forward', group: 'Navigation', binding: 'Mod+]', global: true },
  { id: 'tab.new', label: 'New tab', group: 'Navigation', binding: 'Mod+T', global: true },
  { id: 'tab.close', label: 'Close tab', group: 'Navigation', binding: 'Mod+W', global: true },
  { id: 'tab.next', label: 'Next tab', group: 'Navigation', binding: 'Ctrl+Tab', global: true },
  { id: 'tab.prev', label: 'Previous tab', group: 'Navigation', binding: 'Ctrl+Shift+Tab', global: true },
  { id: 'nav.journal', label: "Open today's journal", group: 'Navigation', binding: 'Mod+Shift+J', global: true },
  { id: 'tool.select', label: 'Select tool', group: 'Whiteboard tools', binding: 'V' },
  { id: 'tool.card', label: 'Card tool', group: 'Whiteboard tools', binding: 'C' },
  { id: 'tool.import', label: 'Import file', group: 'Whiteboard tools', binding: 'U' },
  { id: 'tool.connector', label: 'Connector tool', group: 'Whiteboard tools', binding: 'A' },
  { id: 'tool.text', label: 'Text tool', group: 'Whiteboard tools', binding: 'T' },
  { id: 'tool.section', label: 'Section tool', group: 'Whiteboard tools', binding: 'S' },
  { id: 'tool.search', label: 'Add existing card', group: 'Whiteboard tools', binding: 'F' },
  { id: 'canvas.fit', label: 'Fit to screen', group: 'Whiteboard editing', binding: 'Shift+1' },
  { id: 'canvas.find', label: 'Find on whiteboard', group: 'Whiteboard editing', binding: 'Mod+F', global: true },
  { id: 'canvas.undo', label: 'Undo', group: 'Whiteboard editing', binding: 'Mod+Z' },
  { id: 'canvas.redo', label: 'Redo', group: 'Whiteboard editing', binding: 'Mod+Shift+Z' },
  { id: 'canvas.copy', label: 'Copy objects', group: 'Whiteboard editing', binding: 'Mod+C' },
  { id: 'canvas.paste', label: 'Paste objects', group: 'Whiteboard editing', binding: 'Mod+V' },
  { id: 'canvas.duplicate', label: 'Duplicate selection', group: 'Whiteboard editing', binding: 'Mod+D' },
  { id: 'canvas.selectAll', label: 'Select all', group: 'Whiteboard editing', binding: 'Mod+A' }
]

for (const c of COMMANDS) c.binding = normalize(c.binding)

export const COMMAND_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c]))

export function useBindings(): Record<string, string> {
  const overrides = useAppSelector((s) => s.settings.shortcuts)
  return Object.fromEntries(COMMANDS.map((c) => [c.id, overrides[c.id] ?? c.binding]))
}

export function useBinding(id: string): string {
  const override = useAppSelector((s) => s.settings.shortcuts[id])
  return override ?? COMMAND_BY_ID[id]?.binding ?? ''
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** Suspends all command handling while recording a new shortcut in settings. */
export const shortcutRecording = { active: false }

/**
 * Register handlers for commands. Handlers return `false` to let the event pass through
 * (e.g. copy when nothing is selected); anything else prevents the default action.
 */
export function useCommands(handlers: Partial<Record<string, (e: KeyboardEvent) => unknown>>, enabled = true): void {
  const bindings = useBindings()
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (shortcutRecording.active || e.defaultPrevented) return
      const pressed = eventToBindings(e)
      if (!pressed.length) return
      for (const [id, fn] of Object.entries(ref.current)) {
        if (!fn || !pressed.includes(bindings[id])) continue
        if (isTyping(e.target) && !COMMAND_BY_ID[id]?.global) continue
        if (fn(e) === false) continue
        e.preventDefault()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [bindings, enabled])
}
