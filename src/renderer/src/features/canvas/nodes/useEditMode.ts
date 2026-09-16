import { useEffect, useRef, useState } from 'react'

/**
 * Shared "double-click to edit, click outside or Esc to finish" behaviour for canvas nodes.
 * `onDone` runs once when editing ends (use it to persist).
 */
export function useEditMode(selected: boolean | undefined, onDone: () => void, initial = false) {
  const [editing, setEditing] = useState(initial)
  const root = useRef<HTMLDivElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  const wasEditing = useRef(initial)

  useEffect(() => {
    if (wasEditing.current && !editing) done.current()
    wasEditing.current = editing
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (root.current?.contains(t) || t.closest('.mention-popup, [data-node-editor]')) return
      setEditing(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEditing(false)
    document.addEventListener('mousedown', onDown, true)
    // capture phase: inputs inside nodes stop propagation of their key events
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [editing])

  // Stop editing when the node gets deselected — but not merely because it starts unselected
  // (freshly created nodes open in edit mode before React Flow selects them).
  const wasSelected = useRef(selected)
  useEffect(() => {
    if (wasSelected.current && !selected) setEditing(false)
    wasSelected.current = selected
  }, [selected])

  return { editing, setEditing, root }
}
