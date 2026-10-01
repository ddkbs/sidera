import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { addChild, addSibling, flatten, layoutTree, outdent, parseTree, remove, rename, serializeTree, type MindTree } from '../mindmap'
import { persist, type ObjectNode } from '../types'
import { Handles, Resizer } from './NodeChrome'
import { useEditMode } from './useEditMode'
import { t, useLang } from '@/lib/i18n'

/** Starter outline for a new mindmap, in the UI language. */
const defaultOutline = (): string =>
  `${t('mindmap.central')}\n  - ${t('mindmap.branch', { n: 'A' })}\n    - ${t('mindmap.detail')}\n  - ${t('mindmap.branch', { n: 'B' })}\n  - ${t('mindmap.branch', { n: 'C' })}`
const PAD = 12

/**
 * Mindmap edited in place: double-click a topic to rename it, Enter = sibling, Tab = new child,
 * Shift+Tab = outdent, Backspace on an empty topic removes it. Click outside / Esc to finish.
 */
export const MindmapNode = memo(function MindmapNode({ id, data, selected, width = 480, height = 320 }: NodeProps<ObjectNode>) {
  useLang()
  const [tree, setTree] = useState<MindTree>(() => parseTree(String(data.object.data.source ?? defaultOutline())))
  const [focusId, setFocusId] = useState<string | null>(null)
  const latest = useRef(tree)
  latest.current = tree
  const updateInternals = useUpdateNodeInternals()

  const { editing, setEditing, root } = useEditMode(selected, () => {
    // drop empty topics, then persist
    let t = latest.current
    for (const e of flatten(t).reverse()) if (e.parent && !e.node.label.trim()) t = remove(t, e.node.id).tree
    setTree(t)
    setFocusId(null)
    persist([{ id, data: { ...data.object.data, source: serializeTree(t) } }])
  }, !!data.autoEdit)

  // adopt outline changes made elsewhere (e.g. MCP) while not editing
  const externalSource = String(data.object.data.source ?? defaultOutline())
  useEffect(() => {
    if (!editing && externalSource !== serializeTree(latest.current)) setTree(parseTree(externalSource))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSource])

  const layout = useMemo(() => layoutTree(tree), [tree])
  const scale = Math.min((width - PAD * 2) / Math.max(1, layout.width), (height - PAD * 2) / Math.max(1, layout.height), 1.6)
  const ox = (width - layout.width * scale) / 2
  const oy = (height - layout.height * scale) / 2
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))

  useEffect(() => updateInternals(id), [id, width, height, updateInternals])

  const inputs = useRef(new Map<string, HTMLInputElement>())
  const selectOnFocus = useRef(!!data.autoEdit)
  useLayoutEffect(() => {
    if (!editing) return
    const el = inputs.current.get(focusId ?? tree.id)
    if (!el || document.activeElement === el) return
    el.focus()
    // entering a topic by double-click selects its text so typing replaces it
    if (selectOnFocus.current) el.select()
    else el.setSelectionRange(el.value.length, el.value.length)
    selectOnFocus.current = false
  }, [editing, focusId, tree])

  const startEdit = (nodeId: string) => {
    selectOnFocus.current = true
    setFocusId(nodeId)
    setEditing(true)
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, nodeId: string) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      const r = addSibling(tree, nodeId)
      setTree(r.tree)
      setFocusId(r.id)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) setTree(outdent(tree, nodeId))
      else {
        const r = addChild(tree, nodeId)
        setTree(r.tree)
        setFocusId(r.id)
      }
    } else if (e.key === 'Backspace' && !e.currentTarget.value) {
      e.preventDefault()
      const r = remove(tree, nodeId)
      setTree(r.tree)
      setFocusId(r.focus)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const order = flatten(tree).map((x) => x.node.id)
      const i = order.indexOf(nodeId) + (e.key === 'ArrowDown' ? 1 : -1)
      if (order[i]) setFocusId(order[i])
    }
  }

  return (
    <>
      <Resizer selected={selected} minWidth={200} minHeight={120} />
      <div
        ref={root}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).dataset.topic === undefined) startEdit(tree.id)
        }}
        className={cn(
          'relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm transition-colors',
          selected && 'ring-2 ring-brand/70',
          editing && 'nodrag nowheel cursor-default bg-brand/[0.03] ring-2 ring-brand'
        )}
      >
        <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
          <g transform={`translate(${ox},${oy}) scale(${scale})`}>
            {layout.nodes.map((n) => {
              const p = n.parent ? byId.get(n.parent) : null
              if (!p) return null
              const x1 = p.x + p.width / 2
              const x2 = n.x - n.width / 2
              return <path key={n.id} d={`M${x1},${p.y} C${(x1 + x2) / 2},${p.y} ${(x1 + x2) / 2},${n.y} ${x2},${n.y}`} fill="none" stroke="var(--border)" strokeWidth={1.5 / scale} />
            })}
          </g>
        </svg>
        {layout.nodes.map((n) => {
          const isRoot = !n.parent
          const style = {
            left: ox + n.x * scale,
            top: oy + n.y * scale,
            width: n.width * scale,
            height: n.height * scale,
            fontSize: (isRoot ? 13 : 12) * scale,
            borderRadius: (isRoot ? n.height / 2 : 8) * scale
          }
          const cls = cn(
            'absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border px-2 text-center',
            isRoot ? 'bg-primary font-semibold text-primary-foreground' : 'bg-secondary font-medium text-foreground'
          )
          return editing ? (
            <input
              key={n.id}
              ref={(el) => void (el ? inputs.current.set(n.id, el) : inputs.current.delete(n.id))}
              value={n.label}
              placeholder={t('mindmap.topic')}
              onChange={(e) => setTree(rename(tree, n.id, e.target.value))}
              onKeyDown={(e) => onKey(e, n.id)}
              onFocus={() => setFocusId(n.id)}
              style={style}
              className={cn(
                cls,
                'nodrag cursor-text border-dashed border-brand/40 outline-none placeholder:text-muted-foreground',
                'focus:border-solid focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--brand)_35%,transparent)]',
                !isRoot && 'focus:bg-background'
              )}
            />
          ) : (
            <div key={n.id} data-topic onDoubleClick={(e) => (e.stopPropagation(), startEdit(n.id))} style={style} className={cn(cls, 'cursor-text truncate')}>
              <span className="truncate">{n.label || <span className="opacity-50">{t('mindmap.topic')}</span>}</span>
            </div>
          )
        })}
        {editing && (
          <div className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
            ↩ sibling · ⇥ child · ⇧⇥ outdent · esc done
          </div>
        )}
      </div>
      <Handles />
    </>
  )
})
