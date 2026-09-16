import Mention from '@tiptap/extension-mention'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import { FileText, Plus } from '@/components/icons'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { MENTION_NODE } from '@shared/doc'
import { cn } from '@/lib/utils'
import { store } from '@/store'
import { openCard } from '@/store/ui'

interface Item {
  id: string
  label: string
  create?: boolean
}

interface ListHandle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean
}

const MentionList = forwardRef<ListHandle, SuggestionProps<Item>>(function MentionList(props, ref) {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [props.items])
  const select = (i: number) => {
    const item = props.items[i]
    if (item) props.command(item)
  }
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') return setIndex((i) => (i + 1) % props.items.length), true
      if (event.key === 'ArrowUp') return setIndex((i) => (i - 1 + props.items.length) % props.items.length), true
      if (event.key === 'Enter') return select(index), true
      return false
    }
  }))
  return (
    <div className="w-72 overflow-hidden rounded-lg border bg-popover p-1 text-sm shadow-lg">
      {props.items.map((item, i) => (
        <button
          key={item.id}
          onMouseDown={(e) => (e.preventDefault(), select(i))}
          className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left', i === index && 'bg-accent')}
        >
          {item.create ? <Plus className="size-3.5" /> : <FileText className="size-3.5 text-muted-foreground" />}
          <span className="truncate">{item.create ? `Create “${item.label}”` : item.label || 'Untitled'}</span>
        </button>
      ))}
    </div>
  )
})

/** `@` mentions linking to other cards. Creates backlinks on save. */
export const CardMention = Mention.extend({ name: MENTION_NODE }).configure({
  HTMLAttributes: { class: 'card-mention' },
  renderText: ({ node }) => `@${node.attrs.label}`,
  renderHTML: ({ node, options }) => ['span', { ...options.HTMLAttributes, 'data-id': node.attrs.id }, `@${node.attrs.label ?? ''}`],
  suggestion: {
    char: '@',
    allowSpaces: true,
    items: async ({ query }): Promise<Item[]> => {
      const hits = (await window.api.search(query, 8)).filter((h) => h.kind === 'card')
      const items: Item[] = hits.map((h) => ({ id: h.id, label: h.title }))
      if (query.trim() && !hits.some((h) => h.title.toLowerCase() === query.trim().toLowerCase()))
        items.push({ id: `new:${query.trim()}`, label: query.trim(), create: true })
      return items
    },
    command: ({ editor, range, props }) => {
      const item = props as unknown as Item
      const insert = (id: string, label: string) =>
        editor.chain().focus().insertContentAt(range, [{ type: MENTION_NODE, attrs: { id, label } }, { type: 'text', text: ' ' }]).run()
      if (item.create) void window.api.createCard({ title: item.label }).then((c) => insert(c.id, c.title))
      else insert(item.id, item.label)
    },
    render: () => {
      let renderer: ReactRenderer<ListHandle, SuggestionProps<Item>> | null = null
      let el: HTMLDivElement | null = null
      const place = (p: SuggestionProps<Item>) => {
        const rect = p.clientRect?.()
        if (!rect || !el) return
        el.style.left = `${rect.left}px`
        el.style.top = `${rect.bottom + 6}px`
      }
      return {
        onStart: (p) => {
          renderer = new ReactRenderer(MentionList, { props: p, editor: p.editor })
          el = document.createElement('div')
          el.className = 'mention-popup'
          el.style.position = 'fixed'
          el.style.zIndex = '100'
          el.appendChild(renderer.element)
          document.body.appendChild(el)
          place(p)
        },
        onUpdate: (p) => {
          renderer?.updateProps(p)
          place(p)
        },
        onKeyDown: (p) => {
          if (p.event.key === 'Escape') return el?.remove(), true
          return renderer?.ref?.onKeyDown(p) ?? false
        },
        onExit: () => {
          el?.remove()
          renderer?.destroy()
        }
      }
    }
  }
})

/** Click handler: open mentioned card. */
export function handleMentionClick(e: React.MouseEvent) {
  const target = (e.target as HTMLElement).closest('.card-mention') as HTMLElement | null
  if (target?.dataset.id) store.dispatch(openCard(target.dataset.id))
}
