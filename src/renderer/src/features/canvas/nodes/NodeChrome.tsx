import { Handle, NodeResizer, Position } from '@xyflow/react'

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left]

/** Four loose-mode handles (every handle can start or end a connection). */
export function Handles() {
  return (
    <>
      {SIDES.map((p) => (
        <Handle key={p} id={p} type="source" position={p} className="canvas-handle" />
      ))}
    </>
  )
}

export function Resizer({
  selected,
  minWidth = 120,
  minHeight = 40,
  keepAspectRatio
}: {
  selected?: boolean
  minWidth?: number
  minHeight?: number
  keepAspectRatio?: boolean
}) {
  return (
    <NodeResizer
      isVisible={!!selected}
      keepAspectRatio={keepAspectRatio}
      minWidth={minWidth}
      minHeight={minHeight}
      lineClassName="!border-brand/60"
      handleClassName="!size-2 !rounded-[2px] !border-brand !bg-background"
    />
  )
}
