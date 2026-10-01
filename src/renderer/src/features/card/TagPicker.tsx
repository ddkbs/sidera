import { Check, Plus } from '@/components/icons'
import { useState } from 'react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCreateTagMutation, useListTagsQuery, useSetCardTagsMutation } from '@/store/api'
import type { Tag } from '@shared/types'
import { t } from '@/lib/i18n'
import { TagBadge } from './TagBadge'

export function TagPicker({ cardId, tags }: { cardId: string; tags: Tag[] }) {
  const { data: all = [] } = useListTagsQuery()
  const [createTag] = useCreateTagMutation()
  const [setTags] = useSetCardTagsMutation()
  const [query, setQuery] = useState('')
  const selected = new Set(tags.map((tag) => tag.id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    void setTags({ cardId, tagIds: [...next] })
  }
  const create = async () => {
    const res = await createTag({ name: query })
    if ('data' in res && res.data) void setTags({ cardId, tagIds: [...selected, res.data.id] })
    setQuery('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <TagBadge key={t.id} tag={t} onRemove={() => toggle(t.id)} />
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <Plus className="size-3" /> {t('tag.tag')}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0" align="start">
          <Command>
            <CommandInput placeholder={t('tag.findOrCreate')} value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty className="p-1">
                {query.trim() ? (
                  <button onClick={create} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    <Plus className="size-3.5" /> {t('tag.create', { name: query.trim() })}
                  </button>
                ) : (
                  <span className="block py-4 text-center text-sm text-muted-foreground">{t('tag.none')}</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {all.map((t) => (
                  <CommandItem key={t.id} value={t.name} onSelect={() => toggle(t.id)}>
                    <TagBadge tag={t} />
                    <Check className={selected.has(t.id) ? 'ml-auto size-3.5' : 'ml-auto size-3.5 opacity-0'} />
                  </CommandItem>
                ))}
                {query.trim() && !all.some((tag) => tag.name.toLowerCase() === query.trim().toLowerCase()) && all.length > 0 && (
                  <CommandItem value={`__create ${query}`} onSelect={create}>
                    <Plus className="size-3.5" /> {t('tag.create', { name: query.trim() })}
                  </CommandItem>
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
