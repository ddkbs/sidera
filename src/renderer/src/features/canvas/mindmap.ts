import dagre from 'dagre'

// Pure mindmap model: an outline tree stored as indented text ("Root\n  - Child\n    - Grandchild").

export interface MindTree {
  id: string
  label: string
  children: MindTree[]
}

let seq = 0
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

export function parseTree(src: string): MindTree {
  const lines = src.split('\n').filter((l) => l.trim())
  const root: MindTree = { id: uid(), label: lines[0]?.trim().replace(/^[-*+]\s+/, '') || 'Central idea', children: [] }
  const rootIndent = lines[0] ? lines[0].match(/^\s*/)![0].length : 0
  const stack: { indent: number; node: MindTree }[] = [{ indent: rootIndent - 1, node: root }]
  for (const raw of lines.slice(1)) {
    const indent = raw.match(/^\s*/)![0].replace(/\t/g, '  ').length
    const node: MindTree = { id: uid(), label: raw.trim().replace(/^[-*+]\s+/, ''), children: [] }
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop()
    stack[stack.length - 1].node.children.push(node)
    stack.push({ indent, node })
  }
  return root
}

export function serializeTree(tree: MindTree): string {
  const out = [tree.label]
  const walk = (n: MindTree, depth: number) => {
    for (const c of n.children) {
      out.push(`${'  '.repeat(depth)}- ${c.label}`)
      walk(c, depth + 1)
    }
  }
  walk(tree, 1)
  return out.join('\n')
}

/** Depth-first order with parent links — the visual/keyboard order of nodes. */
export function flatten(tree: MindTree): { node: MindTree; parent: MindTree | null; depth: number }[] {
  const out: { node: MindTree; parent: MindTree | null; depth: number }[] = []
  const walk = (n: MindTree, parent: MindTree | null, depth: number) => {
    out.push({ node: n, parent, depth })
    n.children.forEach((c) => walk(c, n, depth + 1))
  }
  walk(tree, null, 0)
  return out
}

const clone = (t: MindTree): MindTree => structuredClone(t)
const find = (tree: MindTree, id: string) => flatten(tree).find((e) => e.node.id === id)

export function rename(tree: MindTree, id: string, label: string): MindTree {
  const t = clone(tree)
  const e = find(t, id)
  if (e) e.node.label = label
  return t
}

/** New node right after `id` at the same level (a child when `id` is the root). */
export function addSibling(tree: MindTree, id: string): { tree: MindTree; id: string } {
  const t = clone(tree)
  const e = find(t, id)!
  const node: MindTree = { id: uid(), label: '', children: [] }
  if (!e.parent) e.node.children.push(node)
  else e.parent.children.splice(e.parent.children.indexOf(e.node) + 1, 0, node)
  return { tree: t, id: node.id }
}

export function addChild(tree: MindTree, id: string): { tree: MindTree; id: string } {
  const t = clone(tree)
  const node: MindTree = { id: uid(), label: '', children: [] }
  find(t, id)!.node.children.push(node)
  return { tree: t, id: node.id }
}

/** Tab: make the node a child of its previous sibling. */
export function indent(tree: MindTree, id: string): MindTree {
  const t = clone(tree)
  const e = find(t, id)
  if (!e?.parent) return tree
  const i = e.parent.children.indexOf(e.node)
  if (i === 0) return tree
  e.parent.children.splice(i, 1)
  e.parent.children[i - 1].children.push(e.node)
  return t
}

/** Shift+Tab: move the node next to its parent. */
export function outdent(tree: MindTree, id: string): MindTree {
  const t = clone(tree)
  const e = find(t, id)
  if (!e?.parent) return tree
  const grand = find(t, e.parent.id)?.parent
  if (!grand) return tree
  e.parent.children.splice(e.parent.children.indexOf(e.node), 1)
  grand.children.splice(grand.children.indexOf(e.parent) + 1, 0, e.node)
  return t
}

/** Removes a node; its children move up to the parent. The root can't be removed. Returns the id to focus next. */
export function remove(tree: MindTree, id: string): { tree: MindTree; focus: string } {
  const t = clone(tree)
  const order = flatten(t)
  const idx = order.findIndex((e) => e.node.id === id)
  const e = order[idx]
  if (!e?.parent) return { tree, focus: id }
  const i = e.parent.children.indexOf(e.node)
  e.parent.children.splice(i, 1, ...e.node.children)
  return { tree: t, focus: order[idx - 1].node.id }
}

export interface LaidOutNode {
  id: string
  label: string
  depth: number
  parent: string | null
  x: number
  y: number
  width: number
  height: number
}

export function layoutTree(tree: MindTree, measure: (label: string, depth: number) => number = (l) => Math.min(240, 28 + Math.max(4, l.length) * 7.4)) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 12, ranksep: 44, marginx: 14, marginy: 14 })
  g.setDefaultEdgeLabel(() => ({}))
  const flat = flatten(tree)
  for (const { node, depth } of flat) g.setNode(node.id, { width: measure(node.label, depth), height: depth === 0 ? 34 : 28 })
  for (const { node, parent } of flat) if (parent) g.setEdge(parent.id, node.id)
  dagre.layout(g)
  const graph = g.graph()
  return {
    width: graph.width ?? 0,
    height: graph.height ?? 0,
    nodes: flat.map(({ node, parent, depth }): LaidOutNode => {
      const p = g.node(node.id) as { x: number; y: number; width: number; height: number }
      return { id: node.id, label: node.label, depth, parent: parent?.id ?? null, x: p.x, y: p.y, width: p.width, height: p.height }
    })
  }
}
