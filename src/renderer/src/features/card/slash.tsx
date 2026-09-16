import { Extension, ReactRenderer, type Editor, type Range } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Code, FileText, Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Minus, Quote, Text, type AppIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

interface SlashItem {
  title: string
  group: 'Basic blocks' | 'Insert'
  hint?: string
  description: string
  keywords: string
  icon: AppIcon
  preview: ReactNode
  run: (editor: Editor, range: Range) => void
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

const Heading4: AppIcon = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor">
    <text x="2" y="17" fontSize="14" fontWeight="600" fontFamily="inherit">H</text>
    <text x="13" y="19" fontSize="9" fontWeight="600" fontFamily="inherit">4</text>
  </svg>
)

const P = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn('text-[13px] leading-snug', className)}>{children}</div>

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text', group: 'Basic blocks', description: 'Just start writing with plain text.', keywords: 'paragraph plain p', icon: Text,
    preview: <P>The best way to predict the future is to invent it.</P>,
    run: (e, r) => chain(e, r).setParagraph().run()
  },
  {
    title: 'Heading 1', group: 'Basic blocks', hint: '#', description: 'Big section heading.', keywords: 'h1 title', icon: Heading1,
    preview: <><P className="text-xl font-semibold">The future</P><P className="mt-1 text-muted-foreground">is to invent it.</P></>,
    run: (e, r) => chain(e, r).setHeading({ level: 1 }).run()
  },
  {
    title: 'Heading 2', group: 'Basic blocks', hint: '##', description: 'Medium section heading.', keywords: 'h2 subtitle', icon: Heading2,
    preview: <><P className="text-lg font-semibold">The future</P><P className="mt-1 text-muted-foreground">is to invent it.</P></>,
    run: (e, r) => chain(e, r).setHeading({ level: 2 }).run()
  },
  {
    title: 'Heading 3', group: 'Basic blocks', hint: '###', description: 'Small section heading.', keywords: 'h3', icon: Heading3,
    preview: <><P className="text-base font-semibold">The future</P><P className="mt-1 text-muted-foreground">is to invent it.</P></>,
    run: (e, r) => chain(e, r).setHeading({ level: 3 }).run()
  },
  {
    title: 'Heading 4', group: 'Basic blocks', hint: '####', description: 'Smaller section heading.', keywords: 'h4', icon: Heading4,
    preview: <><P className="font-semibold">The future</P><P className="mt-1 text-muted-foreground">The best way to predict the future is to invent it.</P></>,
    run: (e, r) => chain(e, r).setHeading({ level: 4 }).run()
  },
  {
    title: 'Bullet list', group: 'Basic blocks', hint: '-', description: 'Create a simple bulleted list.', keywords: 'ul bullets unordered', icon: List,
    preview: <ul className="list-disc pl-4 text-[13px] leading-snug"><li>Ideas</li><li>Questions</li><li>Next steps</li></ul>,
    run: (e, r) => chain(e, r).toggleBulletList().run()
  },
  {
    title: 'Numbered list', group: 'Basic blocks', hint: '1.', description: 'Create a list with numbering.', keywords: 'ol numbers ordered', icon: ListOrdered,
    preview: <ol className="list-decimal pl-4 text-[13px] leading-snug"><li>Research</li><li>Sketch</li><li>Ship</li></ol>,
    run: (e, r) => chain(e, r).toggleOrderedList().run()
  },
  {
    title: 'To-do list', group: 'Basic blocks', hint: '[]', description: 'Track tasks with checkboxes.', keywords: 'todo task checkbox check', icon: ListChecks,
    preview: <div className="space-y-1 text-[13px]"><label className="flex items-center gap-1.5"><input type="checkbox" defaultChecked readOnly /> <s className="text-muted-foreground">Draft outline</s></label><label className="flex items-center gap-1.5"><input type="checkbox" readOnly /> Review</label></div>,
    run: (e, r) => chain(e, r).toggleTaskList().run()
  },
  {
    title: 'Quote', group: 'Basic blocks', hint: '>', description: 'Capture a quote.', keywords: 'blockquote citation', icon: Quote,
    preview: <div className="border-l-2 border-foreground/40 pl-2 text-[13px] leading-snug">The best way to predict the future is to invent it.</div>,
    run: (e, r) => chain(e, r).toggleBlockquote().run()
  },
  {
    title: 'Code block', group: 'Basic blocks', hint: '```', description: 'Capture a code snippet.', keywords: 'code pre snippet', icon: Code,
    preview: <pre className="rounded bg-muted px-2 py-1 font-mono text-[11px]">const idea = invent()</pre>,
    run: (e, r) => chain(e, r).toggleCodeBlock().run()
  },
  {
    title: 'Divider', group: 'Basic blocks', hint: '---', description: 'Visually divide blocks.', keywords: 'hr line separator rule', icon: Minus,
    preview: <><P>Above</P><hr className="my-1.5 border-border" /><P>Below</P></>,
    run: (e, r) => chain(e, r).setHorizontalRule().run()
  },
  {
    title: 'Link to card', group: 'Insert', hint: '@', description: 'Mention another card. Creates a backlink.', keywords: 'mention card link backlink page', icon: FileText,
    preview: <P>See <span className="rounded bg-brand/10 px-1 font-medium text-brand">@Research notes</span> for details.</P>,
    run: (e, r) => chain(e, r).insertContent('@').run()
  }
]

export function filterSlash(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  return SLASH_ITEMS.filter((i) => !q || i.title.toLowerCase().includes(q) || i.keywords.includes(q))
}

interface Handle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean
}

const SlashMenu = forwardRef<Handle, SuggestionProps<SlashItem> & { close: () => void }>(function SlashMenu(props, ref) {
  const [index, setIndex] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const [previewTop, setPreviewTop] = useState(0)
  useEffect(() => setIndex(0), [props.items])

  const measure = () => {
    const el = list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    if (el && list.current) setPreviewTop(el.offsetTop - list.current.scrollTop)
  }
  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length
      if (!n) return false
      if (event.key === 'ArrowDown') return setIndex((i) => (i + 1) % n), true
      if (event.key === 'ArrowUp') return setIndex((i) => (i - 1 + n) % n), true
      if (event.key === 'Enter' || event.key === 'Tab') return props.command(props.items[index]), true
      return false
    }
  }))

  if (!props.items.length) {
    return <div className="w-72 rounded-xl border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-xl">No results</div>
  }

  const groups = [...new Set(props.items.map((i) => i.group))]
  const selected = props.items[index]

  return (
    <div className="relative flex items-start">
      <div className="flex w-72 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
        <div ref={list} className="max-h-80 overflow-y-auto p-1.5" onScroll={measure}>
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{g}</div>
              {props.items.map((item, i) =>
                item.group !== g ? null : (
                  <button
                    key={item.title}
                    data-index={i}
                    onMouseDown={(e) => (e.preventDefault(), props.command(item))}
                    onMouseMove={() => index !== i && setIndex(i)}
                    className={cn('flex h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-sm', i === index && 'bg-accent')}
                  >
                    <item.icon className="size-[18px] shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{item.title}</span>
                    {item.hint && <span className="text-xs tracking-wide text-muted-foreground">{item.hint}</span>}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
        <button
          onMouseDown={(e) => (e.preventDefault(), props.close())}
          className="flex h-10 items-center justify-between border-t px-3.5 text-sm hover:bg-accent"
        >
          Close menu
          <span className="text-xs text-muted-foreground">esc</span>
        </button>
      </div>
      {selected && (
        <div className="absolute left-full ml-2 w-56 overflow-hidden rounded-xl border bg-popover shadow-xl transition-[top] duration-75" style={{ top: Math.max(0, previewTop) }}>
          <div className="m-2 rounded-lg bg-background p-3 text-foreground">{selected.preview}</div>
          <div className="px-3 pb-2.5 text-xs text-muted-foreground">{selected.description}</div>
        </div>
      )}
    </div>
  )
})

/** Notion-style "/" command menu with grouped items, markdown hints and live previews. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        decorationClass: 'slash-decoration',
        decorationContent: 'Type to search',
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ query }) => filterSlash(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<Handle, SuggestionProps<SlashItem> & { close: () => void }> | null = null
          let el: HTMLDivElement | null = null
          let props: SuggestionProps<SlashItem> | null = null
          const close = () => {
            if (!props) return
            // remove the typed "/query" to dismiss the menu
            props.editor.chain().focus().deleteRange(props.range).run()
          }
          const place = (p: SuggestionProps<SlashItem>) => {
            const rect = p.clientRect?.()
            if (!rect || !el) return
            const below = rect.bottom + 6
            el.style.left = `${Math.min(rect.left, window.innerWidth - 540)}px`
            el.style.top = `${below + 380 > window.innerHeight ? Math.max(8, rect.top - 386) : below}px`
          }
          return {
            onStart: (p) => {
              props = p
              renderer = new ReactRenderer(SlashMenu, { props: { ...p, close }, editor: p.editor })
              el = document.createElement('div')
              el.className = 'mention-popup'
              el.style.position = 'fixed'
              el.style.zIndex = '100'
              el.appendChild(renderer.element)
              document.body.appendChild(el)
              place(p)
            },
            onUpdate: (p) => {
              props = p
              renderer?.updateProps({ ...p, close })
              place(p)
            },
            onKeyDown: (p) => {
              if (p.event.key === 'Escape') {
                close()
                return true
              }
              return renderer?.ref?.onKeyDown(p) ?? false
            },
            onExit: () => {
              el?.remove()
              renderer?.destroy()
              props = null
            }
          }
        }
      })
    ]
  }
})
