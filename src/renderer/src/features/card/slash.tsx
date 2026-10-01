import { Extension, ReactRenderer, type Editor, type Range } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronRight, Code, FileText, Heading1, Heading2, Heading3, Highlighter, List, ListChecks, ListOrdered, Minus, Quote, Table2, Text, type AppIcon } from '@/components/icons'
import { HIGHLIGHT_COLORS } from './marks'
import { t, tRich } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface SlashItem {
  title: string
  /** translated group heading */
  group: string
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

/** The "/" menu items in the UI language (keywords match in English and the UI language). */
function slashItems(): SlashItem[] {
  const basic = t('slash.group.basic')
  const insert = t('slash.group.insert')
  const quote = t('slash.preview.quote')
  return [
    {
      title: t('slash.text'), group: basic, description: t('slash.text.desc'), keywords: `paragraph plain p ${t('slash.text.kw')}`, icon: Text,
      preview: <P>{quote}</P>,
      run: (e, r) => chain(e, r).setParagraph().run()
    },
    {
      title: t('slash.h1'), group: basic, hint: '#', description: t('slash.h1.desc'), keywords: `h1 title ${t('slash.h.kw')}`, icon: Heading1,
      preview: <><P className="text-xl font-semibold">{t('slash.preview.future')}</P><P className="mt-1 text-muted-foreground">{t('slash.preview.invent')}</P></>,
      run: (e, r) => chain(e, r).setHeading({ level: 1 }).run()
    },
    {
      title: t('slash.h2'), group: basic, hint: '##', description: t('slash.h2.desc'), keywords: `h2 subtitle ${t('slash.h.kw')}`, icon: Heading2,
      preview: <><P className="text-lg font-semibold">{t('slash.preview.future')}</P><P className="mt-1 text-muted-foreground">{t('slash.preview.invent')}</P></>,
      run: (e, r) => chain(e, r).setHeading({ level: 2 }).run()
    },
    {
      title: t('slash.h3'), group: basic, hint: '###', description: t('slash.h3.desc'), keywords: `h3 ${t('slash.h.kw')}`, icon: Heading3,
      preview: <><P className="text-base font-semibold">{t('slash.preview.future')}</P><P className="mt-1 text-muted-foreground">{t('slash.preview.invent')}</P></>,
      run: (e, r) => chain(e, r).setHeading({ level: 3 }).run()
    },
    {
      title: t('slash.h4'), group: basic, hint: '####', description: t('slash.h4.desc'), keywords: `h4 ${t('slash.h.kw')}`, icon: Heading4,
      preview: <><P className="font-semibold">{t('slash.preview.future')}</P><P className="mt-1 text-muted-foreground">{quote}</P></>,
      run: (e, r) => chain(e, r).setHeading({ level: 4 }).run()
    },
    {
      title: t('slash.bullets'), group: basic, hint: '-', description: t('slash.bullets.desc'), keywords: `ul bullets unordered ${t('slash.bullets.kw')}`, icon: List,
      preview: <ul className="list-disc pl-4 text-[13px] leading-snug"><li>{t('slash.preview.ideas')}</li><li>{t('slash.preview.questions')}</li><li>{t('slash.preview.nextSteps')}</li></ul>,
      run: (e, r) => chain(e, r).toggleBulletList().run()
    },
    {
      title: t('slash.numbered'), group: basic, hint: '1.', description: t('slash.numbered.desc'), keywords: `ol numbers ordered ${t('slash.numbered.kw')}`, icon: ListOrdered,
      preview: <ol className="list-decimal pl-4 text-[13px] leading-snug"><li>{t('slash.preview.research')}</li><li>{t('slash.preview.sketch')}</li><li>{t('slash.preview.ship')}</li></ol>,
      run: (e, r) => chain(e, r).toggleOrderedList().run()
    },
    {
      title: t('slash.todo'), group: basic, hint: '[]', description: t('slash.todo.desc'), keywords: `todo task checkbox check ${t('slash.todo.kw')}`, icon: ListChecks,
      preview: <div className="space-y-1 text-[13px]"><label className="flex items-center gap-1.5"><input type="checkbox" defaultChecked readOnly /> <s className="text-muted-foreground">{t('slash.preview.draft')}</s></label><label className="flex items-center gap-1.5"><input type="checkbox" readOnly /> {t('slash.preview.review')}</label></div>,
      run: (e, r) => chain(e, r).toggleTaskList().run()
    },
    {
      title: t('slash.quote'), group: basic, hint: '>', description: t('slash.quote.desc'), keywords: `blockquote citation ${t('slash.quote.kw')}`, icon: Quote,
      preview: <div className="border-l-2 border-foreground/40 pl-2 text-[13px] leading-snug">{quote}</div>,
      run: (e, r) => chain(e, r).toggleBlockquote().run()
    },
    {
      title: t('slash.code'), group: basic, hint: '```', description: t('slash.code.desc'), keywords: 'code pre snippet', icon: Code,
      preview: <pre className="rounded bg-muted px-2 py-1 font-mono text-[11px]">const idea = invent()</pre>,
      run: (e, r) => chain(e, r).toggleCodeBlock().run()
    },
    {
      title: t('slash.toggle'), group: basic, hint: '>>', description: t('slash.toggle.desc'), keywords: `toggle collapse details accordion fold ${t('slash.toggle.kw')}`, icon: ChevronRight,
      preview: <div className="text-[13px] leading-snug"><div className="flex items-center gap-1 font-medium"><ChevronRight className="size-3.5 rotate-90" />{t('slash.preview.details')}</div><div className="pl-4.5 text-muted-foreground">{t('slash.preview.hide')}</div></div>,
      run: (e, r) => chain(e, r).setDetails().run()
    },
    {
      title: t('slash.table'), group: basic, hint: '|||', description: t('slash.table.desc'), keywords: `table grid rows columns spreadsheet ${t('slash.table.kw')}`, icon: Table2,
      preview: <table className="w-full border-collapse text-[11px]"><tbody><tr className="bg-muted"><th className="border px-1.5 py-0.5 text-left">{t('account.name')}</th><th className="border px-1.5 py-0.5 text-left">{t('slash.preview.role')}</th></tr><tr><td className="border px-1.5 py-0.5">Ada</td><td className="border px-1.5 py-0.5">{t('slash.preview.maths')}</td></tr></tbody></table>,
      run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    {
      title: t('slash.divider'), group: basic, hint: '---', description: t('slash.divider.desc'), keywords: `hr line separator rule ${t('slash.divider.kw')}`, icon: Minus,
      preview: <><P>{t('slash.preview.above')}</P><hr className="my-1.5 border-border" /><P>{t('slash.preview.below')}</P></>,
      run: (e, r) => chain(e, r).setHorizontalRule().run()
    },
    {
      title: t('slash.link'), group: insert, hint: '@', description: t('slash.link.desc'), keywords: `mention card link backlink page ${t('slash.link.kw')}`, icon: FileText,
      preview: <P>{tRich('slash.preview.see', { card: <span className="rounded bg-brand/10 px-1 font-medium text-brand">@{t('slash.preview.researchNotes')}</span> })}</P>,
      run: (e, r) => chain(e, r).insertContent('@').run()
    },
    {
      title: t('format.highlight'), group: insert, description: t('slash.highlight.desc'), keywords: `highlight marker color colour yellow mark ${t('slash.highlight.kw')}`, icon: Highlighter,
      preview: <P>{tRich('slash.preview.standOut', { mark: <mark style={{ background: HIGHLIGHT_COLORS[3].value, borderRadius: 3, padding: '0 2px' }}>{t('slash.preview.standOutMark')}</mark> })}</P>,
      run: (e, r) => chain(e, r).setHighlight({ color: HIGHLIGHT_COLORS[3].value }).run()
    }
  ]
}

export function filterSlash(query: string): SlashItem[] {
  const q = query.toLowerCase().trim()
  return slashItems().filter((i) => !q || i.title.toLowerCase().includes(q) || i.keywords.toLowerCase().includes(q))
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
    return <div className="w-72 rounded-xl border bg-popover px-3 py-2.5 text-sm text-muted-foreground shadow-xl">{t('palette.noResults')}</div>
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
          {t('slash.closeMenu')}
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
        decorationContent: t('slash.typeToSearch'),
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
