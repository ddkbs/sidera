import { NodeToolbar, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { Link2, Unlink } from '@/components/icons'
import { cn } from '@/lib/utils'
import { ChartEditor } from '@/features/charts/ChartEditor'
import { ChartView } from '@/features/charts/ChartView'
import { normalizeChart, type ChartData } from '@shared/charts'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { useEditMode } from './useEditMode'
import { useEditorSide } from './useEditorSide'

/** Charts & structured diagrams. Double-click opens a table editor; changes save as you type. */
export const ChartNode = memo(function ChartNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [chart, setChart] = useState<ChartData>(() => normalizeChart(data.object.data as Partial<ChartData>))
  const latest = useRef(chart)
  latest.current = chart
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = () => {
    clearTimeout(timer.current)
    persist([{ id, data: { ...latest.current } as unknown as Record<string, unknown> }])
  }
  const { editing, setEditing, root } = useEditMode(selected, save, !!data.autoEdit)

  const update = (next: ChartData) => {
    setChart(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(save, 400)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // Open the editor on whichever side of the node has room on screen
  const toolbar = useEditorSide(editing, root)

  // adopt changes made elsewhere (e.g. an AI agent via MCP) unless the user is editing
  const external = JSON.stringify(data.object.data)
  useEffect(() => {
    if (!editing && external !== JSON.stringify(latest.current)) setChart(normalizeChart(JSON.parse(external) as Partial<ChartData>))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external])

  const moveItem = (row: number, x: number, y: number) => {
    const rows = latest.current.rows.map((r, i) => (i === row ? [r[0], String(x), String(y)] : r))
    update({ ...latest.current, rows })
  }

  return (
    <>
      <Resizer selected={selected} minWidth={220} minHeight={160} />
      <NodeToolbar isVisible={editing} {...toolbar}>
        <div data-node-editor className="flex flex-col gap-1.5">
          {chart.source && (
            <div className="flex items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <Link2 className="size-3.5 shrink-0 text-brand" />
              <span className="flex-1">The data follows its table — edit the table to change it.</span>
              <button
                onClick={() => {
                  const { source: _s, ...rest } = latest.current
                  update(rest)
                }}
                className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
              >
                <Unlink className="size-3.5" /> Unlink
              </button>
            </div>
          )}
          <ChartEditor data={chart} onChange={update} />
        </div>
      </NodeToolbar>
      <div
        ref={root}
        onDoubleClick={() => setEditing(true)}
        className={cn(
          'flex h-full w-full flex-col overflow-hidden rounded-xl border bg-card px-3 pt-2.5 pb-2 text-card-foreground shadow-sm',
          selected && 'ring-2 ring-brand/70',
          editing && 'ring-2 ring-brand'
        )}
      >
        {(chart.title || chart.source) && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{chart.title}</div>
            {chart.source && (
              <span title="Linked to a table: updates when the table changes" className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Link2 className="size-3" /> Table
              </span>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <ChartView data={chart} onMoveItem={moveItem} />
        </div>
      </div>
      <Handles />
    </>
  )
})
