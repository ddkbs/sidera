import type { Connection, ObjectPatch, WhiteboardObject } from '@shared/types'

export type HistoryOp =
  | { type: 'patch'; before: ObjectPatch[]; after: ObjectPatch[] }
  | { type: 'add'; objects: WhiteboardObject[]; connections: Connection[] }
  | { type: 'remove'; objects: WhiteboardObject[]; connections: Connection[] }

const LIMIT = 100

/** Linear undo/redo stack of canvas operations. Pure — applying ops is the caller's job. */
export class History {
  private past: HistoryOp[] = []
  private future: HistoryOp[] = []

  push(op: HistoryOp): void {
    if (op.type === 'patch' && JSON.stringify(op.before) === JSON.stringify(op.after)) return
    this.past.push(op)
    if (this.past.length > LIMIT) this.past.shift()
    this.future = []
  }

  undo(): HistoryOp | undefined {
    const op = this.past.pop()
    if (op) this.future.push(op)
    return op
  }

  redo(): HistoryOp | undefined {
    const op = this.future.pop()
    if (op) this.past.push(op)
    return op
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }
}

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
