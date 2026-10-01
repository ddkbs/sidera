import { useEffect, useRef } from 'react'
import { useAppSelector } from '@/store'
import { t, type MessageKey } from './i18n'
import { eventToBindings, normalize } from './keys'

export { eventToBinding, eventToBindings, formatBinding, normalize } from './keys'

export type CommandGroup = 'General' | 'Navigation' | 'Whiteboard tools' | 'Whiteboard editing' | 'Tasks' | 'Onboarding'

export interface CommandDef {
  id: string
  /** dictionary key of the label (see `commandLabel`) */
  label: MessageKey
  group: CommandGroup
  binding: string
  /** only active inside this view; commands of different scopes may share a binding */
  scope?: 'whiteboard' | 'tasks' | 'onboarding'
  /** fire even while typing in an input/editor (only sensible for modifier combos) */
  global?: boolean
}

/** Every rebindable command. Bindings use "Mod" for ⌘, plus Shift / Alt / Ctrl, then the key. */
export const COMMANDS: CommandDef[] = [
  { id: 'palette.open', label: 'cmd.palette.open', group: 'General', binding: 'Mod+K', global: true },
  { id: 'settings.open', label: 'cmd.settings.open', group: 'General', binding: 'Mod+,', global: true },
  { id: 'shortcuts.open', label: 'cmd.shortcuts.open', group: 'General', binding: 'Mod+/', global: true },
  { id: 'chat.toggle', label: 'cmd.chat.toggle', group: 'General', binding: 'Mod+J', global: true },
  { id: 'sidebar.toggle', label: 'cmd.sidebar.toggle', group: 'General', binding: 'Mod+\\', global: true },
  { id: 'capture.open', label: 'cmd.capture.open', group: 'General', binding: 'Mod+Shift+N', global: true },
  { id: 'edit.undo', label: 'cmd.edit.undo', group: 'General', binding: 'Mod+Z' },
  { id: 'edit.redo', label: 'cmd.edit.redo', group: 'General', binding: 'Mod+Shift+Z' },
  { id: 'nav.back', label: 'cmd.nav.back', group: 'Navigation', binding: 'Mod+[', global: true },
  { id: 'nav.forward', label: 'cmd.nav.forward', group: 'Navigation', binding: 'Mod+]', global: true },
  { id: 'tab.new', label: 'cmd.tab.new', group: 'Navigation', binding: 'Mod+T', global: true },
  { id: 'tab.close', label: 'cmd.tab.close', group: 'Navigation', binding: 'Mod+W', global: true },
  { id: 'tab.next', label: 'cmd.tab.next', group: 'Navigation', binding: 'Ctrl+Tab', global: true },
  { id: 'tab.prev', label: 'cmd.tab.prev', group: 'Navigation', binding: 'Ctrl+Shift+Tab', global: true },
  { id: 'nav.tasks', label: 'cmd.nav.tasks', group: 'Navigation', binding: 'Mod+Shift+T', global: true },
  { id: 'tool.select', scope: 'whiteboard', label: 'cmd.tool.select', group: 'Whiteboard tools', binding: 'V' },
  { id: 'tool.text', scope: 'whiteboard', label: 'cmd.tool.text', group: 'Whiteboard tools', binding: 'T' },
  { id: 'tool.card', scope: 'whiteboard', label: 'cmd.tool.card', group: 'Whiteboard tools', binding: 'C' },
  { id: 'tool.import', scope: 'whiteboard', label: 'cmd.tool.import', group: 'Whiteboard tools', binding: 'U' },
  { id: 'tool.connector', scope: 'whiteboard', label: 'cmd.tool.connector', group: 'Whiteboard tools', binding: 'A' },
  { id: 'tool.section', scope: 'whiteboard', label: 'cmd.tool.section', group: 'Whiteboard tools', binding: 'S' },
  { id: 'tool.search', scope: 'whiteboard', label: 'cmd.tool.search', group: 'Whiteboard tools', binding: 'F' },
  { id: 'tool.pen', scope: 'whiteboard', label: 'cmd.tool.pen', group: 'Whiteboard tools', binding: 'P' },
  { id: 'canvas.newTextBlock', scope: 'whiteboard', label: 'cmd.canvas.newTextBlock', group: 'Whiteboard editing', binding: 'Mod+N' },
  { id: 'canvas.fit', scope: 'whiteboard', label: 'cmd.canvas.fit', group: 'Whiteboard editing', binding: 'Shift+1' },
  { id: 'canvas.find', scope: 'whiteboard', label: 'cmd.canvas.find', group: 'Whiteboard editing', binding: 'Mod+F', global: true },
  { id: 'canvas.copy', scope: 'whiteboard', label: 'cmd.canvas.copy', group: 'Whiteboard editing', binding: 'Mod+C' },
  { id: 'canvas.paste', scope: 'whiteboard', label: 'cmd.canvas.paste', group: 'Whiteboard editing', binding: 'Mod+V' },
  { id: 'canvas.duplicate', scope: 'whiteboard', label: 'cmd.canvas.duplicate', group: 'Whiteboard editing', binding: 'Mod+D' },
  { id: 'canvas.selectAll', scope: 'whiteboard', label: 'cmd.canvas.selectAll', group: 'Whiteboard editing', binding: 'Mod+A' },
  { id: 'canvas.group', scope: 'whiteboard', label: 'cmd.canvas.group', group: 'Whiteboard editing', binding: 'Mod+G' },
  { id: 'canvas.textBigger', scope: 'whiteboard', label: 'cmd.canvas.textBigger', group: 'Whiteboard editing', binding: 'Mod+Shift+.' },
  { id: 'canvas.textSmaller', scope: 'whiteboard', label: 'cmd.canvas.textSmaller', group: 'Whiteboard editing', binding: 'Mod+Shift+,' },
  { id: 'canvas.drawOnIpad', scope: 'whiteboard', label: 'cmd.canvas.drawOnIpad', group: 'Whiteboard editing', binding: 'Mod+Shift+D' },
  { id: 'tasks.new', scope: 'tasks', label: 'cmd.tasks.new', group: 'Tasks', binding: 'C' },
  { id: 'tasks.next', scope: 'tasks', label: 'cmd.tasks.next', group: 'Tasks', binding: 'Down' },
  { id: 'tasks.prev', scope: 'tasks', label: 'cmd.tasks.prev', group: 'Tasks', binding: 'Up' },
  { id: 'tasks.open', scope: 'tasks', label: 'cmd.tasks.open', group: 'Tasks', binding: 'Enter' },
  { id: 'tasks.close', scope: 'tasks', label: 'cmd.tasks.close', group: 'Tasks', binding: 'Esc' },
  { id: 'onboarding.next', scope: 'onboarding', label: 'cmd.onboarding.next', group: 'Onboarding', binding: 'Right', global: true },
  { id: 'onboarding.confirm', scope: 'onboarding', label: 'cmd.onboarding.confirm', group: 'Onboarding', binding: 'Enter' },
  { id: 'onboarding.back', scope: 'onboarding', label: 'cmd.onboarding.back', group: 'Onboarding', binding: 'Left', global: true },
  { id: 'onboarding.skip', scope: 'onboarding', label: 'cmd.onboarding.skip', group: 'Onboarding', binding: 'Esc', global: true }
]

for (const c of COMMANDS) c.binding = normalize(c.binding)

const GROUP_LABELS: Record<CommandGroup, MessageKey> = {
  General: 'cmdGroup.general',
  Navigation: 'cmdGroup.navigation',
  'Whiteboard tools': 'cmdGroup.whiteboardTools',
  'Whiteboard editing': 'cmdGroup.whiteboardEditing',
  Tasks: 'cmdGroup.tasks',
  Onboarding: 'cmdGroup.onboarding'
}

/** Command label in the UI language. */
export const commandLabel = (c: CommandDef | undefined): string => (c ? t(c.label) : '')
export const commandGroupLabel = (g: CommandGroup): string => t(GROUP_LABELS[g])

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
