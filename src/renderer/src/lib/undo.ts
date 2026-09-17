import { useSyncExternalStore } from 'react'

export interface UndoEntry {
  /** shown in tooltips and toasts, e.g. "Move 3 objects" */
  label: string
  undo: () => unknown
  redo: () => unknown
}

const LIMIT = 200
let past: UndoEntry[] = []
let future: UndoEntry[] = []
let busy = false
let snapshot = { undo: undefined as string | undefined, redo: undefined as string | undefined }
const listeners = new Set<() => void>()

function emit(): void {
  snapshot = { undo: past.at(-1)?.label, redo: future.at(-1)?.label }
  for (const l of listeners) l()
}

/** Record an action that has already been performed. Ignored while an undo/redo is running. */
export function record(entry: UndoEntry): void {
  if (busy) return
  past.push(entry)
  if (past.length > LIMIT) past.shift()
  future = []
  emit()
}

export type UndoResult = { label: string; ok: boolean } | null

/** A failed step is dropped (its data likely changed elsewhere) instead of blocking the stack. */
async function run(from: UndoEntry[], to: UndoEntry[], kind: 'undo' | 'redo'): Promise<UndoResult> {
  if (busy) return null
  const entry = from.pop()
  if (!entry) return null
  busy = true
  try {
    await entry[kind]()
    to.push(entry)
    return { label: entry.label, ok: true }
  } catch (e) {
    console.error(e)
    return { label: entry.label, ok: false }
  } finally {
    busy = false
    emit()
  }
}

export const undo = (): Promise<UndoResult> => run(past, future, 'undo')
export const redo = (): Promise<UndoResult> => run(future, past, 'redo')

/** Test helper. */
export function clearUndo(): void {
  past = []
  future = []
  emit()
}

/** Labels of the next undo/redo step (undefined when nothing to do). */
export function useUndoState(): { undo?: string; redo?: string } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot
  )
}
