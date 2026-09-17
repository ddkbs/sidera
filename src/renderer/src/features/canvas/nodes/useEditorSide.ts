import { Position } from '@xyflow/react'
import { useEffect, useState, type RefObject } from 'react'

/** Room reserved on the canvas' left edge for the floating tool bar. */
const LEFT_CHROME = 90

/**
 * Side of a node with room for a floating editor (right, then left, else below).
 * Measured against the canvas pane, not the window, so the editor never slides under the sidebar.
 */
export function useEditorSide(editing: boolean, root: RefObject<HTMLElement | null>, editorWidth = 500) {
  const [side, setSide] = useState<Position>(Position.Right)
  useEffect(() => {
    if (!editing || !root.current) return
    const r = root.current.getBoundingClientRect()
    const pane = root.current.closest('.react-flow')?.getBoundingClientRect() ?? { left: 0, right: window.innerWidth }
    setSide(pane.right - r.right > editorWidth ? Position.Right : r.left - pane.left - LEFT_CHROME > editorWidth ? Position.Left : Position.Bottom)
  }, [editing, root, editorWidth])
  return { position: side, offset: 12, align: side === Position.Bottom ? ('center' as const) : ('start' as const) }
}
