import { Position } from '@xyflow/react'
import { useEffect, useState, type RefObject } from 'react'

/** Side of a node with room on screen for a floating editor (right, then left, else below). */
export function useEditorSide(editing: boolean, root: RefObject<HTMLElement | null>, editorWidth = 500) {
  const [side, setSide] = useState<Position>(Position.Right)
  useEffect(() => {
    if (!editing || !root.current) return
    const r = root.current.getBoundingClientRect()
    setSide(window.innerWidth - r.right > editorWidth ? Position.Right : r.left > editorWidth ? Position.Left : Position.Bottom)
  }, [editing, root, editorWidth])
  return { position: side, offset: 12, align: side === Position.Bottom ? ('center' as const) : ('start' as const) }
}
