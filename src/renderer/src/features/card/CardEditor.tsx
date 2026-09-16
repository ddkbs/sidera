import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import type { DocJSON } from '@shared/types'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { CardMention, handleMentionClick } from './mention'
import { SlashCommand } from './slash'
import './editor.css'

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
      TaskItem.configure({ nested: true }),
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

  return <EditorContent editor={editor} onClick={handleMentionClick} className={cn('min-h-24', className)} />
}
