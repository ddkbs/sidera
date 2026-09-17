import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Table2, Trash2 } from '@/components/icons'
import { cn } from '@/lib/utils'

const Btn = ({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onMouseDown={(e) => (e.preventDefault(), onClick())}
    className={cn(
      'grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground',
      danger && 'hover:bg-destructive/10 hover:text-destructive'
    )}
  >
    {children}
  </button>
)

const Sep = () => <div className="mx-0.5 h-5 w-px bg-border" />

/** Toolbar shown while the caret is inside a table: add/remove rows & columns, header, delete. */
export function TableToolbar({ editor }: { editor: Editor }) {
  const c = () => editor.chain().focus()
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableToolbar"
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor }) => editor.isEditable && editor.isActive('table')}
      className="card-table-toolbar flex items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-xl"
    >
      <Btn label="Insert column before" onClick={() => c().addColumnBefore().run()}>
        <ArrowLeft className="size-4" />
      </Btn>
      <Btn label="Insert column after" onClick={() => c().addColumnAfter().run()}>
        <ArrowRight className="size-4" />
      </Btn>
      <Btn label="Delete column" onClick={() => c().deleteColumn().run()}>
        <Minus className="size-4 rotate-90" />
      </Btn>
      <Sep />
      <Btn label="Insert row above" onClick={() => c().addRowBefore().run()}>
        <ArrowUp className="size-4" />
      </Btn>
      <Btn label="Insert row below" onClick={() => c().addRowAfter().run()}>
        <ArrowDown className="size-4" />
      </Btn>
      <Btn label="Delete row" onClick={() => c().deleteRow().run()}>
        <Minus className="size-4" />
      </Btn>
      <Sep />
      <Btn label="Toggle header row" onClick={() => c().toggleHeaderRow().run()}>
        <Table2 className="size-4" />
      </Btn>
      <Btn label="Delete table" danger onClick={() => c().deleteTable().run()}>
        <Trash2 className="size-4" />
      </Btn>
    </BubbleMenu>
  )
}
