import type { NodeProps } from '@xyflow/react'
import mermaid from 'mermaid'
import { memo, useEffect, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'

let initializedTheme: string | null = null

export const MermaidNode = memo(function MermaidNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [source, setSource] = useState(String(data.object.data.source ?? 'graph TD\n  A[Idea] --> B[Plan]\n  B --> C[Ship]'))
  const [editing, setEditing] = useState(!!data.autoEdit)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const renderId = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'neutral'
    if (initializedTheme !== theme) {
      mermaid.initialize({ startOnLoad: false, theme, securityLevel: 'strict', fontFamily: 'Geist Variable, sans-serif' })
      initializedTheme = theme
    }
    let cancelled = false
    mermaid
      .render(renderId, source)
      .then((r) => !cancelled && (setSvg(r.svg), setError(null)))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [source, renderId])

  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <div
        onDoubleClick={() => setEditing(true)}
        className={cn('flex h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm', selected && 'ring-2 ring-brand/70')}
      >
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
            className="nodrag nowheel w-1/2 resize-none border-r bg-muted/40 p-3 font-mono text-xs outline-none"
          />
        )}
        <div className="flex min-w-0 flex-1 items-center justify-center p-3 [&_svg]:h-full [&_svg]:max-w-full">
          {error ? <pre className="text-xs whitespace-pre-wrap text-destructive">{error.split('\n')[0]}</pre> : <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
        </div>
      </div>
      <Handles />
    </>
  )
})
