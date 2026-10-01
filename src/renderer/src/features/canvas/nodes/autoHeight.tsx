import { NodeResizeControl, ResizeControlVariant, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { persist } from '../types'

/**
 * Keep a node exactly as tall as its content (text boxes, tables) — but never below `min`: the user sets the width,
 * the height follows. `height` is the node's current height (NodeProps) so a refetch that
 * resets it to a stale stored value is corrected right away.
 */
export function useAutoHeight(id: string, content: RefObject<HTMLElement | null>, height: number | undefined, min = 32, paused = false): void {
  const rf = useReactFlow()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const el = content.current
    // paused while a corner drag sets the height by hand; re-fits right after
    if (!el || paused) return
    const fit = (): void => {
      const next = Math.max(min, Math.ceil(el.offsetHeight))
      const current = rf.getNode(id)?.height
      if (current !== undefined && Math.abs(next - current) < 2) return
      rf.setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, height: next } : n)))
      clearTimeout(timer.current)
      timer.current = setTimeout(() => persist([{ id, height: next }]), 400)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [id, content, height, min, paused, rf])
  useEffect(() => () => clearTimeout(timer.current), [])
}

/**
 * Left/right edge handles that change only the width (the height follows the content). With `onCorner`, corner
 * handles also resize the box freely (width + height); `onCorner(true)` on start, `onCorner(false)` on release.
 */
export function WidthResizer({ selected, minWidth = 120, minHeight = 24, onCorner }: { selected?: boolean; minWidth?: number; minHeight?: number; onCorner?: (active: boolean) => void }) {
  // stable callbacks: NodeResizeControl re-creates its drag handler when they change, which would end the drag
  const ref = useRef(onCorner)
  ref.current = onCorner
  const start = useCallback(() => ref.current?.(true), [])
  const end = useCallback(() => ref.current?.(false), [])
  if (!selected) return null
  return (
    <>
      {onCorner &&
        (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => (
          <NodeResizeControl
            key={p}
            position={p}
            minWidth={minWidth}
            minHeight={minHeight}
            onResizeStart={start}
            onResizeEnd={end}
            className="!size-2 !rounded-[2px] !border !border-brand !bg-background"
          />
        ))}
      {(['left', 'right'] as const).map((p) => (
        <NodeResizeControl
          key={p}
          position={p}
          variant={ResizeControlVariant.Line}
          minWidth={minWidth}
          className="!w-2 !border-0 after:absolute after:inset-y-2 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-brand/60 after:content-['']"
        />
      ))}
    </>
  )
}
