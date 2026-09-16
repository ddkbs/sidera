import dagre from 'dagre'

export interface MindNode {
  id: string
  label: string
  depth: number
  parent: string | null
}

/** Parses an indented outline ("- a\n  - b") into nodes. First non-empty line is the root. */
export function parseOutline(src: string): MindNode[] {
  const nodes: MindNode[] = []
  const stack: { indent: number; id: string }[] = []
  src.split('\n').forEach((raw, i) => {
    if (!raw.trim()) return
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, '  ').length
    const label = raw.trim().replace(/^[-*+]\s+/, '')
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]?.id ?? (nodes[0] && nodes[0].id !== `n${i}` ? nodes[0].id : null)
    const id = `n${i}`
    nodes.push({ id, label, depth: stack.length, parent: nodes.length === 0 ? null : parent })
    stack.push({ indent, id })
  })
  return nodes
}

export function layoutMindmap(nodes: MindNode[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 14, ranksep: 48, marginx: 12, marginy: 12 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: Math.min(220, 24 + n.label.length * 7.2), height: 30 })
  for (const n of nodes) if (n.parent) g.setEdge(n.parent, n.id)
  dagre.layout(g)
  const graph = g.graph()
  return {
    width: graph.width ?? 0,
    height: graph.height ?? 0,
    nodes: nodes.map((n) => ({ ...n, ...(g.node(n.id) as { x: number; y: number; width: number; height: number }) }))
  }
}
