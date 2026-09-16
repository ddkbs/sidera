import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import { PALETTE, color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { persist, type ObjectNode } from '../types'
import { Resizer } from './NodeChrome'

export const SectionNode = memo(function SectionNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [title, setTitle] = useState(String(data.object.data.title ?? 'Section'))
  const [col, setCol] = useState(data.object.color ?? 'blue')
  const c = color(col)
  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <NodeToolbar isVisible={selected} position={Position.Top} offset={36}>
        <div className="flex items-center gap-1 rounded-full border bg-popover p-1 shadow-md">
          {Object.keys(PALETTE).map((name) => (
            <button
              key={name}
              aria-label={name}
              onClick={() => {
                setCol(name)
                persist([{ id, color: name }])
              }}
              className={cn('size-5 rounded-full border-2 transition', name === col ? 'scale-110 border-foreground/60' : 'border-transparent')}
              style={{ background: PALETTE[name].fg }}
            />
          ))}
        </div>
      </NodeToolbar>
      <div className="h-full w-full rounded-2xl border-2" style={{ background: c.bg, borderColor: c.border }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => persist([{ id, data: { ...data.object.data, title } }])}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          size={Math.max(6, title.length)}
          className="nodrag absolute -top-8 left-1 rounded-md bg-transparent px-1.5 py-0.5 text-sm font-semibold outline-none focus:bg-background"
          style={{ color: c.fg }}
        />
      </div>
    </>
  )
})
