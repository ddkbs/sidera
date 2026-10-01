import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import { t } from '@/lib/i18n'
import { record } from '@/lib/undo'
import type { ObjectNode } from '@/features/canvas/types'
import { absPoints, fitTransform, inkBounds, liveElements, movePoint, reboxed, sceneToBoard, type InkElement } from './geometry'

const MAX_POINTS = 12

/** The one line/arrow of a frameless sketch whose points can be dragged on the board, else null. */
export function editableLine(elements: readonly unknown[] | undefined): InkElement | null {
  const live = liveElements<InkElement>(elements)
  const el = live.length === 1 ? live[0] : null
  return el && (el.type === 'line' || el.type === 'arrow') && (el.points?.length ?? 0) <= MAX_POINTS ? el : null
}

/**
 * Draggable point handles for a single line/arrow (curves, semicircles, arrows) in a frameless sketch: move a point,
 * the box is re-fitted so every other point stays where it is. Undoable.
 */
export function PointHandles({ id, elements, width, height, rotation, onPreview }: { id: string; elements: unknown[]; width: number; height: number; rotation: number; onPreview: (els: unknown[] | null) => void }) {
  const rf = useReactFlow()
  const [drag, setDrag] = useState<number | null>(null)
  const el = editableLine(elements)
  const bounds = inkBounds(elements)
  if (!el || !bounds) return null
  const local = fitTransform(bounds, { x: 0, y: 0, width, height })
  const pts = absPoints(el)

  const onPointerDown = (index: number) => (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    const node = rf.getNode(id) as ObjectNode | undefined
    if (!node) return
    const startX = e.clientX
    const startY = e.clientY
    const zoom = rf.getViewport().zoom
    const a = (-rotation * Math.PI) / 180
    const start = pts[index]
    const moved = (ev: PointerEvent): unknown[] => {
      // screen delta → unrotated node px → scene units
      const dx = (ev.clientX - startX) / zoom
      const dy = (ev.clientY - startY) / zoom
      const lx = dx * Math.cos(a) - dy * Math.sin(a)
      const ly = dx * Math.sin(a) + dy * Math.cos(a)
      const next = movePoint(el, index, { x: start.x + lx / local.s, y: start.y + ly / local.s })
      return elements.map((x) => (x === el ? next : x))
    }
    let last: unknown[] | null = null
    setDrag(index)
    const move = (ev: PointerEvent): void => {
      last = moved(ev)
      onPreview(last)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      onPreview(null)
      const nextEls = last
      const newBounds = nextEls && inkBounds(nextEls)
      if (!nextEls || !newBounds) return
      const o = node.data.object
      const box = { x: node.position.x, y: node.position.y, width: node.width ?? o.width, height: node.height ?? o.height }
      const nextBox = reboxed(fitTransform(bounds, box), newBounds)
      const before = { id, ...box, data: o.data }
      const after = { id, ...nextBox, data: { ...o.data, elements: nextEls } }
      const apply = (p: typeof before): void => {
        const n = rf.getNode(id) as ObjectNode | undefined
        if (!n) return
        rf.updateNode(id, { position: { x: p.x, y: p.y }, width: p.width, height: p.height, data: { ...n.data, object: { ...n.data.object, ...p } } })
        void window.api.updateObjects([p])
      }
      apply(after)
      record({ label: t('undo.editPoints'), undo: () => apply(before), redo: () => apply(after) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      {pts.map((p, i) => {
        const b = sceneToBoard(p, local)
        return (
          <span
            key={i}
            onPointerDown={onPointerDown(i)}
            style={{ left: b.x, top: b.y, pointerEvents: 'all' }}
            className={`nodrag nopan absolute z-10 size-3 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-brand bg-background shadow-sm ${drag === i ? 'scale-125' : ''}`}
          />
        )
      })}
    </>
  )
}
