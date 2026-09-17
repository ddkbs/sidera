import { todayISO } from '@shared/util'
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

export function recordTaskToggle(cardId: string, index: number, checked: boolean): void {
  record({
    label: checked ? 'Complete task' : 'Reopen task',
    undo: () => window.api.setTaskChecked(cardId, index, !checked),
    redo: () => window.api.setTaskChecked(cardId, index, checked)
  })
}

/** Adds a task and records it by snapshotting the target card's content before/after. */
export async function addTaskUndoable(add: () => Promise<{ cardId: string } | undefined>, cardId?: string): Promise<boolean> {
  const target = cardId ? await window.api.getCard(cardId) : (await window.api.getJournal(todayISO())).card
  const task = await add()
  if (!task || !target) return !!task
  const after = await window.api.getCard(task.cardId)
  if (!after) return true
  record({
    label: 'Add task',
    undo: () => window.api.updateCard({ id: task.cardId, content: target.content }),
    redo: () => window.api.updateCard({ id: task.cardId, content: after.content })
  })
  return true
}
