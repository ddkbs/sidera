import { useRef } from 'react'
import { Plus, X } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { CHART_DEFS, changeType, compatibleTypes, parseClipboardTable, seriesNames, vennRows, type ChartData, type ChartOptions, type ChartType } from './model'
import { SCHEMES, colorAt } from './palette'

interface Props {
  data: ChartData
  onChange: (next: ChartData) => void
}

/** Spreadsheet-like editor for any chart: title, type, table (paste from Excel/Numbers) and options. */
export function ChartEditor({ data, onChange }: Props) {
  const def = CHART_DEFS[data.chartType]
  const editableColumns = !def.fixedColumns
  const table = useRef<HTMLTableElement>(null)
  const set = (patch: Partial<ChartData>) => onChange({ ...data, ...patch })
  const setOpt = (patch: Partial<ChartOptions>) => onChange({ ...data, options: { ...data.options, ...patch } })

  const setCell = (r: number, c: number, value: string) => {
    const rows = data.rows.map((row) => [...row])
    rows[r][c] = value
    set({ rows })
  }

  const addRow = () => set({ rows: [...data.rows, data.columns.map(() => '')] })
  const removeRow = (r: number) => data.rows.length > 1 && set({ rows: data.rows.filter((_, i) => i !== r) })
  const addColumn = () => set({ columns: [...data.columns, `Series ${data.columns.length}`], rows: data.rows.map((row) => [...row, '']) })
  const removeColumn = (c: number) =>
    data.columns.length > 2 &&
    onChange({
      ...data,
      columns: data.columns.filter((_, i) => i !== c),
      rows: data.rows.map((row) => row.filter((_, i) => i !== c)),
      options: { ...data.options, lineSeries: data.options.lineSeries?.filter((i) => i !== c - 1).map((i) => (i > c - 1 ? i - 1 : i)) }
    })

  const focusCell = (r: number, c: number) => requestAnimationFrame(() => table.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus())

  const onPaste = (r: number, c: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const cells = parseClipboardTable(text)
    let columns = [...data.columns]
    const rows = data.rows.map((row) => [...row])
    const width = Math.max(...cells.map((row) => row.length))
    if (editableColumns) while (c + width > columns.length) columns = [...columns, `Series ${columns.length}`]
    cells.forEach((line, i) => {
      while (rows.length <= r + i) rows.push(columns.map(() => ''))
      line.forEach((v, j) => {
        if (c + j < columns.length) rows[r + i][c + j] = v
      })
    })
    onChange({ ...data, columns, rows: rows.map((row) => columns.map((_, k) => row[k] ?? '')) })
  }

  const types = compatibleTypes(data.chartType)

  return (
    <div data-node-editor className="nodrag nowheel flex max-h-[min(460px,62vh)] w-[480px] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl">
      <div className="space-y-2 border-b p-3">
        <input
          value={data.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Chart title"
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
        />
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => onChange(changeType(data, t))}
                className={cn('h-6 rounded-md px-2 text-xs transition', t === data.chartType ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              >
                {CHART_DEFS[t].label.replace(/ (chart|plot|diagram)$/, '')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        <table ref={table} className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {data.columns.map((col, c) => (
                <th key={c} className="group sticky top-0 z-10 bg-popover p-0.5 text-left font-medium">
                  {editableColumns ? (
                    <div className="flex items-center">
                      {c > 0 && <span className="mr-1 size-2 shrink-0 rounded-full" style={{ background: colorAt(c - 1) }} />}
                      <input
                        value={col}
                        onChange={(e) => set({ columns: data.columns.map((x, i) => (i === c ? e.target.value : x)) })}
                        className="h-7 w-full min-w-16 rounded-md bg-transparent px-1.5 font-medium text-muted-foreground outline-none hover:bg-accent focus:bg-accent focus:text-foreground"
                      />
                      {c > 0 && data.columns.length > 2 && (
                        <button onClick={() => removeColumn(c)} className="ml-0.5 hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover:grid hover:bg-accent" aria-label="Remove column">
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="px-1.5 py-1.5 text-muted-foreground">{col}</div>
                  )}
                </th>
              ))}
              <th className="w-7 bg-popover">
                {editableColumns && (
                  <button onClick={addColumn} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Add series">
                    <Plus className="size-3.5" />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, r) => (
              <tr key={r} className="group">
                {data.columns.map((_col, c) => {
                  const readOnly = data.chartType === 'venn' && c === 0
                  const numeric = c >= def.numericFrom && !(data.chartType === 'scatter' && c === 3) && !(data.chartType === 'bubble' && c === 4)
                  return (
                    <td key={c} className="p-0.5">
                      <input
                        data-cell={`${r}:${c}`}
                        value={row[c] ?? ''}
                        readOnly={readOnly}
                        inputMode={numeric ? 'decimal' : undefined}
                        placeholder={data.chartType === 'timeline' && c === 0 ? 'YYYY-MM-DD' : ''}
                        onChange={(e) => setCell(r, c, e.target.value)}
                        onPaste={onPaste(r, c)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            if (r === data.rows.length - 1 && data.chartType !== 'venn') addRow()
                            focusCell(r + 1, c)
                          } else if (e.key === 'ArrowDown') focusCell(r + 1, c)
                          else if (e.key === 'ArrowUp') focusCell(r - 1, c)
                        }}
                        className={cn(
                          'h-7 w-full min-w-16 rounded-md border border-transparent bg-muted/50 px-1.5 outline-none focus:border-brand focus:bg-background',
                          numeric && 'text-right tabular-nums',
                          readOnly && 'bg-transparent font-medium text-muted-foreground'
                        )}
                      />
                    </td>
                  )
                })}
                <td className="w-7 p-0.5">
                  {data.chartType !== 'venn' && data.rows.length > 1 && (
                    <button onClick={() => removeRow(r)} className="hidden size-6 place-items-center rounded-md text-muted-foreground group-hover:grid hover:bg-accent" aria-label="Remove row">
                      <X className="size-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.chartType !== 'venn' && (
          <button onClick={() => (addRow(), focusCell(data.rows.length, 0))} className="mt-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-3.5" /> Add row
          </button>
        )}
      </div>

      <Options data={data} setOpt={setOpt} onChange={onChange} />
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">Tip: paste cells from Excel, Numbers or Google Sheets · esc to close</div>
    </div>
  )
}

function Options({ data, setOpt, onChange }: { data: ChartData; setOpt: (p: Partial<ChartOptions>) => void; onChange: (d: ChartData) => void }) {
  const t: ChartType = data.chartType
  const o = data.options
  const toggles: { key: 'legend' | 'stacked' | 'smooth'; label: string }[] = []
  if (['column', 'bar', 'line', 'area', 'combo', 'radar', 'pie', 'donut', 'scatter', 'bubble'].includes(t)) toggles.push({ key: 'legend', label: 'Legend' })
  if (['column', 'bar', 'area', 'combo'].includes(t)) toggles.push({ key: 'stacked', label: 'Stacked' })
  if (['line', 'area', 'combo'].includes(t)) toggles.push({ key: 'smooth', label: 'Smooth' })

  const input = 'h-7 w-full rounded-md bg-muted/50 px-2 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-brand'
  const rows: React.ReactNode[] = []

  if (t === 'combo') {
    const names = seriesNames(data)
    const lines = new Set(o.lineSeries ?? [])
    rows.push(
      <div key="combo" className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-muted-foreground">Show as line:</span>
        {names.map((n, i) => (
          <button
            key={i}
            onClick={() => {
              const next = new Set(lines)
              if (next.has(i)) next.delete(i)
              else next.add(i)
              setOpt({ lineSeries: [...next] })
            }}
            className={cn('h-6 rounded-md border px-2', lines.has(i) ? 'border-brand bg-brand/10 text-brand' : 'text-muted-foreground')}
          >
            {n}
          </button>
        ))}
      </div>
    )
  }
  if (t === 'matrix') {
    const x = o.xAxis ?? ['', '']
    const y = o.yAxis ?? ['', '']
    const q = o.quadrants ?? ['', '', '', '']
    rows.push(
      <div key="matrix" className="grid grid-cols-2 gap-1.5">
        <input className={input} value={q[0]} placeholder="Top left" onChange={(e) => setOpt({ quadrants: [e.target.value, q[1], q[2], q[3]] })} />
        <input className={input} value={q[1]} placeholder="Top right" onChange={(e) => setOpt({ quadrants: [q[0], e.target.value, q[2], q[3]] })} />
        <input className={input} value={q[2]} placeholder="Bottom left" onChange={(e) => setOpt({ quadrants: [q[0], q[1], e.target.value, q[3]] })} />
        <input className={input} value={q[3]} placeholder="Bottom right" onChange={(e) => setOpt({ quadrants: [q[0], q[1], q[2], e.target.value] })} />
        <input className={input} value={x[0]} placeholder="X axis low" onChange={(e) => setOpt({ xAxis: [e.target.value, x[1]] })} />
        <input className={input} value={x[1]} placeholder="X axis high" onChange={(e) => setOpt({ xAxis: [x[0], e.target.value] })} />
        <input className={input} value={y[0]} placeholder="Y axis low" onChange={(e) => setOpt({ yAxis: [e.target.value, y[1]] })} />
        <input className={input} value={y[1]} placeholder="Y axis high" onChange={(e) => setOpt({ yAxis: [y[0], e.target.value] })} />
        <p className="col-span-2 text-[10px] text-muted-foreground">Drag items directly on the matrix to position them.</p>
      </div>
    )
  }
  if (t === 'venn') {
    rows.push(
      <div key="venn" className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Sets</span>
        {([2, 3] as const).map((n) => (
          <button
            key={n}
            onClick={() => onChange({ ...data, options: { ...o, sets: n }, rows: vennRows(n, data.rows) })}
            className={cn('h-6 w-8 rounded-md border', (o.sets ?? 3) === n ? 'border-brand bg-brand/10 text-brand' : 'text-muted-foreground')}
          >
            {n}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground">A, B, C = set names · ∩ = overlaps</span>
      </div>
    )
  }
  if (t === 'heatmap') {
    rows.push(
      <div key="heat" className="flex items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted-foreground">Colour</span>
        {(Object.keys(SCHEMES) as (keyof typeof SCHEMES)[]).map((s) => (
          <button
            key={s}
            aria-label={s}
            onClick={() => setOpt({ scheme: s })}
            className={cn('size-5 rounded-full border-2', (o.scheme ?? 'blue') === s ? 'border-foreground/60' : 'border-transparent')}
            style={{ background: SCHEMES[s] }}
          />
        ))}
      </div>
    )
  }
  if (!toggles.length && !rows.length) return null
  return (
    <div className="space-y-2 border-t px-3 py-2">
      {toggles.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {toggles.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-xs">
              <Switch checked={key === 'legend' ? o.legend !== false : !!o[key]} onCheckedChange={(v) => setOpt({ [key]: v })} className="scale-75" />
              {label}
            </label>
          ))}
        </div>
      )}
      {rows}
    </div>
  )
}
