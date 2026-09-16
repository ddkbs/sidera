import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useSearchQuery } from '@/store/api'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  onPick: (cardId: string) => void
  onCreate: (title: string) => void
  excludeIds: Set<string>
}

export function AddCardDialog({ open, onOpenChange, onPick, onCreate, excludeIds }: Props) {
  const [q, setQ] = useState('')
  const { data = [] } = useSearchQuery(q, { skip: !open })
  const cards = data.filter((h) => h.kind === 'card')
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Add card to whiteboard" shouldFilter={false}>
      <CommandInput placeholder="Search cards to add…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No cards found</CommandEmpty>
        <CommandGroup heading="Cards">
          {cards.map((c) => (
            <CommandItem key={c.id} value={c.id} onSelect={() => onPick(c.id)} disabled={excludeIds.has(c.id)}>
              <FileText className="text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate">{c.title || 'Untitled'}</div>
                {c.snippet && <div className="truncate text-xs text-muted-foreground">{c.snippet}</div>}
              </div>
              {excludeIds.has(c.id) && <span className="ml-auto text-xs text-muted-foreground">On board</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        {q.trim() && (
          <CommandGroup heading="Create">
            <CommandItem value="__create" onSelect={() => onCreate(q.trim())}>
              <Plus /> New card “{q.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
