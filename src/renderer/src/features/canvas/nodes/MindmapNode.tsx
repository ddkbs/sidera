import type { NodeProps } from '@xyflow/react'
import { memo, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { layoutMindmap, parseOutline } from '../mindmap'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

const DEFAULT = 'Central idea\n  - Branch A\n    - Detail\n  - Branch B\n  - Branch C'

export const MindmapNode = memo(function MindmapNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [source, setSource] = useState(String(data.object.data.source ?? DEFAULT))
  const [editing, setEditing] = useState(!!data.autoEdit)
  const layout = useMemo(() => layoutMindmap(parseOutline(source)), [source])
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))

  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <div onDoubleClick={() => setEditing(true)} className={cn('flex h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm', selected && 'ring-2 ring-brand/70')}>
        {editing && (
          <textarea
            autoFocus
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => {
              setEditing(false)
              persist([{ id, data: { ...data.object.data, source } }])
            }}
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault()
                const t = e.currentTarget
                const s = t.selectionStart
                setSource(source.slice(0, s) + '  ' + source.slice(t.selectionEnd))
                requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2))
              }
            }}
            className="nodrag nowheel w-2/5 resize-none border-r bg-muted/40 p-3 font-mono text-xs outline-none"
          />
        )}
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className="min-w-0 flex-1" preserveAspectRatio="xMidYMid meet">
          {layout.nodes.map((n) => {
            const p = n.parent ? byId.get(n.parent) : null
            if (!p) return null
            const x1 = p.x + p.width / 2
            const x2 = n.x - n.width / 2
            return <path key={`e${n.id}`} d={`M${x1},${p.y} C${(x1 + x2) / 2},${p.y} ${(x1 + x2) / 2},${n.y} ${x2},${n.y}`} fill="none" stroke="var(--border)" strokeWidth={1.5} />
          })}
          {layout.nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x - n.width / 2},${n.y - n.height / 2})`}>
              <rect
                width={n.width}
                height={n.height}
                rx={n.depth === 0 && !n.parent ? 15 : 8}
                fill={!n.parent ? 'var(--primary)' : 'var(--secondary)'}
                stroke="var(--border)"
              />
              <text x={n.width / 2} y={n.height / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={!n.parent ? 600 : 500} fill={!n.parent ? 'var(--primary-foreground)' : 'var(--foreground)'}>
                {n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <Handles />
    </>
  )
})
