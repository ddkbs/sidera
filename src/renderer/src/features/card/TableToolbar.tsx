import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Table2, Trash2 } from '@/components/icons'
import { t } from '@/lib/i18n'
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
      <Btn label={t('table.colBefore')} onClick={() => c().addColumnBefore().run()}>
        <ArrowLeft className="size-4" />
      </Btn>
      <Btn label={t('table.colAfter')} onClick={() => c().addColumnAfter().run()}>
        <ArrowRight className="size-4" />
      </Btn>
      <Btn label={t('table.colDelete')} onClick={() => c().deleteColumn().run()}>
        <Minus className="size-4 rotate-90" />
      </Btn>
      <Sep />
      <Btn label={t('table.rowAbove')} onClick={() => c().addRowBefore().run()}>
        <ArrowUp className="size-4" />
      </Btn>
      <Btn label={t('table.rowBelow')} onClick={() => c().addRowAfter().run()}>
        <ArrowDown className="size-4" />
      </Btn>
      <Btn label={t('table.rowDelete')} onClick={() => c().deleteRow().run()}>
        <Minus className="size-4" />
      </Btn>
      <Sep />
      <Btn label={t('table.headerRow')} onClick={() => c().toggleHeaderRow().run()}>
        <Table2 className="size-4" />
      </Btn>
      <Btn label={t('table.delete')} danger onClick={() => c().deleteTable().run()}>
        <Trash2 className="size-4" />
      </Btn>
    </BubbleMenu>
  )
}
