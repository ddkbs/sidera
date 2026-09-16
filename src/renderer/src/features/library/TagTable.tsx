import { useVirtualizer } from '@tanstack/react-virtual'
import { Calendar, CheckSquare, CircleDot, Hash as HashIcon, Plus, Type } from '@/components/icons'
import { nanoid } from 'nanoid'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { color } from '@/lib/colors'
import { useAppDispatch } from '@/store'
import { useCreatePropertyMutation, useListCardsQuery, useListPropertiesQuery, useSetPropertyValueMutation } from '@/store/api'
import { openCard } from '@/store/ui'
import type { CardSummary, PropertyType, TagProperty } from '@shared/types'

const TYPE_ICON: Record<PropertyType, React.ReactNode> = {
  select: <CircleDot className="size-3.5" />,
  text: <Type className="size-3.5" />,
  number: <HashIcon className="size-3.5" />,
  date: <Calendar className="size-3.5" />,
  checkbox: <CheckSquare className="size-3.5" />
}
const NONE = '__none'

/** Database-style table for a tag: one column per property, cells editable in place. */
export function TagTable({ tagId, filter }: { tagId: string; filter: string }) {
  const dispatch = useAppDispatch()
  const { data: cards = [] } = useListCardsQuery({ tagId, limit: 5000 })
  const { data: props = [] } = useListPropertiesQuery(tagId)
  const q = filter.trim().toLowerCase()
  const rows = q ? cards.filter((c) => c.title.toLowerCase().includes(q)) : cards
  const parent = useRef<HTMLDivElement>(null)
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 40, overscan: 12 })
  const template = `minmax(220px,2fr) ${props.map(() => 'minmax(150px,1fr)').join(' ')} 110px 44px`

  return (
    <div className="flex h-full flex-col px-8 pb-6">
      <div ref={parent} className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-fit">
          <div className="sticky top-0 z-10 grid border-b bg-background text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: template }}>
            <div className="px-3 py-2">Title</div>
            {props.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5 border-l px-3 py-2">
                {TYPE_ICON[p.type]} {p.name}
              </div>
            ))}
            <div className="border-l px-3 py-2 text-right">Updated</div>
            <AddProperty tagId={tagId} />
          </div>
          {rows.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">No cards with this tag yet</div>}
          <div style={{ height: virtual.getTotalSize() }} className="relative">
            {virtual.getVirtualItems().map((item) => {
              const card = rows[item.index]
              return (
                <div
                  key={card.id}
                  className="absolute inset-x-0 grid items-center border-b text-sm hover:bg-accent/40"
                  style={{ gridTemplateColumns: template, transform: `translateY(${item.start}px)`, height: item.size }}
                >
                  <button onClick={() => dispatch(openCard(card.id))} className="truncate px-3 text-left font-medium hover:underline">
                    {card.title || <span className="text-muted-foreground">Untitled</span>}
                  </button>
                  {props.map((p) => (
                    <div key={p.id} className="h-full min-w-0 border-l">
                      <Cell card={card} property={p} />
                    </div>
                  ))}
                  <div className="border-l px-3 text-right text-xs text-muted-foreground">{new Date(card.updatedAt).toLocaleDateString()}</div>
                  <div />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({ card, property }: { card: CardSummary; property: TagProperty }) {
  const [setValue] = useSetPropertyValueMutation()
  const value = card.values?.[property.id]
  const save = (v: unknown) => void setValue({ cardId: card.id, propertyId: property.id, value: v })

  if (property.type === 'select') {
    return (
      <Select value={typeof value === 'string' ? value : NONE} onValueChange={(v) => save(v === NONE ? null : v)}>
        <SelectTrigger size="sm" className="h-full! w-full rounded-none border-none bg-transparent! px-3 shadow-none [&>svg]:opacity-0 hover:[&>svg]:opacity-50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>
            <span className="text-muted-foreground">Empty</span>
          </SelectItem>
          {property.options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: color(o.color).bg, color: color(o.color).fg }}>
                {o.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (property.type === 'checkbox') {
    return (
      <label className="flex h-full items-center px-3">
        <input type="checkbox" checked={value === true} onChange={(e) => save(e.target.checked)} className="size-4 accent-[var(--brand)]" />
      </label>
    )
  }
  return (
    <input
      key={String(value ?? '')}
      type={property.type === 'number' ? 'number' : property.type === 'date' ? 'date' : 'text'}
      defaultValue={value == null ? '' : String(value)}
      onBlur={(e) => {
        const raw = e.target.value
        const next = raw === '' ? null : property.type === 'number' ? Number(raw) : raw
        if (next !== (value ?? null)) save(next)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-full w-full bg-transparent px-3 outline-none focus:bg-background focus:ring-2 focus:ring-ring/30 focus:ring-inset"
    />
  )
}

function AddProperty({ tagId }: { tagId: string }) {
  const [create] = useCreatePropertyMutation()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<PropertyType>('text')
  const [options, setOptions] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="grid place-items-center border-l text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="Add property">
          <Plus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!name.trim()) return
            const colors = ['gray', 'blue', 'green', 'orange', 'purple', 'pink', 'red', 'teal', 'yellow']
            void create({
              tagId,
              name: name.trim(),
              type,
              options:
                type === 'select'
                  ? options.split(',').map((s) => s.trim()).filter(Boolean).map((n, i) => ({ id: nanoid(8), name: n, color: colors[i % colors.length] }))
                  : []
            })
            setName('')
            setOptions('')
            setOpen(false)
          }}
        >
          <p className="text-sm font-medium">New property</p>
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={type} onValueChange={(v) => setType(v as PropertyType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TYPE_ICON) as PropertyType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_ICON[t]} <span className="capitalize">{t}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {type === 'select' && <Input placeholder="Options, comma separated" value={options} onChange={(e) => setOptions(e.target.value)} />}
          <Button type="submit" size="sm" className="w-full">
            Add property
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
