// Pure Mermaid flowchart model: parse a practical subset into nodes/edges and serialize back.
// Anything we don't understand (subgraphs, classDef, click, comments, …) is kept verbatim.

export type FlowDirection = 'TD' | 'TB' | 'BT' | 'LR' | 'RL'
export type FlowShape =
  | 'rect' | 'round' | 'stadium' | 'circle' | 'diamond' | 'hexagon' | 'parallelogram' | 'database' | 'subroutine'
  | 'parallelogram-alt' | 'trapezoid' | 'trapezoid-alt' | 'asymmetric' | 'double-circle'
export type EdgeStyle = 'solid' | 'dotted' | 'thick'
export type EdgeArrow = 'arrow' | 'none' | 'both'
export type FlowCurve = 'basis' | 'linear' | 'step'

export interface FlowNode {
  id: string
  label: string
  shape: FlowShape
  /** written with brackets even when label === id and shape is rect */
  explicit?: boolean
  /** `A:::className` */
  className?: string
  /** props from `style A fill:#fff,stroke:#000` */
  style?: string[]
  /** only defined inside a verbatim block (subgraph): connectable, but not editable here */
  external?: boolean
}

export interface FlowEdge {
  id: string
  from: string
  to: string
  label?: string
  style: EdgeStyle
  arrow: EdgeArrow
  /** extra link length (`--->` = 2) */
  length?: number
}

export interface Flowchart {
  keyword: 'graph' | 'flowchart'
  direction: FlowDirection
  /** parsed `%%{init: …}%%` directive */
  init?: Record<string, unknown>
  /** verbatim lines before the header (front matter, comments) */
  preamble: string[]
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** verbatim statements we don't model, in original order */
  extra: string[]
}

export const FLOW_SHAPES: Record<FlowShape, { open: string; close: string; label: string }> = {
  rect: { open: '[', close: ']', label: 'Rectangle' },
  round: { open: '(', close: ')', label: 'Rounded' },
  stadium: { open: '([', close: '])', label: 'Stadium' },
  circle: { open: '((', close: '))', label: 'Circle' },
  diamond: { open: '{', close: '}', label: 'Decision' },
  hexagon: { open: '{{', close: '}}', label: 'Hexagon' },
  parallelogram: { open: '[/', close: '/]', label: 'Input / output' },
  database: { open: '[(', close: ')]', label: 'Database' },
  subroutine: { open: '[[', close: ']]', label: 'Subroutine' },
  'parallelogram-alt': { open: '[\\', close: '\\]', label: 'Parallelogram (alt)' },
  trapezoid: { open: '[/', close: '\\]', label: 'Trapezoid' },
  'trapezoid-alt': { open: '[\\', close: '/]', label: 'Trapezoid (alt)' },
  asymmetric: { open: '>', close: ']', label: 'Flag' },
  'double-circle': { open: '(((', close: ')))', label: 'Double circle' }
}

/** Shapes offered in the editor (others are kept when parsed). */
export const MAIN_SHAPES: FlowShape[] = ['rect', 'round', 'stadium', 'circle', 'diamond', 'hexagon', 'parallelogram', 'database', 'subroutine']

export const FLOW_DIRECTIONS: FlowDirection[] = ['TD', 'LR', 'BT', 'RL']

/** Node colours as Mermaid `style` props — pastel fill, saturated stroke, dark text (readable in both themes). */
export const FLOW_COLORS = [
  { name: 'blue', fill: '#dbeafe', stroke: '#3b82f6' },
  { name: 'green', fill: '#dcfce7', stroke: '#22c55e' },
  { name: 'orange', fill: '#ffedd5', stroke: '#f97316' },
  { name: 'purple', fill: '#f3e8ff', stroke: '#a855f7' },
  { name: 'red', fill: '#fee2e2', stroke: '#ef4444' },
  { name: 'teal', fill: '#ccfbf1', stroke: '#14b8a6' },
  { name: 'yellow', fill: '#fef9c3', stroke: '#eab308' },
  { name: 'pink', fill: '#fce7f3', stroke: '#ec4899' }
] as const

const OPENS = Object.entries(FLOW_SHAPES)
  .map(([shape, s]) => ({ shape: shape as FlowShape, ...s }))
  .sort((a, b) => b.open.length - a.open.length)

const HEADER = /^(graph|flowchart)(?:\s+(TD|TB|BT|RL|LR))?\s*$/i
const INIT = /^%%\{\s*init\s*:\s*([\s\S]*)\}%%$/
const RAW_KEYWORDS = /^(classDef|class|click|linkStyle|subgraph|end|direction|accTitle|accDescr|title)\b/
const ID = /[\p{L}\p{N}_]+/uy

export const isFlowchartSource = (source: string) => source.split('\n').some((l) => HEADER.test(stripSemi(l.trim())))

function stripSemi(s: string) {
  return s.replace(/;\s*$/, '').trim()
}

/** Split a line into `;`-separated statements, respecting quotes and brackets. */
function splitStatements(line: string): string[] {
  const out: string[] = []
  let depth = 0
  let quoted = false
  let piped = false
  let start = 0
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') quoted = !quoted
    else if (quoted) continue
    else if ('[({'.includes(c)) depth++
    else if (')]}'.includes(c)) depth = Math.max(0, depth - 1)
    else if (c === '|' && depth === 0) piped = !piped
    else if (c === ';' && depth === 0 && !piped) {
      out.push(line.slice(start, i))
      start = i + 1
    }
  }
  out.push(line.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

const unquote = (s: string) => {
  const t = s.trim()
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1).replace(/#quot;/g, '"') : t
}

interface NodeRef {
  id: string
  label?: string
  shape?: FlowShape
  className?: string
}

/** Parses one statement: node groups joined by links. Returns null if it isn't fully understood. */
function parseStatement(text: string): { refs: NodeRef[]; edges: Omit<FlowEdge, 'id'>[] } | null {
  let pos = 0
  const ws = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos++
  }

  const node = (): NodeRef | null => {
    ID.lastIndex = pos
    const m = ID.exec(text)
    if (!m) return null
    const id = m[0]
    if (/^(end|subgraph)$/i.test(id)) return null
    pos += id.length
    const ref: NodeRef = { id }
    const open = OPENS.find((o) => text.startsWith(o.open, pos))
    if (open) {
      const start = pos + open.open.length
      let labelEnd = -1
      let shape: FlowShape | undefined
      const candidates = OPENS.filter((o) => o.open === open.open)
      let from = start
      if (text[start] === '"') {
        const q = text.indexOf('"', start + 1)
        if (q < 0) return null
        from = q + 1
      }
      for (const c of candidates) {
        const i = text.indexOf(c.close, from)
        if (i >= 0 && (labelEnd < 0 || i < labelEnd)) {
          labelEnd = i
          shape = c.shape
        }
      }
      if (labelEnd < 0 || !shape) return null
      const rawLabel = text.slice(start, labelEnd)
      if (text[start] === '"' && rawLabel.trim().length !== from - start) return null
      ref.label = unquote(rawLabel)
      ref.shape = shape
      pos = labelEnd + FLOW_SHAPES[shape].close.length
    }
    const cls = /:::([\w-]+)/y
    cls.lastIndex = pos
    const c = cls.exec(text)
    if (c) {
      ref.className = c[1]
      pos += c[0].length
    }
    return ref
  }

  const group = (): NodeRef[] | null => {
    const refs: NodeRef[] = []
    for (;;) {
      ws()
      const n = node()
      if (!n) return null
      refs.push(n)
      ws()
      if (text[pos] !== '&') return refs
      pos++
    }
  }

  type Link = Omit<FlowEdge, 'id' | 'from' | 'to'>
  /** `count` = dashes/equals (solid, thick) or dots (dotted) */
  const makeLink = (style: EdgeStyle, count: number, lt?: string, gt?: string, label?: string): Link | null => {
    if (lt && !gt) return null
    const length = style === 'dotted' ? count : gt ? count - 1 : count - 2
    if (length < 1) return null
    const e: Link = { style, arrow: gt ? (lt ? 'both' : 'arrow') : 'none' }
    if (length > 1) e.length = length
    if (label?.trim()) e.label = unquote(label)
    return e
  }

  const link = (): Link | null => {
    ws()
    const rest = text.slice(pos)
    // text form: A -- label --> B
    const textForms = [
      { re: /^(<)?--\s+(.+?)\s*(-{2,})(>)?/, style: 'solid' as const },
      { re: /^(<)?==\s+(.+?)\s*(={2,})(>)?/, style: 'thick' as const },
      { re: /^(<)?-\.\s+(.+?)\s*(\.+)-(>)?/, style: 'dotted' as const }
    ]
    for (const t of textForms) {
      const m = rest.match(t.re)
      const e = m && makeLink(t.style, m[3].length, m[1], m[4], m[2])
      if (!m || !e) continue
      pos += m[0].length
      return e
    }
    const plain = [
      { re: /^(<)?-(\.+)-(>)?/, style: 'dotted' as const },
      { re: /^(<)?(-{2,})(>)?/, style: 'solid' as const },
      { re: /^(<)?(={2,})(>)?/, style: 'thick' as const }
    ]
    for (const p of plain) {
      const m = rest.match(p.re)
      if (!m) continue
      const e = makeLink(p.style, m[2].length, m[1], m[3])
      if (!e) return null
      pos += m[0].length
      // circle/cross heads (--o, --x) aren't modelled
      if (!m[3] && /^[ox](\s|\||$)/.test(text.slice(pos))) return null
      const pipe = /^\s*\|(\s*"[^"]*"\s*|[^|]*)\|/.exec(text.slice(pos))
      if (pipe) {
        pos += pipe[0].length
        if (pipe[1].trim()) e.label = unquote(pipe[1])
      }
      return e
    }
    return null
  }

  let left = group()
  if (!left) return null
  const refs = [...left]
  const edges: Omit<FlowEdge, 'id'>[] = []
  for (;;) {
    ws()
    if (pos >= text.length) return { refs, edges }
    const l = link()
    if (!l) return null
    const right = group()
    if (!right) return null
    refs.push(...right)
    for (const a of left) for (const b of right) edges.push({ from: a.id, to: b.id, ...l })
    left = right
  }
}

function splitProps(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((p) => p.trim()).filter(Boolean)
}

function mergeProps(a: string[] = [], b: string[]): string[] {
  const key = (p: string) => p.split(':')[0].trim()
  const keys = new Set(b.map(key))
  return [...a.filter((p) => !keys.has(key(p))), ...b]
}

/** Parse flowchart source. Returns null if the source isn't a flowchart. */
export function parseFlowchart(source: string): Flowchart | null {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const headerAt = lines.findIndex((l) => HEADER.test(stripSemi(l.trim())) || splitStatements(l).some((s, i) => i === 0 && HEADER.test(s)))
  if (headerAt < 0) return null

  const chart: Flowchart = { keyword: 'graph', direction: 'TD', preamble: [], nodes: [], edges: [], extra: [] }
  const byId = new Map<string, FlowNode>()
  const styles: { id: string; props: string[]; raw: string }[] = []
  let edgeSeq = 0

  const takeInit = (line: string) => {
    const m = line.trim().match(INIT)
    if (!m || chart.init) return false
    for (const body of [m[1], m[1].replace(/'/g, '"')]) {
      try {
        const v = JSON.parse(body.trim()) as unknown
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          chart.init = v as Record<string, unknown>
          return true
        }
      } catch {
        /* try next */
      }
    }
    return false
  }

  for (const line of lines.slice(0, headerAt)) {
    if (!takeInit(line) && line.trim()) chart.preamble.push(line.trimEnd())
  }

  const touch = (ref: NodeRef, external: boolean) => {
    let n = byId.get(ref.id)
    if (!n) {
      n = { id: ref.id, label: ref.id, shape: 'rect' }
      if (external) n.external = true
      byId.set(ref.id, n)
      chart.nodes.push(n)
    }
    if (ref.shape) {
      if (external && !n.external && n.explicit) return
      if (external) n.external = true
      else delete n.external
      n.label = ref.label ?? n.label
      n.shape = ref.shape
      n.explicit = true
    }
    if (ref.className && !(external && !n.external)) n.className = ref.className
  }

  let depth = 0
  const headerStatements = splitStatements(lines[headerAt])
  const header = headerStatements[0].match(HEADER)!
  chart.keyword = header[1].toLowerCase() as Flowchart['keyword']
  chart.direction = (header[2]?.toUpperCase() as FlowDirection) ?? 'TD'
  const body: { stmts: string[]; raw: string }[] = []
  if (headerStatements.length > 1) body.push({ stmts: headerStatements.slice(1), raw: headerStatements.slice(1).join('; ') })
  for (const line of lines.slice(headerAt + 1)) {
    const t = line.trim()
    if (!t) continue
    if (t.startsWith('%%')) {
      if (!takeInit(t)) chart.extra.push(line.trimEnd())
      continue
    }
    body.push({ stmts: splitStatements(line), raw: line.trimEnd() })
  }

  for (const { stmts, raw } of body) {
    const single = stmts.length === 1
    for (const s of stmts) {
      const rawText = single ? raw : s
      if (/^subgraph\b/.test(s)) {
        depth++
        chart.extra.push(rawText)
        continue
      }
      if (/^end$/.test(s) && depth > 0) {
        depth--
        chart.extra.push(rawText)
        continue
      }
      const styleM = s.match(/^style\s+([\p{L}\p{N}_]+)\s+(.+)$/u)
      if (styleM && depth === 0) {
        styles.push({ id: styleM[1], props: splitProps(styleM[2]), raw: rawText })
        continue
      }
      if (depth > 0 || RAW_KEYWORDS.test(s) || /^style\b/.test(s)) {
        chart.extra.push(rawText)
        // learn about nodes defined inside subgraphs so they can be connected to
        if (depth > 0 && !RAW_KEYWORDS.test(s)) parseStatement(s)?.refs.forEach((r) => touch(r, true))
        continue
      }
      const parsed = parseStatement(s)
      if (!parsed) {
        chart.extra.push(rawText)
        continue
      }
      for (const r of parsed.refs) touch(r, false)
      for (const e of parsed.edges) chart.edges.push({ id: `e${++edgeSeq}`, ...e })
    }
  }

  // a node used by a managed edge is managed even if it was first seen inside a subgraph
  for (const e of chart.edges) for (const id of [e.from, e.to]) {
    const n = byId.get(id)
    if (n?.external && !n.explicit) delete n.external
  }

  for (const st of styles) {
    const n = byId.get(st.id)
    if (n && !n.external) n.style = mergeProps(n.style, st.props)
    else chart.extra.push(st.raw)
  }
  return chart
}

const NODE_SPECIAL = /[[\](){}"<>|;&`]|^\s|\s$/
const quoteLabel = (label: string) => (NODE_SPECIAL.test(label) || label === '' ? `"${label.replace(/"/g, '#quot;')}"` : label)

function nodeText(n: FlowNode, withShape: boolean): string {
  let s = n.id
  if (withShape) {
    const sh = FLOW_SHAPES[n.shape]
    s += sh.open + quoteLabel(n.label) + sh.close
  }
  if (n.className) s += `:::${n.className}`
  return s
}

const needsShape = (n: FlowNode) => !n.external && (n.explicit || n.shape !== 'rect' || n.label !== n.id)

export function linkText(e: Pick<FlowEdge, 'style' | 'arrow' | 'length' | 'label'>): string {
  const len = Math.max(1, e.length ?? 1)
  const head = e.arrow === 'none' ? '' : '>'
  let core: string
  if (e.style === 'dotted') core = '-' + '.'.repeat(len) + '-'
  else {
    const ch = e.style === 'thick' ? '=' : '-'
    core = ch.repeat(len + (e.arrow === 'none' ? 2 : 1))
  }
  let s = (e.arrow === 'both' ? '<' : '') + core + head
  if (e.label) s += `|${/[|"]|^\s|\s$/.test(e.label) || /[[\](){}<>]/.test(e.label) ? `"${e.label.replace(/"/g, '#quot;')}"` : e.label}|`
  return s
}

/** Serialize a flowchart back to Mermaid source. */
export function serializeFlowchart(chart: Flowchart): string {
  const out: string[] = [...chart.preamble]
  if (chart.init && Object.keys(chart.init).length) out.push(`%%{init: ${JSON.stringify(chart.init)}}%%`)
  out.push(`${chart.keyword} ${chart.direction}`)
  const inEdge = new Set(chart.edges.flatMap((e) => [e.from, e.to]))
  const defined = new Set<string>()
  const byId = new Map(chart.nodes.map((n) => [n.id, n]))

  // unconnected nodes are written just before the next connected node that follows them in node order
  const order = new Map(chart.nodes.map((n, i) => [n.id, i]))
  const standalone = chart.nodes.filter((n) => !n.external && !inEdge.has(n.id))
  let next = 0
  const flushUntil = (index: number) => {
    while (next < standalone.length && order.get(standalone[next].id)! < index) {
      const n = standalone[next++]
      out.push('  ' + nodeText(n, needsShape(n)))
    }
  }
  const ref = (id: string) => {
    const n = byId.get(id)
    if (!n) return id
    const first = !defined.has(id)
    defined.add(id)
    return first ? nodeText(n, needsShape(n)) : n.id
  }
  for (const e of chart.edges) {
    for (const id of [e.from, e.to]) if (!defined.has(id) && order.has(id)) flushUntil(order.get(id)!)
    out.push(`  ${ref(e.from)} ${linkText(e)} ${ref(e.to)}`)
  }
  flushUntil(Infinity)
  out.push(...chart.extra)
  for (const n of chart.nodes) if (!n.external && n.style?.length) out.push(`  style ${n.id} ${n.style.join(',')}`)
  return out.join('\n')
}

// ---------- editing helpers ----------

export function nextNodeId(chart: Flowchart, source = ''): string {
  const taken = new Set(chart.nodes.map((n) => n.id))
  let i = 1
  while (taken.has(`N${i}`) || new RegExp(`(^|[^\\p{L}\\p{N}_])N${i}([^\\p{L}\\p{N}_]|$)`, 'u').test(source)) i++
  return `N${i}`
}

export function addNode(chart: Flowchart, label = 'New step', shape: FlowShape = 'rect'): { chart: Flowchart; id: string } {
  const id = nextNodeId(chart, chart.extra.join('\n'))
  return { chart: { ...chart, nodes: [...chart.nodes, { id, label, shape, explicit: true }] }, id }
}

export function updateNode(chart: Flowchart, id: string, patch: Partial<FlowNode>): Flowchart {
  return { ...chart, nodes: chart.nodes.map((n) => (n.id === id ? { ...n, ...patch, explicit: true } : n)) }
}

export function removeNode(chart: Flowchart, id: string): Flowchart {
  return { ...chart, nodes: chart.nodes.filter((n) => n.id !== id), edges: chart.edges.filter((e) => e.from !== id && e.to !== id) }
}

export function addEdge(chart: Flowchart, from: string, to: string): Flowchart {
  const n = Math.max(0, ...chart.edges.map((e) => Number(e.id.slice(1)) || 0)) + 1
  return { ...chart, edges: [...chart.edges, { id: `e${n}`, from, to, style: 'solid', arrow: 'arrow' }] }
}

export function updateEdge(chart: Flowchart, id: string, patch: Partial<FlowEdge>): Flowchart {
  return { ...chart, edges: chart.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }
}

export function removeEdge(chart: Flowchart, id: string): Flowchart {
  return { ...chart, edges: chart.edges.filter((e) => e.id !== id) }
}

const prop = (style: string[] | undefined, key: string) =>
  style?.find((p) => p.split(':')[0].trim() === key)?.slice(key.length + 1).trim()

/** Palette colour name of a node, if its fill matches one. */
export function nodeColor(n: FlowNode): string | null {
  const fill = prop(n.style, 'fill')?.toLowerCase()
  return FLOW_COLORS.find((c) => c.fill === fill)?.name ?? null
}

export function setNodeColor(chart: Flowchart, id: string, color: string | null): Flowchart {
  return {
    ...chart,
    nodes: chart.nodes.map((n) => {
      if (n.id !== id) return n
      const rest = (n.style ?? []).filter((p) => !['fill', 'stroke', 'color'].includes(p.split(':')[0].trim()))
      const c = FLOW_COLORS.find((x) => x.name === color)
      const style = c ? [`fill:${c.fill}`, `stroke:${c.stroke}`, 'color:#1f2937', ...rest] : rest
      const next = { ...n }
      if (style.length) next.style = style
      else delete next.style
      return next
    })
  }
}

export function getCurve(chart: Flowchart): FlowCurve | null {
  const c = (chart.init?.flowchart as Record<string, unknown> | undefined)?.curve
  return c === 'basis' || c === 'linear' || c === 'step' ? c : null
}

export function setCurve(chart: Flowchart, curve: FlowCurve | null): Flowchart {
  const init = { ...(chart.init ?? {}) }
  const flow = { ...((init.flowchart as Record<string, unknown>) ?? {}) }
  if (curve) flow.curve = curve
  else delete flow.curve
  if (Object.keys(flow).length) init.flowchart = flow
  else delete init.flowchart
  const next: Flowchart = { ...chart, init }
  if (!Object.keys(init).length) delete next.init
  return next
}
