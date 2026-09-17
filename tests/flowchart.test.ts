import { describe, expect, it } from 'vitest'
import {
  FLOW_SHAPES,
  addEdge,
  addNode,
  getCurve,
  isFlowchartSource,
  nodeColor,
  parseFlowchart,
  removeNode,
  serializeFlowchart,
  setCurve,
  setNodeColor,
  updateEdge,
  updateNode,
  type FlowShape
} from '../src/shared/flowchart'

const parse = (s: string) => {
  const c = parseFlowchart(s)
  if (!c) throw new Error('not a flowchart')
  return c
}
const sortNodes = (c: ReturnType<typeof parse>) => ({ ...c, nodes: [...c.nodes].sort((a, b) => a.id.localeCompare(b.id)) })
/** The model survives a round-trip (node order may normalize once) and serialize(parse(x)) is a fixed point. */
const roundTrip = (s: string) => {
  const c = parse(s)
  const out = serializeFlowchart(c)
  expect(sortNodes(parse(out))).toEqual(sortNodes(c))
  expect(serializeFlowchart(parse(out))).toBe(out)
  return out
}

describe('flowchart model — parsing', () => {
  it('detects flowcharts and reads keyword and direction', () => {
    expect(isFlowchartSource('graph LR\n A-->B')).toBe(true)
    expect(isFlowchartSource('sequenceDiagram\n A->>B: hi')).toBe(false)
    expect(parseFlowchart('sequenceDiagram\n A->>B: hi')).toBeNull()
    for (const d of ['TD', 'TB', 'BT', 'LR', 'RL'] as const) expect(parse(`flowchart ${d}\n A --> B`).direction).toBe(d)
    const c = parse('flowchart\n  A --> B')
    expect(c.keyword).toBe('flowchart')
    expect(c.direction).toBe('TD')
  })

  it('parses the default diagram', () => {
    const c = parse('graph TD\n  A[Idea] --> B[Plan]\n  B --> C[Ship]')
    expect(c.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Idea', 'rect'],
      ['B', 'Plan', 'rect'],
      ['C', 'Ship', 'rect']
    ])
    expect(c.edges.map((e) => [e.from, e.to, e.style, e.arrow])).toEqual([
      ['A', 'B', 'solid', 'arrow'],
      ['B', 'C', 'solid', 'arrow']
    ])
    expect(serializeFlowchart(c)).toBe('graph TD\n  A[Idea] --> B[Plan]\n  B --> C[Ship]')
  })

  it('parses every shape and round-trips it', () => {
    for (const shape of Object.keys(FLOW_SHAPES) as FlowShape[]) {
      const { open, close } = FLOW_SHAPES[shape]
      const src = `graph TD\n  X${open}Some label${close} --> Y`
      const c = parse(src)
      expect(c.nodes[0]).toMatchObject({ id: 'X', label: 'Some label', shape })
      expect(roundTrip(src)).toBe(src)
    }
  })

  it('handles edge styles, arrows and lengths', () => {
    const cases: [string, object][] = [
      ['-->', { style: 'solid', arrow: 'arrow' }],
      ['---', { style: 'solid', arrow: 'none' }],
      ['<-->', { style: 'solid', arrow: 'both' }],
      ['-.->', { style: 'dotted', arrow: 'arrow' }],
      ['-.-', { style: 'dotted', arrow: 'none' }],
      ['<-.->', { style: 'dotted', arrow: 'both' }],
      ['==>', { style: 'thick', arrow: 'arrow' }],
      ['===', { style: 'thick', arrow: 'none' }],
      ['<==>', { style: 'thick', arrow: 'both' }],
      ['--->', { style: 'solid', arrow: 'arrow', length: 2 }],
      ['-..->', { style: 'dotted', arrow: 'arrow', length: 2 }],
      ['====', { style: 'thick', arrow: 'none', length: 2 }]
    ]
    for (const [link, expected] of cases) {
      const src = `graph LR\n  A ${link} B`
      const c = parse(src)
      expect(c.edges, link).toHaveLength(1)
      expect(c.edges[0], link).toMatchObject({ from: 'A', to: 'B', ...expected })
      expect(roundTrip(src), link).toBe(src)
    }
    // no spaces
    expect(parse('graph LR\nA-->B').edges[0]).toMatchObject({ from: 'A', to: 'B' })
  })

  it('reads edge labels in pipe and text form', () => {
    const c = parse('graph TD\n  A -->|yes| B\n  A -- no way --> C\n  B -. maybe .-> C\n  C == sure ==> D\n  D ---|"a|b"| E')
    expect(c.edges.map((e) => [e.label, e.style, e.arrow])).toEqual([
      ['yes', 'solid', 'arrow'],
      ['no way', 'solid', 'arrow'],
      ['maybe', 'dotted', 'arrow'],
      ['sure', 'thick', 'arrow'],
      ['a|b', 'solid', 'none']
    ])
    const out = roundTrip('graph TD\n  A -->|yes| B\n  A -- no way --> C\n  B -. maybe .-> C\n  C == sure ==> D\n  D ---|"a|b"| E')
    expect(out).toContain('A -->|no way| C')
    expect(out).toContain('D ---|"a|b"| E')
  })

  it('splits chained edges and & groups, with inline definitions', () => {
    const c = parse('graph TD\n  A[Start] --> B{Ok?} -->|yes| C([Done])\n  A & B --> D & E')
    expect(c.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(c.nodes[1]).toMatchObject({ label: 'Ok?', shape: 'diamond' })
    expect(c.edges.map((e) => `${e.from}>${e.to}:${e.label ?? ''}`)).toEqual(['A>B:', 'B>C:yes', 'A>D:', 'A>E:', 'B>D:', 'B>E:'])
    roundTrip('graph TD\n  A[Start] --> B{Ok?} -->|yes| C([Done])\n  A & B --> D & E')
  })

  it('handles labels with spaces, quotes and special characters', () => {
    const src = 'graph TD\n  A["Plan (v2) [draft]"] --> B["say #quot;hi#quot;"]\n  B --> C["a;b"]\n  C --> D[Ünïcödé & more]\n  D --> E["`**markdown**`"]'
    const c = parse(src)
    expect(c.nodes.map((n) => n.label)).toEqual(['Plan (v2) [draft]', 'say "hi"', 'a;b', 'Ünïcödé & more', '`**markdown**`'])
    roundTrip(src)
    const renamed = serializeFlowchart(updateNode(c, 'A', { label: 'x <br> {y}' }))
    expect(renamed).toContain('A["x <br> {y}"]')
    expect(parse(renamed).nodes[0].label).toBe('x <br> {y}')
  })

  it('supports semicolons and single-line sources', () => {
    const c = parse('graph LR;A[One]-->B;B-->C;')
    expect(c.direction).toBe('LR')
    expect(c.edges).toHaveLength(2)
    expect(c.nodes[0].label).toBe('One')
    const d = parse('graph TD;\n  A[Start];\n  B[End]\n  A-- go -->B;')
    expect(d.edges[0]).toMatchObject({ from: 'A', to: 'B', label: 'go' })
    expect(serializeFlowchart(d)).toBe('graph TD\n  A[Start] -->|go| B[End]')
  })

  it('uses the last definition of a node and keeps later style lines', () => {
    const c = parse('graph TD\n  A[One] --> B\n  A(Two)\n  style B fill:#fff\n  style B stroke:#000,fill:#eee')
    expect(c.nodes[0]).toMatchObject({ label: 'Two', shape: 'round' })
    expect(c.nodes[1].style).toEqual(['stroke:#000', 'fill:#eee'])
  })

  it('keeps node classes and bare standalone nodes', () => {
    const src = 'graph TD\n  A:::hot --> B\n  Lonely\n  Box[Box]'
    const c = parse(src)
    expect(c.nodes.find((n) => n.id === 'A')?.className).toBe('hot')
    const out = roundTrip(src)
    expect(out).toContain('A:::hot --> B')
    expect(out).toContain('  Lonely')
    expect(out).toContain('  Box[Box]')
  })
})

describe('flowchart model — preserving unknown content', () => {
  const src = [
    '---',
    'title: My flow',
    '---',
    'flowchart LR',
    '  %% a comment',
    '  A[Start] --> B',
    '  subgraph S1 [Inside]',
    '    direction TB',
    '    C[Deep] --> D',
    '  end',
    '  B --> C',
    '  classDef hot fill:#f96',
    '  class A hot',
    '  click A "https://example.com" _blank',
    '  linkStyle 0 stroke:#f00',
    '  A --o X',
    '  Y@{ shape: cloud }',
    '  style Z fill:#000'
  ].join('\n')

  it('keeps unknown lines verbatim', () => {
    const c = parse(src)
    const out = serializeFlowchart(c)
    for (const line of src.split('\n')) if (line.trim() !== 'flowchart LR') expect(out.split('\n')).toContain(line)
    expect(c.preamble).toEqual(['---', 'title: My flow', '---'])
    roundTrip(src)
  })

  it('knows subgraph nodes as connectable but not editable', () => {
    const c = parse(src)
    expect(c.nodes.find((n) => n.id === 'D')).toMatchObject({ external: true })
    // C is used by a managed edge but defined in the subgraph: stays external, serialized as bare id
    expect(c.nodes.find((n) => n.id === 'C')).toMatchObject({ external: true, label: 'Deep' })
    expect(serializeFlowchart(c)).toContain('  B --> C\n')
    // Z only appears in an unknown style line → kept raw
    expect(c.nodes.find((n) => n.id === 'Z')).toBeUndefined()
  })

  it('keeps unparseable edges verbatim instead of guessing', () => {
    const c = parse('graph TD\n  A --x B\n  A -->')
    expect(c.edges).toHaveLength(0)
    expect(c.extra).toEqual(['  A --x B', '  A -->'])
  })

  it('keeps edits intact alongside preserved lines', () => {
    let c = parse(src)
    c = updateNode(c, 'A', { label: 'Begin', shape: 'stadium' })
    const out = serializeFlowchart(c)
    expect(out).toContain('A([Begin]) --> B')
    expect(out).toContain('  classDef hot fill:#f96')
    expect(out).toContain('    C[Deep] --> D')
  })
})

describe('flowchart model — editing', () => {
  const base = 'graph TD\n  A[Idea] --> B[Plan]'

  it('adds and removes nodes and connections', () => {
    let c = parse(base)
    const added = addNode(c, 'Ship', 'round')
    expect(added.id).toBe('N1')
    c = addEdge(added.chart, 'B', 'N1')
    expect(serializeFlowchart(c)).toBe('graph TD\n  A[Idea] --> B[Plan]\n  B --> N1(Ship)')
    c = updateEdge(c, c.edges[1].id, { label: 'then', style: 'dotted', arrow: 'both' })
    expect(serializeFlowchart(c)).toContain('B <-.->|then| N1(Ship)')
    c = removeNode(c, 'B')
    expect(c.edges).toHaveLength(0)
    expect(serializeFlowchart(c)).toBe('graph TD\n  A[Idea]\n  N1(Ship)')
    // unconnected new node is still written
    expect(addNode(parse(base)).chart.nodes.at(-1)?.explicit).toBe(true)
  })

  it('avoids ids used in preserved lines', () => {
    const c = parse('graph TD\n  A --> B\n  subgraph s\n    N1\n  end')
    expect(addNode(c).id).toBe('N2')
  })

  it('changes direction', () => {
    expect(serializeFlowchart({ ...parse(base), direction: 'LR' })).toBe('graph LR\n  A[Idea] --> B[Plan]')
  })

  it('sets colours via style lines, keeping other style props', () => {
    let c = parse(base + '\n  style A stroke-width:4px,fill:#fff')
    expect(c.nodes[0].style).toEqual(['stroke-width:4px', 'fill:#fff'])
    expect(nodeColor(c.nodes[0])).toBeNull()
    c = setNodeColor(c, 'A', 'green')
    expect(nodeColor(c.nodes[0])).toBe('green')
    const out = serializeFlowchart(c)
    expect(out).toContain('style A fill:#dcfce7,stroke:#22c55e,color:#1f2937,stroke-width:4px')
    expect(parse(out).nodes[0].style).toEqual(c.nodes[0].style)
    c = setNodeColor(c, 'A', null)
    expect(serializeFlowchart(c)).toContain('style A stroke-width:4px')
    expect(serializeFlowchart(setNodeColor(parse(base), 'A', null))).not.toContain('style')
  })

  it('manages the curve via the init directive, keeping other settings', () => {
    let c = parse(base)
    expect(getCurve(c)).toBeNull()
    c = setCurve(c, 'step')
    const out = serializeFlowchart(c)
    expect(out.split('\n')[0]).toBe('%%{init: {"flowchart":{"curve":"step"}}}%%')
    expect(getCurve(parse(out))).toBe('step')
    const themed = parse(`%%{init: {'theme': 'forest', 'flowchart': {'curve': 'basis'}}}%%\n${base}`)
    expect(getCurve(themed)).toBe('basis')
    const cleared = serializeFlowchart(setCurve(themed, null))
    expect(cleared).toContain('"theme":"forest"')
    expect(cleared).not.toContain('curve')
    expect(serializeFlowchart(setCurve(c, null))).toBe(base)
  })
})
