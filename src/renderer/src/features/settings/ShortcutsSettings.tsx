import { useEffect, useState } from 'react'
import { RotateCcw } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { COMMAND_BY_ID, COMMANDS, eventToBinding, scopesOverlap, formatBinding, shortcutRecording, useBindings } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { updateSettings } from '@/store/settings'

const GROUPS = [...new Set(COMMANDS.map((c) => c.group))]

/** Rebind any command: click a shortcut, press the new keys. Esc cancels, Backspace clears. */
export function ShortcutsSettings() {
  const dispatch = useAppDispatch()
  const overrides = useAppSelector((s) => s.settings.shortcuts)
  const bindings = useBindings()
  const [recording, setRecording] = useState<string | null>(null)

  useEffect(() => {
    shortcutRecording.active = recording !== null
    if (!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(null)
      const binding = e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey ? '' : eventToBinding(e)
      if (binding === null) return
      const def = COMMANDS.find((c) => c.id === recording)!
      const next = { ...overrides }
      if (binding === def.binding) delete next[recording]
      else next[recording] = binding
      dispatch(updateSettings({ shortcuts: next }))
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      shortcutRecording.active = false
    }
  }, [recording, overrides, dispatch])

  const conflicts = (id: string) => {
    const b = bindings[id]
    return !!b && COMMANDS.some((c) => c.id !== id && bindings[c.id] === b && scopesOverlap(c, COMMAND_BY_ID[id]))
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Click a shortcut and press the new key combination. Backspace removes it, Esc cancels.</p>
        <Button variant="outline" size="sm" disabled={!Object.keys(overrides).length} onClick={() => dispatch(updateSettings({ shortcuts: {} }))}>
          <RotateCcw /> Reset all
        </Button>
      </div>
      {GROUPS.map((group) => (
        <section key={group} className="mb-6">
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">{group}</h3>
          {COMMANDS.filter((c) => c.group === group).map((c) => (
            <div key={c.id} className="group flex h-10 items-center justify-between border-b last:border-b-0">
              <span className="text-sm">{c.label}</span>
              <div className="flex items-center gap-1.5">
                {overrides[c.id] !== undefined && (
                  <button
                    onClick={() => {
                      const next = { ...overrides }
                      delete next[c.id]
                      dispatch(updateSettings({ shortcuts: next }))
                    }}
                    className="text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setRecording(recording === c.id ? null : c.id)}
                  className={cn(
                    'h-7 min-w-20 rounded-md border px-2 text-xs tracking-wider transition hover:bg-accent',
                    recording === c.id && 'border-brand bg-brand/10 text-brand',
                    conflicts(c.id) && recording !== c.id && 'border-destructive/60 text-destructive'
                  )}
                  title={conflicts(c.id) ? 'Conflicts with another shortcut' : undefined}
                >
                  {recording === c.id ? 'Press keys…' : bindings[c.id] ? formatBinding(bindings[c.id]) : '—'}
                </button>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
