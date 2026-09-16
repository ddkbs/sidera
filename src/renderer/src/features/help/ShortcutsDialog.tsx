import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { COMMANDS, formatBinding, useBindings, useCommands } from '@/lib/shortcuts'
import { useAppDispatch } from '@/store'
import { openSettings } from '@/store/ui'

const FIXED: [string, string][] = [
  ['/', 'Block commands (editor)'],
  ['@', 'Link a card (editor)'],
  ['Double-click', 'New card / edit object'],
  ['⌘-click', 'Open in new tab'],
  ['⌫', 'Remove from whiteboard']
]

export function ShortcutsDialog() {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const bindings = useBindings()
  useCommands({ 'shortcuts.open': () => setOpen((o) => !o) })
  const groups = [...new Set(COMMANDS.map((c) => c.group))]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="flex-row items-center justify-between">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            className="mr-6"
            onClick={() => {
              setOpen(false)
              dispatch(openSettings('shortcuts'))
            }}
          >
            Customize…
          </Button>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-10 gap-y-6">
          {groups.map((g) => (
            <section key={g}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g}</h3>
              <div className="space-y-1.5">
                {COMMANDS.filter((c) => c.group === g && bindings[c.id]).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{c.label}</span>
                    <Kbd>{formatBinding(bindings[c.id])}</Kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Mouse & editor</h3>
            <div className="space-y-1.5">
              {FIXED.map(([k, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <Kbd>{k}</Kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
