import { type NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import { color } from '@/lib/colors'
import { persist, type ObjectNode } from '../types'
import { Resizer } from './NodeChrome'

export const SectionNode = memo(function SectionNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [title, setTitle] = useState(String(data.object.data.title ?? 'Section'))
  const c = color(data.object.color ?? 'blue')
  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
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
