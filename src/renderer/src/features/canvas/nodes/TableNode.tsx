import type { NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { parseClipboardTable } from '@shared/charts'
import {
  coerceCell,
  displayType,
  emptyTable,
  formatCell,
  newColumnId,
  newRowId,
  normalizeTable,
  type TableColumnType,
  type TableData
} from '@shared/tables'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, Hash, Plus, Trash2, Type } from '@/components/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useT } from '@/lib/i18n'
import { record } from '@/lib/undo'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { api } from '@/store/api'
import type { ObjectNode } from '../types'
import { Handles } from './NodeChrome'
import { useAutoHeight, WidthResizer } from './autoHeight'

/** Active cell; r = -1 is the header (column names), 'title' edits the table title. */
type Active = { r: number; c: number } | 'title'

const safeTable = (raw: unknown): TableData => {
  try {
    return normalizeTable(raw)
  } catch {
    return emptyTable()
  }
}
const same = (a: Active | null, b: Active | null): boolean =>
  a === b || (!!a && !!b && a !== 'title' && b !== 'title' && a.r === b.r && a.c === b.c)

/**
 * Spreadsheet-like table on the board. Select the table, then click a cell to type;
 * Tab / Shift-Tab / Enter / arrows move, Esc cancels, pasting TSV/CSV fills cells.
 * Every committed cell or structure change is one undo step; linked charts follow in main.
 */
export const TableNode = memo(function TableNode({ id, data, selected, height }: NodeProps<ObjectNode>) {
  // `t` is the table throughout this component, so the translator is `tr`
  const tr = useT()
  const dispatch = useAppDispatch()
  const boardId = data.object.whiteboardId
  const [table, setTable] = useState<TableData>(() => safeTable(data.object.data))
  const latest = useRef(table)
  latest.current = table
  const [active, setActiveState] = useState<Active | null>(null)
  const activeRef = useRef<Active | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; r: number; c: number } | null>(null)
  const content = useRef<HTMLDivElement>(null)
  useAutoHeight(id, content, height, 60)

  const setActive = (a: Active | null, t: TableData = latest.current): void => {
    activeRef.current = a
    setActiveState(a)
    if (a === 'title') setDraft(t.title ?? '')
    else if (a) setDraft(a.r < 0 ? (t.columns[a.c]?.name ?? '') : String(t.rows[a.r]?.cells[t.columns[a.c]?.id] ?? ''))
  }

  // adopt changes made elsewhere (MCP, undo) unless a cell is being edited
  const external = JSON.stringify(data.object.data)
  useEffect(() => {
    if (!activeRef.current && external !== JSON.stringify(latest.current)) setTable(safeTable(JSON.parse(external)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external])
  useEffect(() => {
    if (!selected && activeRef.current) setActive(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  const save = async (t: TableData): Promise<void> => {
    await window.api.updateObjects([{ id, data: t as unknown as Record<string, unknown> }])
    dispatch(api.util.invalidateTags([{ type: 'Whiteboard', id: boardId }]))
  }

  /** Apply a new table: local state, persistence and one undo step. */
  const commit = (next: TableData, label: string): TableData => {
    const before = latest.current
    if (JSON.stringify(before) === JSON.stringify(next)) return before
    latest.current = next
    setTable(next)
    void save(next)
    record({
      label,
      undo: () => {
        setTable(before)
        return save(before)
      },
      redo: () => {
        setTable(next)
        return save(next)
      }
    })
    return next
  }

  const typeOf = (t: TableData, c: number): TableColumnType => displayType(t, c)

  /** The table with the current draft written into the active cell. */
  const withDraft = (t: TableData): TableData => {
    const a = activeRef.current
    if (!a) return t
    if (a === 'title') return draft.trim() === (t.title ?? '') ? t : { ...t, title: draft.trim() || undefined }
    const col = t.columns[a.c]
    if (!col) return t
    if (a.r < 0) return col.name === draft ? t : { ...t, columns: t.columns.map((c, i) => (i === a.c ? { ...c, name: draft } : c)) }
    const row = t.rows[a.r]
    if (!row || String(row.cells[col.id] ?? '') === draft) return t
    const cells = { ...row.cells }
    if (draft === '') delete cells[col.id]
    else cells[col.id] = col.type === 'number' ? coerceCell(draft, 'number') : draft
    return { ...t, rows: t.rows.map((r, i) => (i === a.r ? { ...r, cells } : r)) }
  }

  const commitDraft = (): TableData => commit(withDraft(latest.current), tr('tableNode.edit'))

  const blankRow = () => ({ id: newRowId(), cells: {} })

  /** Commit and move the active cell; moving past the last row appends one (fast data entry). */
  const move = (dr: number, dc: number): void => {
    const a = activeRef.current
    if (!a || a === 'title') return
    let t = withDraft(latest.current)
    let r = a.r + dr
    let c = a.c + dc
    if (c >= t.columns.length) {
      c = 0
      r += 1
    } else if (c < 0) {
      c = t.columns.length - 1
      r -= 1
    }
    if (r < -1) r = -1
    if (r >= t.rows.length) t = { ...t, rows: [...t.rows, blankRow()] }
    t = commit(t, tr('tableNode.edit'))
    setActive({ r, c }, t)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    e.stopPropagation()
    const a = activeRef.current
    const input = e.currentTarget
    if (e.key === 'Escape') {
      e.preventDefault()
      setActive(null)
      return
    }
    if (a === 'title') {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        commitDraft()
        setActive(table.columns.length ? { r: -1, c: 0 } : null)
      }
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      move(0, e.shiftKey ? -1 : 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      move(e.shiftKey ? -1 : 1, 0)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      move(e.key === 'ArrowUp' ? -1 : 1, 0)
    } else if (e.key === 'ArrowLeft' && input.selectionStart === 0 && input.selectionEnd === 0) {
      e.preventDefault()
      move(0, -1)
    } else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      e.preventDefault()
      move(0, 1)
    }
  }

  /** Paste a block of cells (Excel / Numbers / CSV) starting at the active cell; grows the table. */
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    const a = activeRef.current
    const text = e.clipboardData.getData('text/plain')
    if (!a || a === 'title' || (!text.includes('\t') && !text.includes('\n'))) return
    e.preventDefault()
    const cells = parseClipboardTable(text)
    const t0 = latest.current
    const columns = [...t0.columns]
    const width = Math.max(...cells.map((l) => l.length))
    while (a.c + width > columns.length) columns.push({ id: newColumnId(), name: tr('tableNode.column', { n: columns.length + 1 }) })
    let lines = cells
    if (a.r < 0) {
      // pasting into the header: first line = column names
      cells[0]?.forEach((v, j) => (columns[a.c + j] = { ...columns[a.c + j], name: v }))
      lines = cells.slice(1)
    }
    const start = Math.max(0, a.r)
    const rows = t0.rows.map((r) => ({ ...r, cells: { ...r.cells } }))
    lines.forEach((line, i) => {
      while (rows.length <= start + i) rows.push(blankRow())
      line.forEach((v, j) => {
        const col = columns[a.c + j]
        if (v === '') delete rows[start + i].cells[col.id]
        else rows[start + i].cells[col.id] = col.type === 'number' ? coerceCell(v, 'number') : v
      })
    })
    const next = commit({ ...t0, columns, rows }, tr('tableNode.paste'))
    setActive(a, next)
  }

  // ---- structure ----------------------------------------------------------
  const insertRow = (at: number): void => {
    const t = withDraft(latest.current)
    commit({ ...t, rows: [...t.rows.slice(0, at), blankRow(), ...t.rows.slice(at)] }, tr('chart.addRow'))
    setActive(null)
  }
  const deleteRow = (r: number): void => {
    const t = withDraft(latest.current)
    commit({ ...t, rows: t.rows.filter((_, i) => i !== r) }, tr('table.rowDelete'))
    setActive(null)
  }
  const insertColumn = (at: number): void => {
    const t = withDraft(latest.current)
    const col = { id: newColumnId(), name: tr('tableNode.column', { n: t.columns.length + 1 }) }
    const next = commit({ ...t, columns: [...t.columns.slice(0, at), col, ...t.columns.slice(at)] }, tr('tableNode.addColumn'))
    setActive({ r: -1, c: at }, next)
  }
  const deleteColumn = (c: number): void => {
    const t = withDraft(latest.current)
    if (t.columns.length <= 1) return
    const colId = t.columns[c].id
    commit(
      {
        ...t,
        columns: t.columns.filter((_, i) => i !== c),
        rows: t.rows.map((r) => {
          const { [colId]: _gone, ...cells } = r.cells
          return { ...r, cells }
        })
      },
      tr('table.colDelete')
    )
    setActive(null)
  }
  const setColumnType = (c: number, type: TableColumnType): void => {
    const t = withDraft(latest.current)
    const col = t.columns[c]
    const rows = t.rows.map((r) => (r.cells[col.id] === undefined ? r : { ...r, cells: { ...r.cells, [col.id]: type === 'number' ? coerceCell(r.cells[col.id], 'number') : String(r.cells[col.id]) } }))
    commit({ ...t, columns: t.columns.map((x, i) => (i === c ? { ...x, type } : x)), rows }, tr('tableNode.changeType'))
    setActive(null)
  }

  const activate = (a: Active) => (e: React.MouseEvent) => {
    if (!selected && e.detail < 2) return // first click selects the table
    e.stopPropagation()
    // keep focus where we put it (the cell input), not on the React Flow node wrapper
    e.preventDefault()
    if (same(activeRef.current, a)) return
    if (activeRef.current) commitDraft()
    setActive(a)
  }

  const cellInput = (cell: Active, align: 'left' | 'right', className?: string) => (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => {
        // moving to another cell already committed; only a real blur (click elsewhere) ends editing
        if (!same(activeRef.current, cell)) return
        commitDraft()
        setActive(null)
      }}
      className={cn('nodrag w-full min-w-0 bg-transparent outline-none', align === 'right' && 'text-right tabular-nums', className)}
    />
  )

  const types = table.columns.map((_, c) => typeOf(table, c))
  const cols = table.columns
  const openMenu = (r: number, c: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, r, c })
  }

  return (
    <>
      <WidthResizer selected={selected} minWidth={Math.max(160, cols.length * 60)} />
      <div
        data-table-node={id}
        className={cn(
          'group relative h-full w-full rounded-xl border bg-card text-card-foreground shadow-sm',
          selected && 'ring-2 ring-brand/70'
        )}
      >
        <div ref={content} className="px-1.5 pt-1.5 pb-1">
          {(table.title || selected) && (
            <div className="px-2 pt-1 pb-1.5" onMouseDown={activate('title')}>
              {active === 'title' ? (
                cellInput('title', 'left', 'text-sm font-semibold')
              ) : (
                <div className={cn('truncate text-sm font-semibold', !table.title && 'text-muted-foreground/70')}>{table.title || tr('tableNode.title')}</div>
              )}
            </div>
          )}
          <table className={cn('w-full table-fixed border-collapse text-[13.5px]', selected && 'nodrag nopan')}>
            <colgroup>
              {cols.map((c) => (
                <col key={c.id} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b">
                {cols.map((c, ci) => (
                  <th
                    key={c.id}
                    onMouseDown={activate({ r: -1, c: ci })}
                    onContextMenu={openMenu(-1, ci)}
                    className={cn(
                      'group/th relative h-8 px-2.5 text-left text-xs font-medium text-muted-foreground',
                      types[ci] === 'number' && 'text-right',
                      same(active, { r: -1, c: ci }) && 'bg-brand/8'
                    )}
                  >
                    {same(active, { r: -1, c: ci }) ? (
                      cellInput({ r: -1, c: ci }, types[ci] === 'number' ? 'right' : 'left', 'font-medium text-foreground')
                    ) : (
                      <span className="block truncate">{c.name || <span className="opacity-50">{tr('tableNode.column', { n: ci + 1 })}</span>}</span>
                    )}
                    {selected && !same(active, { r: -1, c: ci }) && (
                      <button
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setMenu({ x: r.left, y: r.bottom + 4, r: -1, c: ci })
                        }}
                        className={cn(
                          'absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 transition group-hover/th:opacity-100 hover:bg-accent hover:text-foreground',
                          types[ci] === 'number' ? 'left-1' : 'right-1'
                        )}
                        aria-label={tr('tableNode.columnOptions')}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, ri) => (
                <tr key={row.id} className="border-b border-border/50 last:border-0">
                  {cols.map((c, ci) => {
                    const isActive = same(active, { r: ri, c: ci })
                    const num = types[ci] === 'number'
                    return (
                      <td
                        key={c.id}
                        onMouseDown={activate({ r: ri, c: ci })}
                        onContextMenu={openMenu(ri, ci)}
                        className={cn('h-8 px-2.5 align-middle', num && 'text-right tabular-nums', isActive && 'bg-brand/8 shadow-[inset_0_0_0_1.5px_var(--brand)]', selected && !isActive && 'cursor-cell hover:bg-accent/60')}
                      >
                        {isActive ? cellInput({ r: ri, c: ci }, num ? 'right' : 'left') : <span className="block truncate">{formatCell(row.cells[c.id], types[ci])}</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && (
          <>
            <button
              onClick={() => insertRow(latest.current.rows.length)}
              className="nodrag absolute inset-x-6 -bottom-7 flex h-5 items-center justify-center gap-1 rounded-md text-xs text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100"
            >
              <Plus className="size-3.5" /> {tr('tableNode.row')}
            </button>
            <button
              onClick={() => insertColumn(latest.current.columns.length)}
              className="nodrag absolute inset-y-4 -right-7 flex w-5 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100"
              aria-label={tr('tableNode.addColumn')}
              title={tr('tableNode.addColumn')}
            >
              <Plus className="size-3.5" />
            </button>
          </>
        )}
      </div>
      <DropdownMenu open={!!menu} onOpenChange={(o) => !o && setMenu(null)} modal={false}>
        <DropdownMenuTrigger asChild>
          <span className="fixed size-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
        </DropdownMenuTrigger>
        {menu && (
          <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(e) => e.preventDefault()}>
            {menu.r >= 0 && (
              <>
                <DropdownMenuItem onClick={() => insertRow(menu.r)}>
                  <ArrowUp /> {tr('table.rowAbove')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => insertRow(menu.r + 1)}>
                  <ArrowDown /> {tr('table.rowBelow')}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => deleteRow(menu.r)}>
                  <Trash2 /> {tr('table.rowDelete')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => setColumnType(menu.c, 'text')} className={cn(types[menu.c] === 'text' && 'font-medium')}>
              <Type /> {tr('tableNode.textColumn')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setColumnType(menu.c, 'number')} className={cn(types[menu.c] === 'number' && 'font-medium')}>
              <Hash /> {tr('tableNode.numberColumn')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => insertColumn(menu.c)}>
              <ArrowLeft /> {tr('tableNode.colLeft')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => insertColumn(menu.c + 1)}>
              <ArrowRight /> {tr('tableNode.colRight')}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" disabled={cols.length <= 1} onClick={() => deleteColumn(menu.c)}>
              <Trash2 /> {tr('table.colDelete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        )}
      </DropdownMenu>
      <Handles />
    </>
  )
})
