import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { TableKit } from '@tiptap/extension-table'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import type { DocJSON } from '@shared/types'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { BlockInputRules } from './blocks'
import { EditorBubbleMenu } from './EditorBubbleMenu'
import { CardMention, handleMentionClick } from './mention'
import { SlashCommand } from './slash'
import { TableToolbar } from './TableToolbar'
import './editor.css'

/** TaskItem + a stable `id` attribute (`data-task-id`) so comments can reference a task across reorders/inserts. */
const TaskItemWithId = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-task-id'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.id ? { 'data-task-id': attrs.id } : {})
      }
    }
  }
})

interface Props {
  content: DocJSON
  onChange: (doc: DocJSON) => void
  placeholder?: string
  className?: string
  autofocus?: boolean
  editable?: boolean
}

/** Rich text editor for card content. Uncontrolled after mount — remount (key) to load a different card. */
export function CardEditor({ content, onChange, placeholder = "Write, type '/' for commands or '@' to link a card…", className, autofocus, editable = true }: Props) {
  const spellcheck = useAppSelector((s) => s.settings.editor.spellcheck)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef(onChange)
  latest.current = onChange
  const pending = useRef<DocJSON | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [1, 2, 3, 4] } }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItemWithId.configure({ nested: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TableKit.configure({ table: { resizable: true, allowTableNodeSelection: true } }),
      // `persist` keeps the open/closed state of a toggle in the document
      Details.configure({ persist: true, HTMLAttributes: { class: 'toggle-block' } }),
      DetailsSummary,
      DetailsContent,
      BlockInputRules,
      CardMention,
      SlashCommand
    ],
    content,
    editable,
    autofocus: autofocus ? 'end' : false,
    editorProps: { attributes: { class: 'prose-canvas focus:outline-none', spellcheck: String(spellcheck) } },
    onUpdate: ({ editor }) => {
      pending.current = editor.getJSON() as DocJSON
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, 400)
    }
  })

  function flush() {
    if (pending.current) latest.current(pending.current)
    pending.current = null
  }

  useEffect(() => () => (clearTimeout(timer.current), flush()), [])

  return (
    <>
      {editor && editable && (
        <>
          <EditorBubbleMenu editor={editor} />
          <TableToolbar editor={editor} />
        </>
      )}
      <EditorContent editor={editor} onClick={handleMentionClick} className={cn('min-h-24', className)} />
    </>
  )
}
