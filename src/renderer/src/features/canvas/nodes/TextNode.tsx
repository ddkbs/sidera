import { useReactFlow, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { HEADING_DEFAULT_SIZE } from '../textSize'

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [text, setText] = useState(String(data.object.data.text ?? ''))
  const [editing, setEditing] = useState(!!data.autoEdit)
  const ref = useRef<HTMLTextAreaElement>(null)
  const rf = useReactFlow()
  const size = Number(data.object.data.size ?? HEADING_DEFAULT_SIZE)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const commit = () => {
    setEditing(false)
    if (!text.trim()) {
      void rf.deleteElements({ nodes: [{ id }] })
      return
    }
    persist([{ id, data: { ...data.object.data, text } }])
  }

  return (
    <>
      <Resizer selected={selected} minWidth={60} minHeight={30} />
      <div className={cn('h-full w-full rounded-md', selected && !editing && 'ring-1 ring-brand/50')} onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Escape' && ref.current?.blur()}
            placeholder="Type something"
            style={{ fontSize: size }}
            className="nodrag nowheel h-full w-full resize-none bg-transparent p-1 leading-tight font-semibold tracking-tight outline-none"
          />
        ) : (
          <div style={{ fontSize: size }} className="h-full w-full overflow-hidden p-1 leading-tight font-semibold tracking-tight whitespace-pre-wrap">
            {text}
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})
