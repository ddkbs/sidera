import { NodeResizeControl, ResizeControlVariant, useReactFlow } from '@xyflow/react'
import { useEffect, useRef, type RefObject } from 'react'
import { persist } from '../types'

/**
 * Keep a node exactly as tall as its content (text blocks, tables): the user sets the width,
 * the height follows. `height` is the node's current height (NodeProps) so a refetch that
 * resets it to a stale stored value is corrected right away.
 */
export function useAutoHeight(id: string, content: RefObject<HTMLElement | null>, height: number | undefined, min = 32): void {
  const rf = useReactFlow()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    const el = content.current
    if (!el) return
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
  }, [id, content, height, min, rf])
  useEffect(() => () => clearTimeout(timer.current), [])
}

/**
 * Left/right edge handles that change only the width (the height follows the content). With `onScale`, corner
 * handles scale the whole thing instead: `onScale(ratio, done)` gets new width / start width while dragging.
 */
export function WidthResizer({ selected, minWidth = 120, onScale }: { selected?: boolean; minWidth?: number; onScale?: (ratio: number, done: boolean, width: number) => void }) {
  const startW = useRef(0)
  if (!selected) return null
  return (
    <>
      {onScale &&
        (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((p) => (
          <NodeResizeControl
            key={p}
            position={p}
            minWidth={minWidth}
            // ratio from the width only — the height follows the (scaled) content via useAutoHeight
            shouldResize={(_, s) => s.direction[0] !== 0}
            onResizeStart={(_, s) => (startW.current = s.width)}
            onResize={(_, s) => startW.current && onScale(s.width / startW.current, false, s.width)}
            onResizeEnd={(_, s) => startW.current && onScale(s.width / startW.current, true, s.width)}
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
