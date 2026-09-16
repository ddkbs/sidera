import type { Edge, Node } from '@xyflow/react'
import type { CardSummary, ObjectKind, ObjectPatch, WhiteboardObject } from '@shared/types'

export interface ObjectNodeData extends Record<string, unknown> {
  object: WhiteboardObject
  card?: CardSummary
  childName?: string
  autoEdit?: boolean
}

export type ObjectNode = Node<ObjectNodeData, ObjectKind>
export type ConnectionEdge = Edge<{ label?: string }>

export const persist = (patches: ObjectPatch[]): void => {
  if (patches.length) void window.api.updateObjects(patches)
}
