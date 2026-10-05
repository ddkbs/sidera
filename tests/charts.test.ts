import { describe, expect, it } from 'vitest'
import { CHART_DEFS, changeType, valueAt, compatibleTypes, defaultChart, parseClipboardTable, sankeyData, seriesRows, vennRows, type ChartType } from '../src/shared/charts'

describe('chart model', () => {
  it('provides sensible defaults for every type', () => {
    for (const t of Object.keys(CHART_DEFS) as ChartType[]) {
      const d = defaultChart(t)
      expect(d.rows.length).toBeGreaterThan(0)
      expect(d.rows.every((r) => r.length === d.columns.length)).toBe(true)
    }
  })

  it('switches between compatible types without losing data and converts others', () => {
    const col = defaultChart('column')
    expect(compatibleTypes('column')).toEqual(expect.arrayContaining(['bar', 'line', 'area', 'combo', 'radar', 'heatmap']))
    const line = changeType(col, 'line')
    expect(line.rows).toBe(col.rows)
    const bubble = changeType(defaultChart('scatter'), 'bubble')
    expect(bubble.columns).toEqual(['Label', 'X', 'Y', 'Size', 'Group'])
    expect(bubble.rows[0]).toHaveLength(5)
    expect(changeType(col, 'pie').columns).toEqual(['Label', 'Value'])
  })

  it('maps series tables and sankey flows', () => {
    const rows = seriesRows({ ...defaultChart('column'), columns: ['M', 'A', ''], rows: [['Jan', '1,5', 'x']] })
    expect(rows).toEqual([{ label: 'Jan', A: 1.5, 'Series 2': 0 }])
    const s = sankeyData({ ...defaultChart('sankey'), rows: [['a', 'b', '5'], ['b', 'a', '3'], ['b', 'c', '2'], ['c', 'c', '1'], ['', 'x', '1']] })
    expect(s.nodes.map((n) => n.name)).toEqual(['a', 'b', 'c'])
    expect(s.links).toEqual([{ source: 0, target: 1, value: 5 }, { source: 1, target: 2, value: 2 }])
  })

  it('parses pasted spreadsheet data and keeps venn texts', () => {
    expect(parseClipboardTable('a\tb\n1\t2\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseClipboardTable('x;"y"')).toEqual([['x', 'y']])
    expect(vennRows(2, [['A', 'Design'], ['A∩B∩C', 'All']])).toEqual([['A', 'Design'], ['B', ''], ['A∩B', '']])
  })

  it('finds the value a marker sits on', () => {
    const chart = defaultChart('line')
    expect(valueAt(chart, chart.rows[1][0])).toBe(Number(chart.rows[1][1]))
    expect(valueAt(chart, 'nope')).toBeNull()
  })
})
