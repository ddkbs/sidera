import { describe, expect, it } from 'vitest'
import { addChild, addSibling, flatten, indent, layoutTree, outdent, parseTree, remove, rename, serializeTree } from '../src/renderer/src/features/canvas/mindmap'

const labels = (src: string) => serializeTree(parseTree(src))

describe('mindmap model', () => {
  it('parses and serializes outlines', () => {
    const src = 'Root\n  - A\n    - A1\n  - B'
    expect(labels(src)).toBe(src)
    expect(labels('Root\n- A\n- B')).toBe('Root\n  - A\n  - B')
    expect(parseTree('').label).toBe('Central idea')
  })

  it('edits structure like an outliner', () => {
    let t = parseTree('Root\n  - A\n  - B')
    const [, a, b] = flatten(t).map((e) => e.node.id)
    const s = addSibling(t, a)
    t = rename(s.tree, s.id, 'A2')
    expect(serializeTree(t)).toBe('Root\n  - A\n  - A2\n  - B')
    t = indent(t, s.id)
    expect(serializeTree(t)).toBe('Root\n  - A\n    - A2\n  - B')
    t = outdent(t, s.id)
    expect(serializeTree(t)).toBe('Root\n  - A\n  - A2\n  - B')
    const c = addChild(t, b)
    t = rename(c.tree, c.id, 'B1')
    const r = remove(t, b)
    expect(serializeTree(r.tree)).toBe('Root\n  - A\n  - A2\n  - B1')
    expect(remove(t, flatten(t)[0].node.id).tree).toBe(t) // root stays
    expect(layoutTree(t).nodes).toHaveLength(5)
  })
})
