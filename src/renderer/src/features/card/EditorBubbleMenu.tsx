import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { useState } from 'react'
import { Bold, Code, Eraser, Highlighter, Italic, Link2, Strikethrough, Underline } from '@/components/icons'
import { cn } from '@/lib/utils'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from './marks'

const Btn = ({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onMouseDown={(e) => (e.preventDefault(), onClick())}
    className={cn('grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground', active && 'bg-accent text-brand')}
  >
    {children}
  </button>
)

const Sep = () => <div className="mx-0.5 h-5 w-px bg-border" />

/** Swatch grid shown under the "A" / highlighter buttons. */
function Swatches({
  items,
  current,
  onPick,
  onClear,
  clearLabel,
  render
}: {
  items: { name: string; value: string }[]
  current?: string
  onPick: (value: string) => void
  onClear: () => void
  clearLabel: string
  render: (value: string) => React.CSSProperties
}) {
  return (
    <div className="absolute top-full left-0 z-10 mt-1 w-[168px] rounded-lg border bg-popover p-1.5 shadow-xl">
      <div className="grid grid-cols-5 gap-1">
        {items.map((c) => (
          <button
            key={c.name}
            type="button"
            aria-label={c.name}
            title={c.name}
            onMouseDown={(e) => (e.preventDefault(), onPick(c.value))}
            className={cn('size-7 rounded-md border text-[13px] font-semibold', current === c.value && 'ring-2 ring-brand')}
            style={render(c.value)}
          >
            A
          </button>
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(e) => (e.preventDefault(), onClear())}
        className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        {clearLabel}
      </button>
    </div>
  )
}

/** Selection toolbar: marks, text colour, highlight, link and clear formatting. */
export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState<'text' | 'highlight' | null>(null)
  const textColor = editor.getAttributes('textStyle').color as string | undefined
  const highlight = editor.getAttributes('highlight').color as string | undefined

  const run = (fn: () => void) => () => {
    fn()
    setOpen(null)
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor, state }) => editor.isEditable && !state.selection.empty && !editor.isActive('codeBlock')}
      className="card-bubble-menu relative flex items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-xl"
      onMouseLeave={() => setOpen(null)}
    >
      <Btn label="Bold" active={editor.isActive('bold')} onClick={run(() => editor.chain().focus().toggleBold().run())}>
        <Bold className="size-4" />
      </Btn>
      <Btn label="Italic" active={editor.isActive('italic')} onClick={run(() => editor.chain().focus().toggleItalic().run())}>
        <Italic className="size-4" />
      </Btn>
      <Btn label="Underline" active={editor.isActive('underline')} onClick={run(() => editor.chain().focus().toggleUnderline().run())}>
        <Underline className="size-4" />
      </Btn>
      <Btn label="Strikethrough" active={editor.isActive('strike')} onClick={run(() => editor.chain().focus().toggleStrike().run())}>
        <Strikethrough className="size-4" />
      </Btn>
      <Btn label="Code" active={editor.isActive('code')} onClick={run(() => editor.chain().focus().toggleCode().run())}>
        <Code className="size-4" />
      </Btn>
      <Sep />
      <div className="relative">
        <Btn label="Text color" active={open === 'text' || Boolean(textColor)} onClick={() => setOpen((o) => (o === 'text' ? null : 'text'))}>
          <span className="text-[15px] leading-none font-semibold" style={textColor ? { color: textColor } : undefined}>
            A
          </span>
        </Btn>
        {open === 'text' && (
          <Swatches
            items={TEXT_COLORS}
            current={textColor}
            onPick={(v) => run(() => editor.chain().focus().setColor(v).run())()}
            onClear={run(() => editor.chain().focus().unsetColor().run())}
            clearLabel="Default color"
            render={(v) => ({ color: v })}
          />
        )}
      </div>
      <div className="relative">
        <Btn label="Highlight" active={open === 'highlight' || Boolean(highlight)} onClick={() => setOpen((o) => (o === 'highlight' ? null : 'highlight'))}>
          <Highlighter className="size-4" />
        </Btn>
        {open === 'highlight' && (
          <Swatches
            items={HIGHLIGHT_COLORS}
            current={highlight}
            onPick={(v) => run(() => editor.chain().focus().setHighlight({ color: v }).run())()}
            onClear={run(() => editor.chain().focus().unsetHighlight().run())}
            clearLabel="No highlight"
            render={(v) => ({ background: v })}
          />
        )}
      </div>
      <Sep />
      <Btn
        label="Link"
        active={editor.isActive('link')}
        onClick={run(() => {
          const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
          const href = window.prompt('Link URL', prev)
          if (href === null) return
          if (!href) editor.chain().focus().unsetLink().run()
          else editor.chain().focus().setLink({ href }).run()
        })}
      >
        <Link2 className="size-4" />
      </Btn>
      <Btn label="Clear formatting" onClick={run(() => editor.chain().focus().unsetAllMarks().run())}>
        <Eraser className="size-4" />
      </Btn>
    </BubbleMenu>
  )
}
