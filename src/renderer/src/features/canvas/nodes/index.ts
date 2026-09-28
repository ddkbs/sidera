import type { NodeProps, NodeTypes } from '@xyflow/react'
import { createElement, type ComponentType } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { ObjectNode } from '../types'
import { CardNode } from './CardNode'
import { ChartNode } from './ChartNode'
import { FileNode } from './FileNode'
import { LinkNode } from './LinkNode'
import { MermaidNode } from './MermaidNode'
import { MindmapNode } from './MindmapNode'
import { SectionNode } from './SectionNode'
import { SketchNode } from './SketchNode'
import { TableNode } from './TableNode'
import { TextBlockNode } from './TextBlockNode'
import { TextNode } from './TextNode'
import { WhiteboardNode } from './WhiteboardNode'

/** Wrap every node so a failing node renders an inline error instead of crashing the canvas. */
const safe = (C: ComponentType<NodeProps<ObjectNode>>) =>
  function SafeNode(props: NodeProps<ObjectNode>) {
    return createElement(ErrorBoundary, {
      fallback: (e: Error) =>
        createElement('div', { className: 'grid h-full w-full place-items-center rounded-xl border border-destructive/40 bg-card p-3 text-xs text-destructive' }, e.message),
      children: createElement(C, props)
    })
  }

/** Card placements render as a text block when the card is one (kind 'block'). */
function CardOrBlockNode(props: NodeProps<ObjectNode>) {
  return createElement(props.data.card?.kind === 'block' ? TextBlockNode : CardNode, props)
}

export const nodeTypes: NodeTypes = {
  card: safe(CardOrBlockNode),
  text: safe(TextNode),
  section: safe(SectionNode),
  whiteboard: safe(WhiteboardNode),
  file: safe(FileNode),
  link: safe(LinkNode),
  mindmap: safe(MindmapNode),
  mermaid: safe(MermaidNode),
  sketch: safe(SketchNode),
  chart: safe(ChartNode),
  table: safe(TableNode)
}
