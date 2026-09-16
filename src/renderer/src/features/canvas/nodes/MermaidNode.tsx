import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import mermaid from 'mermaid'
import { memo, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { useEditMode } from './useEditMode'

let initializedTheme: string | null = null
let renderSeq = 0
const DEFAULT = 'graph TD\n  A[Idea] --> B[Plan]\n  B --> C[Ship]'

/** Mermaid diagram. Double-click to edit the source in a floating editor with live preview. */
export const MermaidNode = memo(function MermaidNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [source, setSource] = useState(String(data.object.data.source ?? DEFAULT))
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const theme = useAppSelector((s) => s.ui.theme)
  const renderId = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const latest = useRef(source)
  latest.current = source
  const textarea = useRef<HTMLTextAreaElement>(null)

  const { editing, setEditing, root } = useEditMode(selected, () => persist([{ id, data: { ...data.object.data, source: latest.current } }]), !!data.autoEdit)

  useEffect(() => {
    if (editing) {
      const el = textarea.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  useEffect(() => {
    const mTheme = theme === 'dark' ? 'dark' : 'neutral'
    if (initializedTheme !== mTheme) {
      mermaid.initialize({ startOnLoad: false, theme: mTheme, securityLevel: 'strict', fontFamily: 'Jost Variable, sans-serif' })
      initializedTheme = mTheme
    }
    let cancelled = false
    const t = setTimeout(() => {
      mermaid
        // unique id per render: mermaid removes elements with the same id, which would blank the current preview
        .render(`${renderId}-${renderSeq++}`, source)
        .then((r) => !cancelled && (setSvg(r.svg), setError(null)))
        .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [source, renderId, theme])

  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <NodeToolbar isVisible={editing} position={Position.Bottom} offset={10}>
        <div data-node-editor className="nodrag nowheel w-[440px] overflow-hidden rounded-xl border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground">
            <span>Mermaid</span>
            <a href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer" className="hover:text-foreground">
              Syntax ↗
            </a>
          </div>
          <textarea
            ref={textarea}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Tab') {
                e.preventDefault()
                const el = e.currentTarget
                const s = el.selectionStart
                setSource(source.slice(0, s) + '  ' + source.slice(el.selectionEnd))
                requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
              }
            }}
            spellCheck={false}
            rows={Math.min(14, Math.max(4, source.split('\n').length + 1))}
            className="block w-full resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
          />
          {error && <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error.split('\n')[0]}</div>}
        </div>
      </NodeToolbar>
      <div
        ref={root}
        onDoubleClick={() => setEditing(true)}
        className={cn('flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-card p-3 shadow-sm', selected && 'ring-2 ring-brand/70', editing && 'ring-2 ring-brand')}
      >
        {svg ? (
          <div className="h-full w-full [&_svg]:h-full [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : error ? (
          <pre className="text-xs whitespace-pre-wrap text-destructive">{error.split('\n')[0]}</pre>
        ) : null}
      </div>
      <Handles />
    </>
  )
})
