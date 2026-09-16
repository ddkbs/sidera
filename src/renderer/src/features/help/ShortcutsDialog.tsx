import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'General',
    items: [
      ['⌘K', 'Search & commands'],
      ['⌘\\', 'Toggle sidebar'],
      ['⌘[', 'Go back'],
      ['⌘/', 'Keyboard shortcuts'],
      ['Esc', 'Close card panel']
    ]
  },
  {
    title: 'Whiteboard tools',
    items: [
      ['V', 'Select'],
      ['C', 'Card'],
      ['U', 'Import file'],
      ['A', 'Connector'],
      ['T', 'Text'],
      ['S', 'Section'],
      ['F', 'Add existing card'],
      ['⇧1', 'Fit to screen']
    ]
  },
  {
    title: 'Whiteboard editing',
    items: [
      ['⌘F', 'Find on whiteboard'],
      ['⌘Z / ⇧⌘Z', 'Undo / redo'],
      ['⌘C / ⌘V', 'Copy / paste objects'],
      ['⌘D', 'Duplicate selection'],
      ['⌘A', 'Select all'],
      ['⌫', 'Remove from whiteboard'],
      ['Double-click', 'New card / edit card / edit label']
    ]
  },
  {
    title: 'Editor',
    items: [
      ['/', 'Block commands'],
      ['@', 'Link a card (backlink)'],
      ['⌘B / ⌘I', 'Bold / italic']
    ]
  }
]

export function ShortcutsDialog() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === '/') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">{g.title}</h3>
              <div className="space-y-1.5">
                {g.items.map(([k, label]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span>{label}</span>
                    <Kbd>{k}</Kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
