import { describe, expect, it } from 'vitest'
import { addConnectedNode, getNodeLabel, isFlowchart, nodeIdFromSvg, renameNode } from '../src/renderer/src/features/canvas/mermaidEdit'

const src = 'graph TD\n  A[Idea] --> B(Plan)\n  B --> C{Ship?}\n  C -->|yes| D[Launch]\n  D --> E((Done))\n  E --> F'

describe('mermaid direct editing', () => {
  it('reads node ids and labels', () => {
    expect(nodeIdFromSvg('mr1o-0-flowchart-C-3')).toBe('C')
    expect(getNodeLabel(src, 'B')).toBe('Plan')
    expect(getNodeLabel(src, 'E')).toBe('Done')
    expect(getNodeLabel(src, 'F')).toBeNull()
    expect(isFlowchart(src)).toBe(true)
    expect(isFlowchart('sequenceDiagram\n A->>B: hi')).toBe(false)
  })

  it('renames while keeping shapes, and quotes special characters', () => {
    expect(renameNode(src, 'C', 'Ready to ship')).toContain('C{Ready to ship}')
    expect(renameNode(src, 'B', 'Plan (v2)')).toContain('B("Plan (v2)")')
    expect(renameNode(src, 'E', 'Finished')).toContain('E((Finished))')
    expect(renameNode(src, 'F', 'Retro')).toMatch(/E --> F\[Retro\]$/)
    // labels are replaced only in the defining occurrence
    expect(renameNode(src, 'A', 'Spark').match(/Spark/g)).toHaveLength(1)
  })

  it('adds connected nodes with unique ids', () => {
    const r = addConnectedNode(src, 'D')
    expect(r.id).toBe('N1')
    expect(r.source.endsWith('\n  D --> N1[New step]')).toBe(true)
    expect(addConnectedNode(r.source, 'N1').id).toBe('N2')
  })
})
