// Pure table model for `table` whiteboard objects (+ conversion into linked chart data).
import { CHART_DEFS, defaultChart, type ChartData, type ChartType } from './charts'

export type TableCell = string | number
export type TableColumnType = 'text' | 'number'

export interface TableColumn {
  id: string
  name: string
  /** undefined = inferred from the cells */
  type?: TableColumnType
  /** optional manual width in px */
  width?: number
}

export interface TableRow {
  id: string
  cells: Record<string, TableCell>
}

export interface TableData {
  title?: string
  columns: TableColumn[]
  rows: TableRow[]
  /** first row styled as header (the column names); default true */
  header?: boolean
}

/** Stored on a chart object that follows a table. */
export interface ChartSource {
  tableId: string
}

export const TABLE_LIMITS = { columns: 50, rows: 1000, cell: 2000, name: 200 } as const

const rid = (): string => Math.random().toString(36).slice(2, 10)
export const newColumnId = rid
export const newRowId = rid

/**
 * Parse a number typed or pasted by a person: "1,234.5", "1.234,5", "12 %", "$ 3.2", "-7".
 * Returns null when the text is not a number.
 */
export function parseNumber(raw: TableCell | undefined | null): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  let s = String(raw ?? '').trim()
  if (!s) return null
  s = s.replace(/[\s  '’]/g, '').replace(/^[€$£¥]|[€$£¥%]$/g, '')
  if (!/^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(s)) return null
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // the later separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    // "1,234" / "12,345,678" = thousands; "3,5" = decimal comma
    s = /^[-+]?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** A column's effective type: explicit, or 'number' when every non-empty cell is numeric. */
export function columnType(table: TableData, col: TableColumn): TableColumnType {
  if (col.type) return col.type
  let seen = false
  for (const r of table.rows) {
    const v = r.cells[col.id]
    if (v === undefined || v === '') continue
    if (parseNumber(v) === null) return 'text'
    seen = true
  }
  return seen ? 'number' : 'text'
}

/** Type used for display: like columnType, but an untyped first column is the label column (years stay "2024", not "2,024"). */
export function displayType(table: TableData, index: number): TableColumnType {
  const col = table.columns[index]
  if (!col) return 'text'
  if (!col.type && index === 0) return 'text'
  return columnType(table, col)
}

/** Store numbers as numbers in number columns (keeps text that doesn't parse). */
export function coerceCell(value: TableCell, type: TableColumnType): TableCell {
  if (type !== 'number' || typeof value === 'number') return value
  const n = parseNumber(value)
  return n === null ? value : n
}

export function emptyTable(): TableData {
  const columns: TableColumn[] = [
    { id: rid(), name: 'Name', type: 'text' },
    { id: rid(), name: 'Value', type: 'number' }
  ]
  return { columns, rows: [0, 1, 2].map(() => ({ id: rid(), cells: {} })), header: true }
}

/** Build a table from a header + rows of cells (MCP, paste). */
export function tableFromMatrix(
  columns: (string | { name: string; type?: TableColumnType })[],
  rows: (TableCell | null | undefined)[][],
  title?: string
): TableData {
  const cols: TableColumn[] = columns.map((c) => (typeof c === 'string' ? { id: rid(), name: c } : { id: rid(), name: c.name, ...(c.type ? { type: c.type } : {}) }))
  return { ...(title ? { title } : {}), columns: cols, rows: rowsFromMatrix(cols, rows), header: true }
}

/** Rows of cells (in column order) keyed by the given columns' ids. */
export function rowsFromMatrix(columns: TableColumn[], rows: (TableCell | null | undefined)[][]): TableRow[] {
  return rows.map((r) => ({
    id: rid(),
    cells: Object.fromEntries(columns.map((c, i) => [c.id, r[i] ?? ''] as const).filter(([, v]) => v !== ''))
  }))
}

/** Header + rows of cells (for MCP output and chart conversion). */
export function tableToMatrix(table: TableData): { columns: string[]; rows: TableCell[][] } {
  return { columns: table.columns.map((c) => c.name), rows: table.rows.map((r) => table.columns.map((c) => r.cells[c.id] ?? '')) }
}

const clip = (s: unknown, max: number): string => String(s ?? '').slice(0, max)

/**
 * Validate + clamp untrusted table data (renderer, MCP) into a well-formed TableData.
 * Throws when it is not a table at all; silently trims overlong content.
 */
export function normalizeTable(raw: unknown): TableData {
  const t = (raw ?? {}) as Partial<TableData>
  if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) throw new Error('A table needs `columns` and `rows` arrays')
  if (t.columns.length > TABLE_LIMITS.columns) throw new Error(`Too many columns (max ${TABLE_LIMITS.columns})`)
  if (t.rows.length > TABLE_LIMITS.rows) throw new Error(`Too many rows (max ${TABLE_LIMITS.rows})`)
  const ids = new Set<string>()
  const columns: TableColumn[] = t.columns.map((c) => {
    let id = clip((c as TableColumn)?.id, 40) || rid()
    while (ids.has(id)) id = rid()
    ids.add(id)
    const type = (c as TableColumn)?.type
    const width = Number((c as TableColumn)?.width)
    return {
      id,
      name: clip((c as TableColumn)?.name, TABLE_LIMITS.name),
      ...(type === 'text' || type === 'number' ? { type } : {}),
      ...(Number.isFinite(width) && width >= 40 ? { width: Math.min(width, 1200) } : {})
    }
  })
  const rowIds = new Set<string>()
  const rows: TableRow[] = t.rows.map((r) => {
    let id = clip((r as TableRow)?.id, 40) || rid()
    while (rowIds.has(id)) id = rid()
    rowIds.add(id)
    const src = ((r as TableRow)?.cells ?? {}) as Record<string, unknown>
    const cells: Record<string, TableCell> = {}
    for (const c of columns) {
      const v = src[c.id]
      if (v === undefined || v === null || v === '') continue
      cells[c.id] = typeof v === 'number' ? (Number.isFinite(v) ? v : '') : clip(v, TABLE_LIMITS.cell)
    }
    return { id, cells }
  })
  const table: TableData = { columns, rows, header: t.header !== false }
  if (typeof t.title === 'string' && t.title.trim()) table.title = clip(t.title, TABLE_LIMITS.name)
  // numbers stay numbers in number columns
  for (const c of columns) {
    if (c.type !== 'number') continue
    for (const r of rows) if (r.cells[c.id] !== undefined) r.cells[c.id] = coerceCell(r.cells[c.id], 'number')
  }
  return table
}

/** Format a cell for display: numbers with locale grouping. */
export function formatCell(v: TableCell | undefined, type: TableColumnType, locale?: string): string {
  if (v === undefined || v === '') return ''
  if (type !== 'number') return String(v)
  const n = parseNumber(v)
  return n === null ? String(v) : n.toLocaleString(locale, { maximumFractionDigits: 10 })
}

/**
 * Chart data for a table: first text column = categories, number columns = series.
 * Keeps the chart's type/options/title when it is a series chart; pie/donut use the first number column.
 */
export function tableToChart(table: TableData, base?: Partial<ChartData> & { chartType?: ChartType }): ChartData {
  const types = table.columns.map((c) => columnType(table, c))
  // categories: an explicit text column, else the first column (years look numeric but are labels), else any text column
  let labelIdx = table.columns.findIndex((c) => c.type === 'text')
  if (labelIdx < 0 && table.columns.length && table.columns[0].type !== 'number') labelIdx = 0
  if (labelIdx < 0) labelIdx = types.findIndex((t) => t === 'text')
  const numIdx = types.map((t, i) => (t === 'number' && i !== labelIdx ? i : -1)).filter((i) => i >= 0)
  let chartType: ChartType = base?.chartType && base.chartType in CHART_DEFS ? base.chartType : 'column'
  const shape = CHART_DEFS[chartType].shape
  if (shape !== 'series' && shape !== 'parts') chartType = 'column'
  const label = (r: TableRow, i: number): string => (labelIdx >= 0 ? String(r.cells[table.columns[labelIdx].id] ?? '') : String(i + 1))
  const value = (r: TableRow, ci: number): string => {
    const n = parseNumber(r.cells[table.columns[ci].id])
    return n === null ? '' : String(n)
  }
  // blank rows (e.g. one just appended while typing) don't become empty categories
  table = { ...table, rows: table.rows.filter((r) => Object.values(r.cells).some((v) => v !== '')) }
  const title = base?.title ?? table.title ?? ''
  const options = base?.options ?? defaultChart(chartType).options
  if (CHART_DEFS[chartType].shape === 'parts') {
    const ci = numIdx[0]
    return {
      chartType,
      title,
      columns: ['Label', 'Value'],
      rows: table.rows.map((r, i) => [label(r, i), ci === undefined ? '' : value(r, ci)]),
      options
    }
  }
  return {
    chartType,
    title,
    columns: [labelIdx >= 0 ? table.columns[labelIdx].name || 'Label' : '#', ...numIdx.map((i) => table.columns[i].name || `Series ${i}`)],
    rows: table.rows.map((r, i) => [label(r, i), ...numIdx.map((ci) => value(r, ci))]),
    options
  }
}
