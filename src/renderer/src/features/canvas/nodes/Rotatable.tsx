import { useReactFlow } from '@xyflow/react'
import { useRef, useState, type ReactNode } from 'react'
import { RotateCcw } from '@/components/icons'
import { record } from '@/lib/undo'
import type { ObjectNode } from '../types'

const setRotation = (rf: ReturnType<typeof useReactFlow>, id: string, rotation: number, persist: boolean): void => {
  const n = rf.getNode(id) as ObjectNode | undefined
  if (!n) return
  const data = { ...n.data.object.data, rotation }
  rf.updateNode(id, { data: { ...n.data, object: { ...n.data.object, data } } })
  if (persist) void window.api.updateObjects([{ id, data }])
}

/** Rotates its content by `data.rotation` (degrees) and shows a rotate handle below it (the selection toolbar sits above) while selected. Shift snaps to 15°. */
export function Rotatable({ id, rotation, selected, children }: { id: string; rotation: number; selected: boolean; children: ReactNode }) {
  const rf = useReactFlow()
  const box = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<number | null>(null)
  const angle = live ?? rotation

  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    const el = box.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const start = rotation
    const at = (ev: PointerEvent): number => {
      let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90
      if (ev.shiftKey) a = Math.round(a / 15) * 15
      return Math.round(((a % 360) + 360) % 360)
    }
    let last = start
    const move = (ev: PointerEvent): void => {
      last = at(ev)
      setLive(last)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setLive(null)
      if (last === start) return
      setRotation(rf, id, last, true)
      record({ label: 'Rotate', undo: () => setRotation(rf, id, start, true), redo: () => setRotation(rf, id, last, true) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div ref={box} className="h-full w-full">
      <div className="relative h-full w-full" style={angle ? { transform: `rotate(${angle}deg)` } : undefined}>
        {children}
        {selected && (
          <button
            type="button"
            aria-label="Rotate"
            title="Rotate (Shift: 15° steps)"
            onPointerDown={onPointerDown}
            style={{ pointerEvents: 'all' }}
            className="nodrag nopan absolute -bottom-9 left-1/2 flex size-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground active:cursor-grabbing"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
