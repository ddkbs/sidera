import type { Connection, ObjectPatch, WhiteboardObject } from '@shared/types'

/** A canvas operation; recorded on the global undo stack (`lib/undo.ts`). */
export type HistoryOp =
  | { type: 'patch'; before: ObjectPatch[]; after: ObjectPatch[] }
  | { type: 'add'; objects: WhiteboardObject[]; connections: Connection[] }
  | { type: 'remove'; objects: WhiteboardObject[]; connections: Connection[] }

/** The operation that reverts `op`. */
export function invert(op: HistoryOp): HistoryOp {
  switch (op.type) {
    case 'patch':
      return { type: 'patch', before: op.after, after: op.before }
    case 'add':
      return { type: 'remove', objects: op.objects, connections: op.connections }
    case 'remove':
      return { type: 'add', objects: op.objects, connections: op.connections }
  }
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Human label for undo tooltips, e.g. "Move 2 objects". */
export function opLabel(op: HistoryOp): string {
  if (op.type === 'patch') {
    const resized = op.after.some((p) => p.width !== undefined || p.height !== undefined)
    return `${resized ? 'Resize' : 'Move'} ${plural(op.after.length, 'object')}`
  }
  const verb = op.type === 'add' ? 'Add' : 'Delete'
  if (!op.objects.length) return `${verb} ${plural(op.connections.length, 'connection')}`
  return `${verb} ${plural(op.objects.length, 'object')}`
}
