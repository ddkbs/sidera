import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChartEditor } from '@/features/charts/ChartEditor'
import { ChartView } from '@/features/charts/ChartView'
import { normalizeChart, type ChartData } from '@/features/charts/model'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { useEditMode } from './useEditMode'

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
  const [side, setSide] = useState<Position>(Position.Right)
  useEffect(() => {
    if (!editing || !root.current) return
    const r = root.current.getBoundingClientRect()
    const EDITOR_W = 500
    setSide(window.innerWidth - r.right > EDITOR_W ? Position.Right : r.left > EDITOR_W ? Position.Left : Position.Bottom)
  }, [editing, root])

  const moveItem = (row: number, x: number, y: number) => {
    const rows = latest.current.rows.map((r, i) => (i === row ? [r[0], String(x), String(y)] : r))
    update({ ...latest.current, rows })
  }

  return (
    <>
      <Resizer selected={selected} minWidth={220} minHeight={160} />
      <NodeToolbar isVisible={editing} position={side} offset={12} align={side === Position.Bottom ? 'center' : 'start'}>
        <ChartEditor data={chart} onChange={update} />
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
        {chart.title && <div className="mb-1.5 truncate text-sm font-semibold">{chart.title}</div>}
        <div className="min-h-0 flex-1">
          <ChartView data={chart} onMoveItem={moveItem} />
        </div>
      </div>
      <Handles />
    </>
  )
})
