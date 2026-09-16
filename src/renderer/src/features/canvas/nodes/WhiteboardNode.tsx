import type { NodeProps } from '@xyflow/react'
import { LayoutDashboard } from '@/components/icons'
import { memo } from 'react'
import { cn } from '@/lib/utils'
import { store } from '@/store'
import { navigate } from '@/store/ui'
import type { ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

export const WhiteboardNode = memo(function WhiteboardNode({ data, selected }: NodeProps<ObjectNode>) {
  const open = () => data.object.refId && store.dispatch(navigate({ type: 'whiteboard', id: data.object.refId }))
  return (
    <>
      <Resizer selected={selected} minWidth={160} minHeight={80} />
      <div
        onDoubleClick={open}
        className={cn(
          'relative flex h-full w-full flex-col justify-end overflow-hidden rounded-xl border bg-card p-4 shadow-sm',
          selected && 'ring-2 ring-brand/70'
        )}
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{ backgroundImage: 'radial-gradient(var(--canvas-dot) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
        />
        <div className="relative flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand">
            <LayoutDashboard className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{data.childName ?? 'Whiteboard'}</div>
            <div className="text-[11px] text-muted-foreground">Double-click to open</div>
          </div>
        </div>
      </div>
      <Handles />
    </>
  )
})
