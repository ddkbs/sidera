import { useEffect, useRef } from 'react'
import { useAppSelector } from '@/store'
import { eventToBindings, normalize } from './keys'

export { eventToBinding, eventToBindings, formatBinding, normalize } from './keys'

export interface CommandDef {
  id: string
  label: string
  group: 'General' | 'Navigation' | 'Whiteboard tools' | 'Whiteboard editing' | 'Tasks' | 'Onboarding'
  binding: string
  /** only active inside this view; commands of different scopes may share a binding */
  scope?: 'whiteboard' | 'tasks' | 'onboarding'
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
  { id: 'capture.open', label: 'Quick capture', group: 'General', binding: 'Mod+Shift+N', global: true },
  { id: 'edit.undo', label: 'Undo', group: 'General', binding: 'Mod+Z' },
  { id: 'edit.redo', label: 'Redo', group: 'General', binding: 'Mod+Shift+Z' },
  { id: 'nav.back', label: 'Go back', group: 'Navigation', binding: 'Mod+[', global: true },
  { id: 'nav.forward', label: 'Go forward', group: 'Navigation', binding: 'Mod+]', global: true },
  { id: 'tab.new', label: 'New tab', group: 'Navigation', binding: 'Mod+T', global: true },
  { id: 'tab.close', label: 'Close tab', group: 'Navigation', binding: 'Mod+W', global: true },
  { id: 'tab.next', label: 'Next tab', group: 'Navigation', binding: 'Ctrl+Tab', global: true },
  { id: 'tab.prev', label: 'Previous tab', group: 'Navigation', binding: 'Ctrl+Shift+Tab', global: true },
  { id: 'nav.tasks', label: 'Open tasks', group: 'Navigation', binding: 'Mod+Shift+T', global: true },
  { id: 'tool.select', scope: 'whiteboard', label: 'Select tool', group: 'Whiteboard tools', binding: 'V' },
  { id: 'tool.text', scope: 'whiteboard', label: 'Text tool', group: 'Whiteboard tools', binding: 'T' },
  { id: 'tool.card', scope: 'whiteboard', label: 'Card tool', group: 'Whiteboard tools', binding: 'C' },
  { id: 'tool.import', scope: 'whiteboard', label: 'Import file', group: 'Whiteboard tools', binding: 'U' },
  { id: 'tool.connector', scope: 'whiteboard', label: 'Connector tool', group: 'Whiteboard tools', binding: 'A' },
  { id: 'tool.section', scope: 'whiteboard', label: 'Section tool', group: 'Whiteboard tools', binding: 'S' },
  { id: 'tool.search', scope: 'whiteboard', label: 'Add existing card', group: 'Whiteboard tools', binding: 'F' },
  { id: 'tool.pen', scope: 'whiteboard', label: 'Pen (draw on the whiteboard)', group: 'Whiteboard tools', binding: 'P' },
  { id: 'canvas.newTextBlock', scope: 'whiteboard', label: 'New text box', group: 'Whiteboard editing', binding: 'Mod+N' },
  { id: 'canvas.fit', scope: 'whiteboard', label: 'Fit to screen', group: 'Whiteboard editing', binding: 'Shift+1' },
  { id: 'canvas.find', scope: 'whiteboard', label: 'Find on whiteboard', group: 'Whiteboard editing', binding: 'Mod+F', global: true },
  { id: 'canvas.copy', scope: 'whiteboard', label: 'Copy objects', group: 'Whiteboard editing', binding: 'Mod+C' },
  { id: 'canvas.paste', scope: 'whiteboard', label: 'Paste objects', group: 'Whiteboard editing', binding: 'Mod+V' },
  { id: 'canvas.duplicate', scope: 'whiteboard', label: 'Duplicate selection', group: 'Whiteboard editing', binding: 'Mod+D' },
  { id: 'canvas.selectAll', scope: 'whiteboard', label: 'Select all', group: 'Whiteboard editing', binding: 'Mod+A' },
  { id: 'canvas.group', scope: 'whiteboard', label: 'Create section from selection', group: 'Whiteboard editing', binding: 'Mod+G' },
  { id: 'canvas.textBigger', scope: 'whiteboard', label: 'Bigger text', group: 'Whiteboard editing', binding: 'Mod+Shift+.' },
  { id: 'canvas.textSmaller', scope: 'whiteboard', label: 'Smaller text', group: 'Whiteboard editing', binding: 'Mod+Shift+,' },
  { id: 'canvas.drawOnIpad', scope: 'whiteboard', label: 'Draw on iPad', group: 'Whiteboard editing', binding: 'Mod+Shift+D' },
  { id: 'tasks.new', scope: 'tasks', label: 'New task', group: 'Tasks', binding: 'C' },
  { id: 'tasks.next', scope: 'tasks', label: 'Next task', group: 'Tasks', binding: 'Down' },
  { id: 'tasks.prev', scope: 'tasks', label: 'Previous task', group: 'Tasks', binding: 'Up' },
  { id: 'tasks.open', scope: 'tasks', label: 'Open selected task', group: 'Tasks', binding: 'Enter' },
  { id: 'tasks.close', scope: 'tasks', label: 'Close task details', group: 'Tasks', binding: 'Esc' },
  { id: 'onboarding.next', scope: 'onboarding', label: 'Next step', group: 'Onboarding', binding: 'Right', global: true },
  { id: 'onboarding.confirm', scope: 'onboarding', label: 'Continue', group: 'Onboarding', binding: 'Enter' },
  { id: 'onboarding.back', scope: 'onboarding', label: 'Previous step', group: 'Onboarding', binding: 'Left', global: true },
  { id: 'onboarding.skip', scope: 'onboarding', label: 'Skip / close', group: 'Onboarding', binding: 'Esc', global: true }
]

for (const c of COMMANDS) c.binding = normalize(c.binding)

export const COMMAND_BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c]))

/** Two commands clash only if they can be active at the same time (same scope, or either is app-wide). */
export const scopesOverlap = (a: CommandDef, b: CommandDef): boolean => !a.scope || !b.scope || a.scope === b.scope

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
export function useCommands(
  handlers: Partial<Record<string, (e: KeyboardEvent) => unknown>>,
  enabled = true,
  /** listen in the capture phase so these handlers win over every other view (modal overlays like the onboarding) */
  capture = false
): void {
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
    window.addEventListener('keydown', onKey, capture)
    return () => window.removeEventListener('keydown', onKey, capture)
  }, [bindings, enabled, capture])
}
