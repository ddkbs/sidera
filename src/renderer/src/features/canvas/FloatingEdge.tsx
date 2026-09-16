import { BaseEdge, EdgeLabelRenderer, Position, getBezierPath, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react'
import type { ConnectionEdge } from './types'

/** Point where the line from rect center towards `to` leaves the rect, plus which side it exits. */
function anchor(node: InternalNode, to: { x: number; y: number }): { x: number; y: number; pos: Position } {
  const w = node.measured.width ?? 0
  const h = node.measured.height ?? 0
  const cx = node.internals.positionAbsolute.x + w / 2
  const cy = node.internals.positionAbsolute.y + h / 2
  const dx = to.x - cx
  const dy = to.y - cy
  if (!dx && !dy) return { x: cx, y: cy, pos: Position.Top }
  const scale = Math.min(Math.abs(w / 2 / (dx || 1e-9)), Math.abs(h / 2 / (dy || 1e-9)))
  const x = cx + dx * scale
  const y = cy + dy * scale
  const pos = Math.abs(dx) * h > Math.abs(dy) * w ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top
  return { x, y, pos }
}

const center = (n: InternalNode) => ({
  x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
  y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2
})

export function FloatingEdge({ id, source, target, markerEnd, style, label, selected }: EdgeProps<ConnectionEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const a = anchor(s, center(t))
  const b = anchor(t, center(s))
  const [path, lx, ly] = getBezierPath({ sourceX: a.x, sourceY: a.y, sourcePosition: a.pos, targetX: b.x, targetY: b.y, targetPosition: b.pos })
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={16} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            className={`nodrag nopan pointer-events-auto absolute rounded-md border bg-background px-1.5 py-0.5 text-xs shadow-xs ${selected ? 'border-brand' : ''}`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const edgeTypes = { floating: FloatingEdge }
