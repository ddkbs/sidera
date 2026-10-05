import { useRef } from 'react'
import { Plus, X } from '@/components/icons'
import { Switch } from '@/components/ui/switch'
import { labelMap, t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  AXIS_TYPES,
  CHART_DEFS,
  LINE_TYPES,
  changeType,
  compatibleTypes,
  num,
  parseClipboardTable,
  seriesNames,
  vennRows,
  type ChartData,
  type ChartMarker,
  type ChartOptions,
  type ChartType
} from '@shared/charts'
import { SCHEMES, colorAt } from './palette'

/** Short chart type names for the type switcher. */
const TYPE_LABEL = labelMap<ChartType>({
  column: 'chart.type.column',
  bar: 'chart.type.bar',
  line: 'chart.type.line',
  area: 'chart.type.area',
  combo: 'chart.type.combo',
  radar: 'chart.type.radar',
  heatmap: 'chart.type.heatmap',
  pie: 'chart.type.pie',
  donut: 'chart.type.donut',
  scatter: 'chart.type.scatter',
  bubble: 'chart.type.bubble',
  sankey: 'chart.type.sankey',
  timeline: 'chart.type.timeline',
  matrix: 'chart.type.matrix',
  venn: 'chart.type.venn'
})

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
  const addColumn = () => set({ columns: [...data.columns, t('chart.series', { n: data.columns.length })], rows: data.rows.map((row) => [...row, '']) })
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
    if (editableColumns) while (c + width > columns.length) columns = [...columns, t('chart.series', { n: columns.length })]
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
          placeholder={t('chart.title')}
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
        />
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {types.map((type) => (
              <button
                key={type}
                onClick={() => onChange(changeType(data, type))}
                className={cn('h-6 rounded-md px-2 text-xs transition', type === data.chartType ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              >
                {TYPE_LABEL[type]}
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
                        <button onClick={() => removeColumn(c)} className="ml-0.5 hidden size-5 shrink-0 place-items-center rounded text-muted-foreground group-hover:grid hover:bg-accent" aria-label={t('table.colDelete')}>
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
                  <button onClick={addColumn} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title={t('chart.addSeries')}>
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
                        placeholder={data.chartType === 'timeline' && c === 0 ? t('chart.datePlaceholder') : ''}
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
                    <button onClick={() => removeRow(r)} className="hidden size-6 place-items-center rounded-md text-muted-foreground group-hover:grid hover:bg-accent" aria-label={t('table.rowDelete')}>
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
            <Plus className="size-3.5" /> {t('chart.addRow')}
          </button>
        )}
      </div>

      <Options data={data} setOpt={setOpt} onChange={onChange} />
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">{t('chart.tip')}</div>
    </div>
  )
}

function Options({ data, setOpt, onChange }: { data: ChartData; setOpt: (p: Partial<ChartOptions>) => void; onChange: (d: ChartData) => void }) {
  const type: ChartType = data.chartType
  const o = data.options
  const toggles: { key: 'legend' | 'stacked' | 'smooth'; label: string }[] = []
  if (['column', 'bar', 'line', 'area', 'combo', 'radar', 'pie', 'donut', 'scatter', 'bubble'].includes(type)) toggles.push({ key: 'legend', label: t('chart.legend') })
  if (['column', 'bar', 'area', 'combo'].includes(type)) toggles.push({ key: 'stacked', label: t('chart.stacked') })

  const input = 'h-7 w-full rounded-md bg-muted/50 px-2 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-brand'
  const rows: React.ReactNode[] = []

  if (type === 'combo') {
    const names = seriesNames(data)
    const lines = new Set(o.lineSeries ?? [])
    rows.push(
      <div key="combo" className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-muted-foreground">{t('chart.showAsLine')}</span>
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
  if (type === 'matrix') {
    const x = o.xAxis ?? ['', '']
    const y = o.yAxis ?? ['', '']
    const q = o.quadrants ?? ['', '', '', '']
    rows.push(
      <div key="matrix" className="grid grid-cols-2 gap-1.5">
        <input className={input} value={q[0]} placeholder={t('chart.topLeft')} onChange={(e) => setOpt({ quadrants: [e.target.value, q[1], q[2], q[3]] })} />
        <input className={input} value={q[1]} placeholder={t('chart.topRight')} onChange={(e) => setOpt({ quadrants: [q[0], e.target.value, q[2], q[3]] })} />
        <input className={input} value={q[2]} placeholder={t('chart.bottomLeft')} onChange={(e) => setOpt({ quadrants: [q[0], q[1], e.target.value, q[3]] })} />
        <input className={input} value={q[3]} placeholder={t('chart.bottomRight')} onChange={(e) => setOpt({ quadrants: [q[0], q[1], q[2], e.target.value] })} />
        <input className={input} value={x[0]} placeholder={t('chart.xLow')} onChange={(e) => setOpt({ xAxis: [e.target.value, x[1]] })} />
        <input className={input} value={x[1]} placeholder={t('chart.xHigh')} onChange={(e) => setOpt({ xAxis: [x[0], e.target.value] })} />
        <input className={input} value={y[0]} placeholder={t('chart.yLow')} onChange={(e) => setOpt({ yAxis: [e.target.value, y[1]] })} />
        <input className={input} value={y[1]} placeholder={t('chart.yHigh')} onChange={(e) => setOpt({ yAxis: [y[0], e.target.value] })} />
        <p className="col-span-2 text-[10px] text-muted-foreground">{t('chart.matrixHint')}</p>
      </div>
    )
  }
  if (type === 'venn') {
    rows.push(
      <div key="venn" className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t('chart.sets')}</span>
        {([2, 3] as const).map((n) => (
          <button
            key={n}
            onClick={() => onChange({ ...data, options: { ...o, sets: n }, rows: vennRows(n, data.rows) })}
            className={cn('h-6 w-8 rounded-md border', (o.sets ?? 3) === n ? 'border-brand bg-brand/10 text-brand' : 'text-muted-foreground')}
          >
            {n}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground">{t('chart.vennHint')}</span>
      </div>
    )
  }
  if (type === 'heatmap') {
    rows.push(
      <div key="heat" className="flex items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted-foreground">{t('account.color')}</span>
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
  if (AXIS_TYPES.includes(type)) rows.push(<AxisOptions key="axes" type={type} o={o} setOpt={setOpt} categories={data.rows.map((r) => (r[0] ?? '').trim()).filter(Boolean)} />)
  if (!toggles.length && !rows.length) return null
  return (
    <div className="max-h-56 space-y-2 overflow-y-auto border-t px-3 py-2">
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

const CURVES = [
  { value: 'linear', label: 'chart.curve.linear' },
  { value: 'monotone', label: 'chart.curve.monotone' },
  { value: 'spline', label: 'chart.curve.spline' }
] as const
const WIDTHS = [2, 3, 4, 6]

/** Axis titles, grid/values, own axis labels and (line types) curve, width, colour, area, dots, markers. Collapsed by default. */
function AxisOptions({ type, o, setOpt, categories }: { type: ChartType; o: ChartOptions; setOpt: (p: Partial<ChartOptions>) => void; categories: string[] }) {
  const line = LINE_TYPES.includes(type)
  const input = 'h-7 w-full rounded-md bg-muted/50 px-2 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-brand'
  const seg = (on: boolean) => cn('h-6 rounded-md border px-2 text-xs', on ? 'border-brand bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground')
  const curve = o.curve ?? (o.smooth ? 'monotone' : 'linear')
  const dotsShown = type === 'area' ? o.hideDots === false : !o.hideDots
  const switches: { label: string; checked: boolean; set: (v: boolean) => void }[] = [
    { label: t('chart.grid'), checked: !o.hideGrid, set: (v) => setOpt({ hideGrid: !v }) },
    { label: t('chart.axisValues'), checked: !o.hideAxisValues, set: (v) => setOpt({ hideAxisValues: !v }) }
  ]
  if (type === 'area') switches.push({ label: t('chart.fill'), checked: !o.hideArea, set: (v) => setOpt({ hideArea: !v }) })
  if (line) switches.push({ label: t('chart.dots'), checked: dotsShown, set: (v) => setOpt({ hideDots: !v }) })
  return (
    <details className="group/axes text-xs" open={!!(o.xAxisTitle || o.yAxisTitle)}>
      <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">{t(line ? 'chart.axesAndLine' : 'chart.axes')}</summary>
      <div className="mt-2 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input className={input} value={o.xAxisTitle ?? ''} placeholder={t('chart.xAxisTitle')} onChange={(e) => setOpt({ xAxisTitle: e.target.value })} />
          <input className={input} value={o.yAxisTitle ?? ''} placeholder={t('chart.yAxisTitle')} onChange={(e) => setOpt({ yAxisTitle: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-4">
          {switches.map((sw) => (
            <label key={sw.label} className="flex items-center gap-1.5">
              <Switch checked={sw.checked} onCheckedChange={sw.set} className="scale-75" />
              {sw.label}
            </label>
          ))}
        </div>
        {line && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 w-16 text-muted-foreground">{t('chart.curve')}</span>
              {CURVES.map((c) => (
                <button key={c.value} className={seg(curve === c.value)} onClick={() => setOpt({ curve: c.value, smooth: c.value !== 'linear' })}>
                  {t(c.label)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 w-16 text-muted-foreground">{t('chart.lineWidth')}</span>
              {WIDTHS.map((w) => (
                <button key={w} className={seg((o.lineWidth ?? 2) === w)} onClick={() => setOpt({ lineWidth: w })}>
                  {w}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 w-16 text-muted-foreground">{t('chart.lineColor')}</span>
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const c = colorAt(i)
                const on = i === 0 ? !o.lineColor || o.lineColor === c : o.lineColor === c
                return (
                  <button
                    key={i}
                    aria-label={c}
                    onClick={() => setOpt({ lineColor: i === 0 ? '' : c })}
                    className={cn('size-5 rounded-full border-2', on ? 'border-foreground/60' : 'border-transparent')}
                    style={{ background: c }}
                  />
                )
              })}
            </div>
          </>
        )}
        {['line', 'area', 'column'].includes(type) && <SplitOptions o={o} setOpt={setOpt} />}
        {type !== 'bar' && (
          <EntryList
            label={t('chart.yTicks')}
            addLabel={t('chart.addYTick')}
            items={o.yTicks ?? []}
            onChange={(yTicks) => setOpt({ yTicks })}
            create={() => ({ value: 0, label: '' })}
            renderKey={(item, set) => (
              <input
                type="number"
                value={item.value}
                onChange={(e) => set({ ...item, value: num(e.target.value) })}
                onKeyDown={(e) => e.stopPropagation()}
                className={cn(input, 'w-20 shrink-0 text-right tabular-nums')}
                aria-label={t('chart.value')}
              />
            )}
          />
        )}
        {(line || type === 'column') && (
          <EntryList<ChartMarker>
            label={t('chart.markers')}
            addLabel={t('chart.addMarker')}
            items={o.markers ?? []}
            onChange={(markers) => setOpt({ markers })}
            create={() => ({ x: categories[0] ?? '', label: '' })}
            renderKey={(item, set) => (
              <select
                value={item.x}
                onChange={(e) => set({ ...item, x: e.target.value, y: undefined })}
                className={cn(input, 'w-28 shrink-0 cursor-pointer')}
                aria-label={t('chart.category')}
              >
                {!categories.includes(item.x) && <option value={item.x}>{item.x || '—'}</option>}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          />
        )}
      </div>
    </details>
  )
}

/** "Colour by value": everything above the Y value in one colour, below in another. */
function SplitOptions({ o, setOpt }: { o: ChartOptions; setOpt: (p: Partial<ChartOptions>) => void }) {
  const split = o.split
  const swatches = (current: string, pick: (c: string) => void) =>
    [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
      <button
        key={i}
        aria-label={colorAt(i)}
        onClick={() => pick(colorAt(i))}
        className={cn('size-4 rounded-full border-2', current === colorAt(i) ? 'border-foreground/60' : 'border-transparent')}
        style={{ background: colorAt(i) }}
      />
    ))
  return (
    <div className="space-y-1.5 rounded-md bg-muted/40 p-2">
      <label className="flex items-center gap-1.5">
        <Switch checked={!!split} onCheckedChange={(v) => setOpt({ split: v ? { value: 0, above: colorAt(0), below: colorAt(4) } : null })} className="scale-75" />
        {t('chart.split')}
        {split && (
          <input
            type="number"
            value={split.value}
            onChange={(e) => setOpt({ split: { ...split, value: num(e.target.value) } })}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-6 w-16 rounded-md bg-background px-1.5 text-right tabular-nums outline-none focus:ring-1 focus:ring-brand"
            aria-label={t('chart.value')}
          />
        )}
      </label>
      {split && (
        <>
          <div className="flex items-center gap-1">
            <span className="w-16 text-muted-foreground">{t('chart.splitAbove')}</span>
            {swatches(split.above, (c) => setOpt({ split: { ...split, above: c } }))}
          </div>
          <div className="flex items-center gap-1">
            <span className="w-16 text-muted-foreground">{t('chart.splitBelow')}</span>
            {swatches(split.below, (c) => setOpt({ split: { ...split, below: c } }))}
          </div>
        </>
      )}
    </div>
  )
}

/** Small editable list (key control + label + remove), used for own axis labels and marked points. */
function EntryList<T extends { label: string }>({
  label,
  addLabel,
  items,
  onChange,
  create,
  renderKey
}: {
  label: string
  addLabel: string
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  renderKey: (item: T, set: (next: T) => void) => React.ReactNode
}) {
  const input = 'h-7 w-full rounded-md bg-muted/50 px-2 text-xs outline-none focus:bg-background focus:ring-1 focus:ring-brand'
  const setAt = (i: number) => (next: T) => onChange(items.map((x, j) => (j === i ? next : x)))
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground">{label}</div>
      {items.map((item, i) => (
        <div key={i} className="group flex items-center gap-1.5">
          {renderKey(item, setAt(i))}
          <input
            value={item.label}
            placeholder={t('chart.labelText')}
            onChange={(e) => setAt(i)({ ...item, label: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            className={input}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={t('common.delete')}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, create()])} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
        <Plus className="size-3" /> {addLabel}
      </button>
    </div>
  )
}
