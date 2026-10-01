import type { Connection, ObjectPatch, WhiteboardObject } from '@shared/types'
import { t } from '../../lib/i18n'

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

/** Human label for undo tooltips, e.g. "Move 2 objects". */
export function opLabel(op: HistoryOp): string {
  if (op.type === 'patch') {
    const resized = op.after.some((p) => p.width !== undefined || p.height !== undefined)
    return t(resized ? 'history.resize' : 'history.move', { count: op.after.length })
  }
  const add = op.type === 'add'
  if (!op.objects.length) return t(add ? 'history.addConnections' : 'history.deleteConnections', { count: op.connections.length })
  return t(add ? 'history.add' : 'history.delete', { count: op.objects.length })
}
