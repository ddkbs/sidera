import { Extension, ReactRenderer, type Editor, type Range } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { Code, Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Minus, Quote, Text, type AppIcon as LucideIcon } from '@/components/icons'
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { cn } from '@/lib/utils'

interface SlashItem {
  title: string
  hint: string
  icon: LucideIcon
  keywords: string
  run: (editor: Editor, range: Range) => void
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

export const SLASH_ITEMS: SlashItem[] = [
  { title: 'Text', hint: 'Plain paragraph', icon: Text, keywords: 'paragraph p', run: (e, r) => chain(e, r).setParagraph().run() },
  { title: 'Heading 1', hint: 'Large section title', icon: Heading1, keywords: 'h1 title', run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { title: 'Heading 2', hint: 'Medium section title', icon: Heading2, keywords: 'h2 subtitle', run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { title: 'Heading 3', hint: 'Small section title', icon: Heading3, keywords: 'h3', run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { title: 'Bullet list', hint: 'Unordered list', icon: List, keywords: 'ul bullets', run: (e, r) => chain(e, r).toggleBulletList().run() },
  { title: 'Numbered list', hint: 'Ordered list', icon: ListOrdered, keywords: 'ol numbers', run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { title: 'To-do list', hint: 'Checkboxes', icon: ListChecks, keywords: 'todo task checkbox', run: (e, r) => chain(e, r).toggleTaskList().run() },
  { title: 'Quote', hint: 'Blockquote', icon: Quote, keywords: 'blockquote citation', run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { title: 'Code block', hint: 'Monospace code', icon: Code, keywords: 'code pre snippet', run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { title: 'Divider', hint: 'Horizontal rule', icon: Minus, keywords: 'hr line separator', run: (e, r) => chain(e, r).setHorizontalRule().run() }
]

export function filterSlash(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keywords.includes(q))
}

interface Handle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean
}

const SlashList = forwardRef<Handle, SuggestionProps<SlashItem>>(function SlashList(props, ref) {
  const [index, setIndex] = useState(0)
  useEffect(() => setIndex(0), [props.items])
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length
      if (!n) return false
      if (event.key === 'ArrowDown') return setIndex((i) => (i + 1) % n), true
      if (event.key === 'ArrowUp') return setIndex((i) => (i - 1 + n) % n), true
      if (event.key === 'Enter') return props.command(props.items[index]), true
      return false
    }
  }))
  if (!props.items.length) return null
  return (
    <div className="w-64 overflow-hidden rounded-lg border bg-popover p-1 text-sm shadow-lg">
      {props.items.map((item, i) => (
        <button
          key={item.title}
          onMouseDown={(e) => (e.preventDefault(), props.command(item))}
          onMouseEnter={() => setIndex(i)}
          className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', i === index && 'bg-accent')}
        >
          <span className="grid size-7 place-items-center rounded-md border bg-background">
            <item.icon className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block leading-tight">{item.title}</span>
            <span className="block text-xs text-muted-foreground">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

/** Notion-style "/" command menu. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlash(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<Handle, SuggestionProps<SlashItem>> | null = null
          let el: HTMLDivElement | null = null
          const place = (p: SuggestionProps<SlashItem>) => {
            const rect = p.clientRect?.()
            if (!rect || !el) return
            const below = rect.bottom + 6
            el.style.left = `${rect.left}px`
            el.style.top = `${below + 360 > window.innerHeight ? Math.max(8, rect.top - 366) : below}px`
          }
          return {
            onStart: (p) => {
              renderer = new ReactRenderer(SlashList, { props: p, editor: p.editor })
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
              if (p.event.key === 'Escape') {
                el?.remove()
                return true
              }
              return renderer?.ref?.onKeyDown(p) ?? false
            },
            onExit: () => {
              el?.remove()
              renderer?.destroy()
            }
          }
        }
      })
    ]
  }
})
