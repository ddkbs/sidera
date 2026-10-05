// Pure chart model: every chart is a small table (+ options), so one editor fits all types.

export type ChartType =
  | 'column' | 'bar' | 'line' | 'area' | 'combo' | 'radar'
  | 'pie' | 'donut'
  | 'scatter' | 'bubble'
  | 'heatmap' | 'sankey'
  | 'timeline' | 'matrix' | 'venn'

/** Table shapes. Types sharing a shape can be switched without losing data. */
export type Shape = 'series' | 'parts' | 'points' | 'bubbles' | 'flows' | 'events' | 'items' | 'sets'

export interface ChartOptions {
  stacked?: boolean
  smooth?: boolean
  legend?: boolean
  /** combo: indexes (0-based, among value columns) rendered as lines */
  lineSeries?: number[]
  /** matrix */
  xAxis?: [string, string]
  yAxis?: [string, string]
  quadrants?: [string, string, string, string]
  /** venn: 2 or 3 sets */
  sets?: 2 | 3
  /** heatmap colour */
  scheme?: 'blue' | 'green' | 'orange' | 'purple'

  // ---- axes (column, bar, line, area, combo, scatter, bubble) ----
  /** title under the horizontal axis */
  xAxisTitle?: string
  /** title left of the vertical axis, rotated */
  yAxisTitle?: string
  hideGrid?: boolean
  /** hide the numbers/category names on both axes (custom ticks below still show) */
  hideAxisValues?: boolean
  /** own labels at given positions of the value axis, e.g. [{ value: 0, label: 'Break-even' }] */
  yTicks?: AxisTick[]
  /** own labels at given categories (first-column values), e.g. [{ value: '2026', label: 'Launch' }] */
  xTicks?: CategoryTick[]

  // ---- lines (line, area, combo lines) ----
  /** curve shape; overrides `smooth` (true = monotone). 'spline' = Catmull-Rom through every point */
  curve?: 'linear' | 'monotone' | 'spline'
  /** area: draw only the line, no fill */
  hideArea?: boolean
  hideDots?: boolean
  /** stroke width in px (default 2.2) */
  lineWidth?: number
  /** CSS colour of the first series (default: palette) */
  lineColor?: string
  /** labelled points (line, area, column): x = category, y defaults to the first series' value there */
  markers?: ChartMarker[]
}

export interface AxisTick {
  value: number
  label: string
}
export interface CategoryTick {
  value: string
  label: string
}
export interface ChartMarker {
  x: string
  y?: number
  label: string
}

/** Types drawn on x/y axes (axis titles, grid, ticks apply). */
export const AXIS_TYPES: ChartType[] = ['column', 'bar', 'line', 'area', 'combo', 'scatter', 'bubble']
/** Types with line options (curve, width, colour, dots, markers). */
export const LINE_TYPES: ChartType[] = ['line', 'area', 'combo']

/** Editor text ↔ list: one entry per line, "key: label" (the first colon splits). */
export function parseLabelLines(text: string): { key: string; label: string }[] {
  return text
    .split('\n')
    .map((line) => {
      const i = line.indexOf(':')
      return i < 0 ? { key: line.trim(), label: '' } : { key: line.slice(0, i).trim(), label: line.slice(i + 1).trim() }
    })
    .filter((e) => e.key)
}
export const labelLines = (entries: { key: string | number; label: string }[] | undefined): string =>
  (entries ?? []).map((e) => `${e.key}: ${e.label}`).join('\n')

/** Value of a series at a category (markers default to the first series). */
export function valueAt(data: ChartData, category: string, series = 1): number | null {
  const row = data.rows.find((r) => (r[0] ?? '').trim() === category.trim())
  return row ? num(row[series]) : null
}

export interface ChartData {
  chartType: ChartType
  title: string
  columns: string[]
  rows: string[][]
  options: ChartOptions
  /** set when the chart follows a table object on the same board (rows/columns are derived from it) */
  source?: { tableId: string }
}

export interface ChartDef {
  label: string
  shape: Shape
  /** fixed column headers; undefined = first column is the label, others are editable series */
  fixedColumns?: string[]
  numericFrom: number
}

export const SHAPE_COLUMNS: Record<Shape, string[] | undefined> = {
  series: undefined,
  parts: ['Label', 'Value'],
  points: ['Label', 'X', 'Y', 'Group'],
  bubbles: ['Label', 'X', 'Y', 'Size', 'Group'],
  flows: ['From', 'To', 'Value'],
  events: ['Date', 'Title', 'Detail'],
  items: ['Item', 'X (0–100)', 'Y (0–100)'],
  sets: ['Region', 'Text']
}

export const CHART_DEFS: Record<ChartType, ChartDef> = {
  column: { label: 'Column chart', shape: 'series', numericFrom: 1 },
  bar: { label: 'Bar chart', shape: 'series', numericFrom: 1 },
  line: { label: 'Line chart', shape: 'series', numericFrom: 1 },
  area: { label: 'Area chart', shape: 'series', numericFrom: 1 },
  combo: { label: 'Column + line', shape: 'series', numericFrom: 1 },
  radar: { label: 'Radar chart', shape: 'series', numericFrom: 1 },
  heatmap: { label: 'Heatmap', shape: 'series', numericFrom: 1 },
  pie: { label: 'Pie chart', shape: 'parts', fixedColumns: SHAPE_COLUMNS.parts, numericFrom: 1 },
  donut: { label: 'Donut chart', shape: 'parts', fixedColumns: SHAPE_COLUMNS.parts, numericFrom: 1 },
  scatter: { label: 'Scatter plot', shape: 'points', fixedColumns: SHAPE_COLUMNS.points, numericFrom: 1 },
  bubble: { label: 'Bubble chart', shape: 'bubbles', fixedColumns: SHAPE_COLUMNS.bubbles, numericFrom: 1 },
  sankey: { label: 'Sankey diagram', shape: 'flows', fixedColumns: SHAPE_COLUMNS.flows, numericFrom: 2 },
  timeline: { label: 'Timeline', shape: 'events', fixedColumns: SHAPE_COLUMNS.events, numericFrom: 99 },
  matrix: { label: '2×2 matrix', shape: 'items', fixedColumns: SHAPE_COLUMNS.items, numericFrom: 1 },
  venn: { label: 'Venn diagram', shape: 'sets', fixedColumns: SHAPE_COLUMNS.sets, numericFrom: 99 }
}

/** Types that can be switched between without converting the table. */
export const compatibleTypes = (t: ChartType): ChartType[] =>
  (Object.keys(CHART_DEFS) as ChartType[]).filter((k) => CHART_DEFS[k].shape === CHART_DEFS[t].shape || (CHART_DEFS[t].shape === 'points' && CHART_DEFS[k].shape === 'bubbles') || (CHART_DEFS[t].shape === 'bubbles' && CHART_DEFS[k].shape === 'points'))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']

export function defaultChart(type: ChartType): ChartData {
  const base = { chartType: type, title: CHART_DEFS[type].label, options: { legend: true } as ChartOptions }
  switch (CHART_DEFS[type].shape) {
    case 'series':
      if (type === 'radar')
        return { ...base, title: 'Skills', columns: ['Skill', 'Anna', 'Ben'], rows: [['Design', '80', '60'], ['Code', '65', '90'], ['Writing', '70', '55'], ['Research', '85', '70'], ['Sales', '50', '75']] }
      if (type === 'heatmap')
        return {
          ...base,
          title: 'Focus hours',
          options: { scheme: 'blue' },
          columns: ['Week', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          rows: [['W1', '2', '4', '6', '3', '1'], ['W2', '5', '6', '2', '4', '3'], ['W3', '1', '3', '7', '8', '5'], ['W4', '4', '2', '3', '6', '7']]
        }
      return {
        ...base,
        title: type === 'combo' ? 'Revenue & growth' : 'Revenue',
        options: { legend: true, lineSeries: type === 'combo' ? [1] : undefined, smooth: true },
        columns: ['Month', type === 'combo' ? 'Revenue' : '2025', type === 'combo' ? 'Growth %' : '2026'],
        rows: MONTHS.map((m, i) => [m, String(40 + ((i * 17) % 35)), String(type === 'combo' ? 5 + ((i * 7) % 20) : 55 + ((i * 23) % 40))])
      }
    case 'parts':
      return { ...base, title: 'Time spent', columns: SHAPE_COLUMNS.parts!, rows: [['Deep work', '42'], ['Meetings', '23'], ['Email', '15'], ['Learning', '20']] }
    case 'points':
      return { ...base, title: 'Effort vs impact', columns: SHAPE_COLUMNS.points!, rows: [['A', '2', '8', 'Quick wins'], ['B', '7', '9', 'Big bets'], ['C', '3', '3', 'Quick wins'], ['D', '8', '4', 'Big bets'], ['E', '5', '6', 'Quick wins']] }
    case 'bubbles':
      return { ...base, title: 'Markets', columns: SHAPE_COLUMNS.bubbles!, rows: [['EU', '30', '60', '400', 'Core'], ['US', '70', '80', '900', 'Core'], ['APAC', '50', '35', '600', 'Growth'], ['LATAM', '20', '25', '200', 'Growth']] }
    case 'flows':
      return { ...base, title: 'Budget flow', columns: SHAPE_COLUMNS.flows!, rows: [['Budget', 'Product', '50'], ['Budget', 'Marketing', '30'], ['Budget', 'Ops', '20'], ['Product', 'Design', '15'], ['Product', 'Engineering', '35'], ['Marketing', 'Ads', '18'], ['Marketing', 'Content', '12']] }
    case 'events':
      return { ...base, title: 'Launch plan', columns: SHAPE_COLUMNS.events!, rows: [['2026-01-15', 'Kickoff', 'Scope & team'], ['2026-03-01', 'Prototype', 'Clickable demo'], ['2026-05-10', 'Beta', '50 testers'], ['2026-07-01', 'Launch', 'Public release']] }
    case 'items':
      return {
        ...base,
        title: 'Prioritization',
        options: { xAxis: ['Low effort', 'High effort'], yAxis: ['Low impact', 'High impact'], quadrants: ['Quick wins', 'Big bets', 'Fill-ins', 'Money pits'] },
        columns: SHAPE_COLUMNS.items!,
        rows: [['Onboarding tour', '25', '80'], ['Sync', '85', '90'], ['Dark mode tweaks', '20', '30'], ['Rewrite editor', '80', '25']]
      }
    case 'sets':
      return { ...base, title: 'Product sweet spot', options: { sets: 3 }, columns: SHAPE_COLUMNS.sets!, rows: vennRows(3, [['A', 'Desirable'], ['B', 'Feasible'], ['C', 'Viable'], ['A∩B∩C', 'Sweet spot']]) }
  }
}

export const VENN_REGIONS: Record<2 | 3, string[]> = {
  2: ['A', 'B', 'A∩B'],
  3: ['A', 'B', 'C', 'A∩B', 'A∩C', 'B∩C', 'A∩B∩C']
}

/** Rows for the given set count, keeping texts of regions that still exist. */
export function vennRows(sets: 2 | 3, existing: string[][]): string[][] {
  const text = new Map(existing.map(([r, t]) => [r, t ?? '']))
  return VENN_REGIONS[sets].map((r) => [r, text.get(r) ?? ''])
}

/** Switch chart type, converting table/options where shapes differ. */
export function changeType(data: ChartData, type: ChartType): ChartData {
  const from = CHART_DEFS[data.chartType].shape
  const to = CHART_DEFS[type].shape
  if (from === to) return { ...data, chartType: type, options: { ...data.options, lineSeries: type === 'combo' ? (data.options.lineSeries ?? [Math.max(0, data.columns.length - 2)]) : data.options.lineSeries } }
  if ((from === 'points' && to === 'bubbles') || (from === 'bubbles' && to === 'points')) {
    const rows = data.rows.map((r) => (to === 'bubbles' ? [r[0], r[1], r[2], '100', r[3] ?? ''] : [r[0], r[1], r[2], r[4] ?? '']))
    return { ...data, chartType: type, columns: SHAPE_COLUMNS[to]!, rows }
  }
  const fresh = defaultChart(type)
  return { ...fresh, title: data.title }
}

export const num = (v: string | undefined): number => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.eE+-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Recharts-friendly rows for series charts: [{ label, [series]: number }] */
export function seriesRows(data: ChartData): Record<string, string | number>[] {
  const series = data.columns.slice(1)
  return data.rows.map((r) => Object.fromEntries([['label', r[0] ?? ''], ...series.map((s, i) => [s || `Series ${i + 1}`, num(r[i + 1])])]))
}

export const seriesNames = (data: ChartData) => data.columns.slice(1).map((s, i) => s || `Series ${i + 1}`)

export function sankeyData(data: ChartData): { nodes: { name: string }[]; links: { source: number; target: number; value: number }[] } {
  const names: string[] = []
  const idx = (n: string) => {
    const k = n.trim() || '—'
    let i = names.indexOf(k)
    if (i < 0) i = names.push(k) - 1
    return i
  }
  const links = data.rows
    .filter((r) => r[0]?.trim() && r[1]?.trim() && num(r[2]) > 0 && r[0].trim() !== r[1].trim())
    .map((r) => ({ source: idx(r[0]), target: idx(r[1]), value: num(r[2]) }))
  // Sankey needs an acyclic graph: drop links that would close a cycle
  const acyclic: typeof links = []
  const reaches = (a: number, b: number): boolean => a === b || acyclic.some((l) => l.source === a && reaches(l.target, b))
  for (const l of links) if (!reaches(l.target, l.source)) acyclic.push(l)
  return { nodes: names.map((name) => ({ name })), links: acyclic }
}

/** Parse pasted spreadsheet text (TSV/CSV) into cells. */
export function parseClipboardTable(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : ','
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
}

/** Normalise stored data (old/partial objects) into a complete ChartData. */
export function normalizeChart(raw: Partial<ChartData> | undefined, fallback: ChartType = 'column'): ChartData {
  const type = raw?.chartType && raw.chartType in CHART_DEFS ? raw.chartType : fallback
  if (!raw?.rows || !raw.columns) return defaultChart(type)
  const chart: ChartData = { chartType: type, title: raw.title ?? '', columns: raw.columns, rows: raw.rows, options: raw.options ?? {} }
  if (raw.source && typeof raw.source.tableId === 'string') chart.source = { tableId: raw.source.tableId }
  return chart
}
