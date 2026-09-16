import type { NodeTypes } from '@xyflow/react'
import { CardNode } from './CardNode'
import { FileNode } from './FileNode'
import { MermaidNode } from './MermaidNode'
import { MindmapNode } from './MindmapNode'
import { SectionNode } from './SectionNode'
import { TextNode } from './TextNode'
import { WhiteboardNode } from './WhiteboardNode'

export const nodeTypes: NodeTypes = {
  card: CardNode,
  text: TextNode,
  section: SectionNode,
  whiteboard: WhiteboardNode,
  file: FileNode,
  mindmap: MindmapNode,
  mermaid: MermaidNode
}
