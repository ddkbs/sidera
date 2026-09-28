import { describe, expect, it } from 'vitest'
import { columnType, formatCell, normalizeTable, parseNumber, tableFromMatrix, tableToChart } from '../src/shared/tables'

describe('table model', () => {
  it('parses numbers typed or pasted in different locales', () => {
    expect(parseNumber('1,234.5')).toBe(1234.5)
    expect(parseNumber('1.234,5')).toBe(1234.5)
    expect(parseNumber('3,5')).toBe(3.5)
    expect(parseNumber('12,345,678')).toBe(12345678)
    expect(parseNumber('1.000.000')).toBe(1000000)
    expect(parseNumber('$ 42')).toBe(42)
    expect(parseNumber('12 %')).toBe(12)
    expect(parseNumber('-7')).toBe(-7)
    expect(parseNumber('Hawthorne')).toBeNull()
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('2002-01-01')).toBeNull()
  })

  it('infers column types and formats numbers', () => {
    const t = tableFromMatrix(['City', 'People'], [['Berlin', '3,6'], ['Paris', 2.1], ['', '']])
    expect(columnType(t, t.columns[0])).toBe('text')
    expect(columnType(t, t.columns[1])).toBe('number')
    expect(formatCell(1234567.5, 'number', 'en-US')).toBe('1,234,567.5')
    expect(formatCell('abc', 'number', 'en-US')).toBe('abc')
  })

  it('normalises untrusted data', () => {
    const t = normalizeTable({ columns: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }], rows: [{ cells: { a: 'x'.repeat(5000), zzz: 'gone' } }] })
    expect(new Set(t.columns.map((c) => c.id)).size).toBe(2)
    expect(t.rows[0].id).toBeTruthy()
    expect(String(t.rows[0].cells.a)).toHaveLength(2000)
    expect(t.rows[0].cells.zzz).toBeUndefined()
    expect(t.header).toBe(true)
  })

  it('turns a table into series or parts chart data', () => {
    const t = tableFromMatrix(['Year', 'Revenue', 'Profit', 'Note'], [['2023', '8.7', '1', 'good'], ['2024', '13.1', '2.5', '']])
    expect(tableToChart(t)).toMatchObject({ chartType: 'column', columns: ['Year', 'Revenue', 'Profit'], rows: [['2023', '8.7', '1'], ['2024', '13.1', '2.5']] })
    expect(tableToChart(t, { chartType: 'pie', title: 'Split' })).toMatchObject({ chartType: 'pie', title: 'Split', columns: ['Label', 'Value'], rows: [['2023', '8.7'], ['2024', '13.1']] })
    // shapes that cannot be derived from a table fall back to columns
    expect(tableToChart(t, { chartType: 'sankey' }).chartType).toBe('column')
  })
})
