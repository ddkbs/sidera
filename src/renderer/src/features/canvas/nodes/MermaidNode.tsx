import { NodeToolbar, Position, type NodeProps } from '@xyflow/react'
import mermaid from 'mermaid'
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { addConnectedNode, getNodeLabel, isFlowchart, nodeIdFromSvg, renameNode } from '../mermaidEdit'
import { FlowchartEditor } from '../FlowchartEditor'
import { Pencil } from '@/components/icons'
import { record } from '@/lib/undo'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { useEditMode } from './useEditMode'
import { useEditorSide } from './useEditorSide'

let initializedTheme: string | null = null
let renderSeq = 0
const DEFAULT = 'graph TD\n  A[Idea] --> B[Plan]\n  B --> C[Ship]'

/**
 * Mermaid diagram. Double-click a box to rename it in place (Enter saves, Tab adds a connected box),
 * double-click empty space (or "Edit" in the toolbar) to open the editor: nodes, connections, layout and code.
 */
export const MermaidNode = memo(function MermaidNode({ id, data, selected }: NodeProps<ObjectNode>) {
  const [source, setSource] = useState(String(data.object.data.source ?? DEFAULT))
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const theme = useAppSelector((s) => s.ui.theme)
  const renderId = 'm' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const latest = useRef(source)
  latest.current = source
  const dataRef = useRef(data.object.data)
  dataRef.current = data.object.data
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [labelEdit, setLabelEdit] = useState<{ id: string; value: string; left: number; top: number; width: number; height: number } | null>(null)
  const pendingEdit = useRef<string | null>(null)
  const labelInput = useRef<HTMLInputElement>(null)
  // guards against the blur that fires when the input unmounts after Enter/Tab
  const labelActive = useRef(false)

  const write = (next: string) => {
    clearTimeout(saveTimer.current)
    persist([{ id, data: { ...dataRef.current, source: next } }])
  }
  /** Persist a finished change and make it undoable. */
  const commit = (before: string, after: string, label: string) => {
    write(after)
    if (before === after) return
    // updateObjects doesn't refetch the board, so also show the restored source locally
    const restore = (value: string) => {
      latest.current = value
      setSource(value)
      write(value)
    }
    record({ label, undo: () => restore(before), redo: () => restore(after) })
  }

  /** Open the inline label editor over the rendered box with this flowchart id. */
  const editBox = (nodeId: string) => {
    const container = root.current
    const match = [...(container?.querySelectorAll<SVGGElement>('g.node') ?? [])].find((x) => nodeIdFromSvg(x.id) === nodeId)
    if (!container || !match) return false
    const r = match.getBoundingClientRect()
    const c = container.getBoundingClientRect()
    const zoom = c.width / container.offsetWidth || 1
    labelActive.current = true
    setLabelEdit({
      id: nodeId,
      value: getNodeLabel(latest.current, nodeId) ?? match.textContent?.trim() ?? nodeId,
      left: (r.left - c.left) / zoom,
      top: (r.top - c.top) / zoom,
      width: Math.max(80, r.width / zoom),
      height: Math.max(28, r.height / zoom)
    })
    return true
  }

  useLayoutEffect(() => {
    if (labelEdit) {
      labelInput.current?.focus()
      labelInput.current?.select()
    }
  }, [labelEdit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // after adding a box, open it for editing once the diagram re-rendered
  useEffect(() => {
    if (pendingEdit.current && editBox(pendingEdit.current)) pendingEdit.current = null
  }, [svg]) // eslint-disable-line react-hooks/exhaustive-deps

  const finishLabel = (mode: 'save' | 'cancel' | 'next') => {
    if (!labelEdit || !labelActive.current) return
    labelActive.current = false
    const current = labelEdit
    setLabelEdit(null)
    if (mode === 'cancel') return
    const before = latest.current
    let next = current.value.trim() ? renameNode(before, current.id, current.value.trim()) : before
    if (mode === 'next') {
      const added = addConnectedNode(next, current.id)
      next = added.source
      pendingEdit.current = added.id
    }
    if (next !== before) {
      latest.current = next
      setSource(next)
      // inside the editor the session commit covers it; on the canvas it's its own undo step
      if (editing) scheduleSave(next)
      else commit(before, next, mode === 'next' ? 'Add flowchart step' : 'Rename flowchart box')
    }
  }

  const externalSource = String(data.object.data.source ?? DEFAULT)
  const sessionStart = useRef(source)
  const { editing, setEditing, root } = useEditMode(selected, () => commit(sessionStart.current, latest.current, 'Edit diagram'), !!data.autoEdit)
  useEffect(() => {
    if (editing) sessionStart.current = latest.current
  }, [editing])
  const toolbar = useEditorSide(editing, root)

  const scheduleSave = (next: string) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => write(next), 400)
  }
  const update = (next: string) => {
    setSource(next)
    scheduleSave(next)
  }
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  // adopt source changes made elsewhere (e.g. MCP, undo) while not editing
  useEffect(() => {
    if (!editing && !labelEdit && externalSource !== latest.current) setSource(externalSource)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSource])

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

  const flowchart = isFlowchart(source)

  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <NodeToolbar isVisible={selected && !editing && !labelEdit} position={Position.Top} offset={10}>
        <div className="flex items-center rounded-full border bg-popover p-1 shadow-md">
          <button
            onClick={() => setEditing(true)}
            className="flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="size-3.5" /> {flowchart ? 'Edit flowchart' : 'Edit diagram'}
          </button>
        </div>
      </NodeToolbar>
      <NodeToolbar isVisible={editing} {...toolbar}>
        <FlowchartEditor source={source} error={error} onChange={update} />
      </NodeToolbar>
      <div
        ref={root}
        onDoubleClick={(e) => {
          const g = (e.target as Element).closest('g.node')
          const nodeId = g && flowchart ? nodeIdFromSvg(g.id) : null
          if (nodeId && editBox(nodeId)) return
          setEditing(true)
        }}
        className={cn(
          'group/mermaid relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-card p-3 shadow-sm',
          selected && 'ring-2 ring-brand/70',
          (editing || labelEdit) && 'ring-2 ring-brand',
          flowchart && '[&_g.node]:cursor-text'
        )}
      >
        {labelEdit && (
          <input
            ref={labelInput}
            value={labelEdit.value}
            onChange={(e) => setLabelEdit({ ...labelEdit, value: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') finishLabel('save')
              else if (e.key === 'Escape') finishLabel('cancel')
              else if (e.key === 'Tab') {
                e.preventDefault()
                finishLabel('next')
              }
            }}
            onBlur={() => finishLabel('save')}
            style={{ left: labelEdit.left, top: labelEdit.top, width: labelEdit.width, height: labelEdit.height }}
            className="nodrag nowheel absolute z-10 rounded-md border border-brand bg-background px-2 text-center text-sm shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_35%,transparent)] outline-none"
          />
        )}
        {selected && !editing && !labelEdit && flowchart && (
          <div className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 backdrop-blur transition group-hover/mermaid:opacity-100">
            double-click a box to rename · ⇥ adds a step · empty space opens the editor
          </div>
        )}
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
