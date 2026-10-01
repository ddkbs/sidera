import { FileText, Plus } from '@/components/icons'
import { useState } from 'react'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useSearchQuery } from '@/store/api'
import { t } from '@/lib/i18n'

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
  const cards = data.filter((h) => h.kind === 'card' && h.cardKind !== 'block')
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t('addCard.title')} shouldFilter={false}>
      <CommandInput placeholder={t('addCard.placeholder')} value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{t('task.noCards')}</CommandEmpty>
        <CommandGroup heading={t('task.cards')}>
          {cards.map((c) => (
            <CommandItem key={c.id} value={c.id} onSelect={() => onPick(c.id)} disabled={excludeIds.has(c.id)}>
              <FileText className="text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate">{c.title || t('common.untitled')}</div>
                {c.snippet && <div className="truncate text-xs text-muted-foreground">{c.snippet}</div>}
              </div>
              {excludeIds.has(c.id) && <span className="ml-auto text-xs text-muted-foreground">{t('addCard.onBoard')}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        {q.trim() && (
          <CommandGroup heading={t('common.create')}>
            <CommandItem value="__create" onSelect={() => onCreate(q.trim())}>
              <Plus /> {t('palette.newCardNamed', { name: q.trim() })}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
