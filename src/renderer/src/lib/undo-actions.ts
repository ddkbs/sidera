import { toast } from 'sonner'
import { record, redo, undo, type UndoResult } from './undo'

const report = (kind: string, r: UndoResult): void => {
  if (!r) return
  if (r.ok) toast(`${kind}: ${r.label}`, { duration: 1500, id: 'undo' })
  else toast.error(`Could not ${kind.toLowerCase()} “${r.label}”`, { id: 'undo' })
}

export const undoWithToast = async (): Promise<void> => report('Undo', await undo())
export const redoWithToast = async (): Promise<void> => report('Redo', await redo())

/** Soft-deleted cards/whiteboards come back via restore*. Toast offers an inline Undo too. */
export function recordDelete(kind: 'card' | 'whiteboard', id: string): void {
  const label = kind === 'card' ? 'Delete card' : 'Delete whiteboard'
  const restore = () => (kind === 'card' ? window.api.restoreCard(id) : window.api.restoreWhiteboard(id))
  const remove = () => (kind === 'card' ? window.api.deleteCard(id) : window.api.deleteWhiteboard(id))
  record({ label, undo: restore, redo: remove })
  toast(kind === 'card' ? 'Card deleted' : 'Whiteboard deleted', { action: { label: 'Undo', onClick: () => void undoWithToast() } })
}

type CardPatch = { title?: string; color?: string | null; icon?: string | null }

/** Record a title/appearance change of a card (call after applying it). */
export function recordCardPatch(id: string, label: string, before: CardPatch, after: CardPatch): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return
  record({ label, undo: () => window.api.updateCard({ id, ...before }), redo: () => window.api.updateCard({ id, ...after }) })
}
