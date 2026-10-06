import { memo, useId, useMemo, useRef } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  ReferenceDot,
  ReferenceLine,
  RadarChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts'
import { curveCatmullRom } from 'victory-vendor/d3-shape'
import { locale, t, useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CHART_DEFS, VENN_REGIONS, num, sankeyData, seriesNames, seriesRows, valueAt, waterfallBars, type ChartData, type ChartOptions } from '@shared/charts'
import { SCHEMES, colorAt } from './palette'

const axis = { stroke: 'var(--border)', tick: { fill: 'var(--muted-foreground)', fontSize: 11 }, tickLine: false }
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
const tooltip = (
  <Tooltip
    cursor={{ fill: 'color-mix(in oklch, var(--foreground) 5%, transparent)' }}
    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }}
    labelStyle={{ color: 'var(--muted-foreground)' }}
  />
)
const axisTitle = { fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }
const SPLINE = curveCatmullRom.alpha(0.5)

/** Props for the horizontal axis: title, hidden values, own category labels (`numeric` = scatter/bubble X). */
function xAxisProps(o: ChartOptions, numeric = false) {
  const custom = o.xTicks?.length ? o.xTicks : null
  return {
    ...axis,
    height: o.xAxisTitle ? 44 : 30,
    ...(o.hideAxisValues && !custom ? { tick: false } : {}),
    ...(custom
      ? {
          ticks: custom.map((c) => (numeric ? num(c.value) : c.value)),
          tickFormatter: (v: unknown) => custom.find((c) => (numeric ? num(c.value) === v : c.value === String(v)))?.label ?? '',
          interval: 0 as const
        }
      : {}),
    label: o.xAxisTitle ? { value: o.xAxisTitle, position: 'insideBottom' as const, offset: 2, style: axisTitle } : undefined
  }
}

/** Props for the vertical value axis: title (rotated), hidden values, own labels at given values. */
function yAxisProps(o: ChartOptions, numeric = true) {
  const custom = numeric && o.yTicks?.length ? o.yTicks : null
  const longest = custom ? Math.max(...custom.map((c) => c.label.length)) : 0
  return {
    ...axis,
    width: (custom ? Math.min(120, 16 + longest * 6) : o.yAxisTitle ? 44 : 60) + (o.yAxisTitle ? 18 : 0),
    ...(o.hideAxisValues && !custom ? { tick: false } : {}),
    ...(custom
      ? {
          ticks: custom.map((c) => c.value),
          tickFormatter: (v: unknown) => custom.find((c) => c.value === v)?.label ?? '',
          interval: 0 as const,
          domain: [(min: number) => Math.min(min, ...custom.map((c) => c.value)), (max: number) => Math.max(max, ...custom.map((c) => c.value))] as [
            (n: number) => number,
            (n: number) => number
          ]
        }
      : {}),
    label: o.yAxisTitle ? { value: o.yAxisTitle, angle: -90, position: 'insideLeft' as const, style: { ...axisTitle, textAnchor: 'middle' as const } } : undefined
  }
}

/** Left chart margin: room for a y title, otherwise the usual tight fit. */
const marginLeft = (o: ChartOptions) => (o.yAxisTitle || o.yTicks?.length ? 4 : -12)

function curveOf(o: ChartOptions) {
  const c = o.curve ?? (o.smooth ? 'monotone' : 'linear')
  return c === 'spline' ? SPLINE : c
}

/** Series colour: the first series may have its own colour. */
const seriesColor = (o: ChartOptions, i: number) => (i === 0 && o.lineColor ? o.lineColor : colorAt(i))

function markers(data: ChartData) {
  const last = Math.max(1, data.rows.length - 1)
  return (data.options.markers ?? []).map((m, i) => {
    const y = m.y ?? valueAt(data, m.x)
    if (y === null) return null
    // labels near the left/right edge grow inwards so they are never cut off by the chart box
    const pos = data.rows.findIndex((r) => (r[0] ?? '').trim() === m.x.trim()) / last
    const anchor = pos > 0.75 ? 'end' : pos < 0.25 && pos >= 0 ? 'start' : 'middle'
    const dx = anchor === 'end' ? 6 : anchor === 'start' ? -6 : 0
    return (
      <ReferenceDot
        key={`m${i}`}
        x={m.x}
        y={y}
        r={5}
        fill={seriesColor(data.options, 0)}
        stroke="var(--card)"
        strokeWidth={2}
        ifOverflow="extendDomain"
        label={
          m.label
            ? {
                content: (p: { viewBox?: unknown }) => {
                  const vb = p.viewBox as { x: number; y: number; width: number } | undefined
                  if (!vb) return null
                  return (
                    <text x={vb.x + vb.width / 2 + dx} y={vb.y - 8} textAnchor={anchor} fontSize={11} fontWeight={600} fill="var(--foreground)">
                      {m.label}
                    </text>
                  )
                }
              }
            : undefined
        }
      />
    )
  })
}

const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }} />

interface Props {
  data: ChartData
  /** Matrix only: drag an item to a new position (x, y in 0–100) */
  onMoveItem?: (row: number, x: number, y: number) => void
}

/** Renders any chart type into its parent (fills 100% × 100%). */
export const ChartView = memo(function ChartView({ data, onMoveItem }: Props) {
  useLang() // memoised: re-render on language change
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '')
  const { chartType: type, options } = data
  const shape = CHART_DEFS[type].shape

  if (type === 'timeline') return <Timeline data={data} />
  if (type === 'matrix') return <Matrix data={data} onMoveItem={onMoveItem} />
  if (type === 'venn') return <Venn data={data} />
  if (type === 'heatmap') return <Heatmap data={data} />

  return (
    <ResponsiveContainer width="100%" height="100%">
      {renderRecharts()}
    </ResponsiveContainer>
  )

  function renderRecharts() {
    if (shape === 'series') {
      const rows = seriesRows(data)
      const names = seriesNames(data)
      const stack = options.stacked ? 'a' : undefined
      const curve = curveOf(options)
      const g = options.hideGrid ? null : grid
      const width = options.lineWidth ?? 2.2
      const dot = options.hideDots ? false : { r: 3 }
      // two-colour split at a Y value: hard-stop gradients over each series' bounding box (line + area),
      // per-bar colour for columns. The area fill is drawn against the split value (baseValue) so its box is known too.
      const split = options.split && !stack ? options.split : undefined
      const range = (n: string, extra?: number) => {
        const v = rows.map((r) => Number(r[n])).concat(extra === undefined ? [] : [extra])
        return [Math.min(...v), Math.max(...v)] as const
      }
      const gradient = (id: string, [min, max]: readonly [number, number]) =>
        max === min ? null : (
          <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset={Math.min(1, Math.max(0, (max - split!.value) / (max - min)))} stopColor={split!.above} />
            <stop offset={Math.min(1, Math.max(0, (max - split!.value) / (max - min)))} stopColor={split!.below} />
          </linearGradient>
        )
      const splitPaint = (n: string, i: number, kind: 'stroke' | 'fill') => {
        if (!split) return seriesColor(options, i)
        const [min, max] = range(n, kind === 'fill' ? split.value : undefined)
        if (max === min) return min >= split.value ? split.above : split.below
        return `url(#${uid}-${kind}${i})`
      }
      // the hover dot would inherit the gradient stroke and paint itself half/half — give it a solid colour by its value
      const activeDot = (n: string, r: number) =>
        split
          ? (p: { cx?: number; cy?: number; payload?: Record<string, unknown> }) => (
              <circle cx={p.cx} cy={p.cy} r={r} fill={Number(p.payload?.[n]) >= split.value ? split.above : split.below} stroke="var(--background)" strokeWidth={2} />
            )
          : { r }
      const splitDefs = split && (
        <defs>
          {names.flatMap((n, i) => [gradient(`${uid}-stroke${i}`, range(n)), type === 'area' ? gradient(`${uid}-fill${i}`, range(n, split.value)) : null])}
        </defs>
      )
      switch (type) {
        case 'bar':
          return (
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              {!options.hideGrid && <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />}
              <XAxis type="number" {...xAxisProps({ ...options, xTicks: undefined })} />
              <YAxis type="category" dataKey="label" {...yAxisProps(options, false)} width={70 + (options.yAxisTitle ? 18 : 0)} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId={stack} fill={colorAt(i)} radius={stack ? 0 : [0, 4, 4, 0]} />
              ))}
            </BarChart>
          )
        case 'line':
          return (
            <LineChart data={rows} margin={{ top: options.markers?.length ? 22 : 8, right: 12, bottom: 0, left: marginLeft(options) }}>
              {g}
              <XAxis dataKey="label" {...xAxisProps(options)} />
              <YAxis {...yAxisProps(options)} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {splitDefs}
              {names.map((n, i) => (
                <Line key={n} dataKey={n} type={curve} stroke={splitPaint(n, i, 'stroke')} strokeWidth={width} dot={split ? false : dot} activeDot={activeDot(n, 5)} />
              ))}
              {markers(data)}
            </LineChart>
          )
        case 'area':
          return (
            <AreaChart data={rows} margin={{ top: options.markers?.length ? 22 : 8, right: 12, bottom: 0, left: marginLeft(options) }}>
              {g}
              <XAxis dataKey="label" {...xAxisProps(options)} />
              <YAxis {...yAxisProps(options)} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {splitDefs}
              {names.map((n, i) => (
                <Area
                  key={n}
                  dataKey={n}
                  type={curve}
                  stackId={stack}
                  baseValue={split ? split.value : undefined}
                  stroke={splitPaint(n, i, 'stroke')}
                  fill={splitPaint(n, i, 'fill')}
                  fillOpacity={options.hideArea ? 0 : 0.25}
                  strokeWidth={options.lineWidth ?? 2}
                  dot={options.hideDots === false ? activeDot(n, 3) : false}
                  activeDot={activeDot(n, 4)}
                />
              ))}
              {markers(data)}
            </AreaChart>
          )
        case 'combo': {
          const lines = new Set(options.lineSeries ?? [names.length - 1])
          return (
            <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: marginLeft(options) }}>
              {g}
              <XAxis dataKey="label" {...xAxisProps(options)} />
              <YAxis yAxisId="left" {...yAxisProps(options)} />
              <YAxis yAxisId="right" orientation="right" {...axis} {...(options.hideAxisValues ? { tick: false } : {})} />
              {tooltip}
              {options.legend !== false && legend}
              {names.map((n, i) =>
                lines.has(i) ? (
                  <Line key={n} yAxisId="right" dataKey={n} type={curve} stroke={seriesColor(options, i)} strokeWidth={options.lineWidth ?? 2.4} dot={dot} />
                ) : (
                  <Bar key={n} yAxisId="left" dataKey={n} stackId={stack} fill={seriesColor(options, i)} radius={stack ? 0 : [4, 4, 0, 0]} />
                )
              )}
            </ComposedChart>
          )
        }
        case 'radar':
          return (
            <RadarChart data={rows} outerRadius="72%">
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis dataKey="label" tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} />
              <PolarRadiusAxis tick={false} axisLine={false} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Radar key={n} dataKey={n} stroke={colorAt(i)} fill={colorAt(i)} fillOpacity={0.2} strokeWidth={2} />
              ))}
            </RadarChart>
          )
        default:
          return (
            <BarChart data={rows} margin={{ top: options.markers?.length ? 22 : 8, right: 12, bottom: 0, left: marginLeft(options) }}>
              {g}
              <XAxis dataKey="label" {...xAxisProps(options)} />
              <YAxis {...yAxisProps(options)} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId={stack} fill={seriesColor(options, i)} radius={stack ? 0 : [4, 4, 0, 0]}>
                  {split && rows.map((r, ri) => <Cell key={ri} fill={Number(r[n]) >= split.value ? split.above : split.below} />)}
                </Bar>
              ))}
              {markers(data)}
            </BarChart>
          )
      }
    }
    if (type === 'waterfall') {
      const fmt = (v: number) => v.toLocaleString(locale(), { maximumFractionDigits: 2 })
      const colors = { up: options.upColor || colorAt(1), down: options.downColor || colorAt(4), total: options.totalColor || colorAt(0) }
      // floating bars: each bar is the range [low, high] between the running total before and after the step
      const bars = waterfallBars(data, t('chart.total')).map((b) => ({
        ...b,
        range: [Math.min(b.start, b.end), Math.max(b.start, b.end)],
        text: b.kind === 'total' ? fmt(b.value) : `${b.value > 0 ? '+' : b.value < 0 ? '−' : ''}${fmt(Math.abs(b.value))}`
      }))
      return (
        <BarChart data={bars} margin={{ top: options.hideValues ? 8 : 20, right: 12, bottom: 0, left: marginLeft(options) }}>
          {!options.hideGrid && grid}
          <XAxis dataKey="label" interval={0} {...xAxisProps(options)} />
          <YAxis {...yAxisProps(options)} />
          <Tooltip
            cursor={{ fill: 'color-mix(in oklch, var(--foreground) 5%, transparent)' }}
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--popover-foreground)' }}
            labelStyle={{ color: 'var(--muted-foreground)' }}
            formatter={(_v, _n, item) => [(item.payload as { text: string }).text, '']}
            separator=""
          />
          <Bar dataKey="range" radius={3} isAnimationActive={false}>
            {bars.map((b, i) => (
              <Cell key={i} fill={colors[b.kind]} />
            ))}
            {!options.hideValues && <LabelList dataKey="text" position="top" style={{ fill: 'var(--muted-foreground)', fontSize: 11, fontWeight: 500 }} />}
          </Bar>
          {/* dashed connector from the end of each bar to the next one */}
          {!options.hideConnectors &&
            bars.slice(0, -1).map((b, i) => (
              <ReferenceLine
                key={`c${i}`}
                segment={[
                  { x: b.label, y: b.end },
                  { x: bars[i + 1].label, y: b.end }
                ]}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.6}
                strokeDasharray="3 3"
                ifOverflow="visible"
              />
            ))}
        </BarChart>
      )
    }
    if (shape === 'parts') {
      const rows = data.rows.map((r) => ({ name: r[0] || '—', value: num(r[1]) })).filter((r) => r.value > 0)
      return (
        <PieChart>
          {tooltip}
          {options.legend !== false && legend}
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={type === 'donut' ? '55%' : 0}
            outerRadius="76%"
            paddingAngle={type === 'donut' ? 2 : 0}
            stroke="var(--card)"
            strokeWidth={2}
            label={({ percent }: { percent?: number }) => ((percent ?? 0) >= 0.08 ? `${Math.round((percent ?? 0) * 100)}%` : '')}
            labelLine={false}
            fontSize={11}
          >
            {rows.map((_r, i) => (
              <Cell key={i} fill={colorAt(i)} />
            ))}
          </Pie>
        </PieChart>
      )
    }
    if (shape === 'points' || shape === 'bubbles') {
      const bubble = shape === 'bubbles'
      const groupCol = bubble ? 4 : 3
      const groups = [...new Set(data.rows.map((r) => r[groupCol]?.trim() || t('chart.data')))]
      return (
        <ScatterChart margin={{ top: bubble ? 24 : 8, right: bubble ? 28 : 16, bottom: 0, left: marginLeft(options) }}>
          {!options.hideGrid && <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />}
          <XAxis type="number" dataKey="x" name={options.xAxisTitle || 'X'} {...xAxisProps(options, true)} />
          <YAxis type="number" dataKey="y" name={options.yAxisTitle || 'Y'} {...yAxisProps(options)} />
          {bubble && <ZAxis type="number" dataKey="z" range={[60, 1400]} name={t('chart.size')} />}
          {tooltip}
          {options.legend !== false && groups.length > 1 && legend}
          {groups.map((g, gi) => (
            <Scatter
              key={g}
              name={g}
              fill={colorAt(gi)}
              fillOpacity={bubble ? 0.55 : 0.9}
              data={data.rows
                .filter((r) => (r[groupCol]?.trim() || t('chart.data')) === g)
                .map((r) => ({ name: r[0], x: num(r[1]), y: num(r[2]), z: bubble ? num(r[3]) : 1 }))}
            />
          ))}
        </ScatterChart>
      )
    }
    // flows → Sankey
    const s = sankeyData(data)
    if (!s.links.length) return <div className="grid h-full place-items-center text-xs text-muted-foreground">{t('chart.addFlows')}</div>
    return (
      <Sankey data={s} nodePadding={18} nodeWidth={10} margin={{ top: 8, right: 90, bottom: 8, left: 8 }} link={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.25 }} node={<SankeyNode />}>
        {tooltip}
      </Sankey>
    )
  }
})

function SankeyNode(props: { x?: number; y?: number; width?: number; height?: number; index?: number; payload?: { name: string; value: number } }) {
  const { x = 0, y = 0, width = 0, height = 0, index = 0, payload } = props
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={colorAt(index)} rx={2} />
      <text x={x + width + 6} y={y + height / 2} dy="0.35em" fontSize={11} fill="var(--foreground)">
        {payload?.name} <tspan fill="var(--muted-foreground)">{payload?.value}</tspan>
      </text>
    </g>
  )
}

function Timeline({ data }: Props) {
  const events = useMemo(
    () =>
      data.rows
        .filter((r) => r[1]?.trim() || r[0]?.trim())
        .map((r) => ({ date: r[0] ?? '', title: r[1] ?? '', detail: r[2] ?? '', t: Date.parse(r[0] ?? '') }))
        .sort((a, b) => (Number.isNaN(a.t) || Number.isNaN(b.t) ? 0 : a.t - b.t)),
    [data.rows]
  )
  const fmt = (e: { date: string; t: number }) => (Number.isNaN(e.t) ? e.date : new Date(e.t).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }))
  return (
    <div className="relative flex h-full w-full items-center px-2">
      <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 rounded bg-border" />
      <div className="relative flex w-full justify-between gap-2">
        {events.map((e, i) => {
          const up = i % 2 === 0
          return (
            <div key={i} className="relative flex min-w-0 flex-1 flex-col items-center">
              <div className={cn('absolute left-1/2 w-full max-w-40 -translate-x-1/2 text-center', up ? 'bottom-4' : 'top-4')}>
                <div className="text-[10px] font-medium tracking-wide text-muted-foreground">{fmt(e)}</div>
                <div className="truncate text-sm font-semibold">{e.title}</div>
                {e.detail && <div className="line-clamp-2 text-[11px] text-muted-foreground">{e.detail}</div>}
              </div>
              <span className="z-10 size-3.5 rounded-full border-2 border-card" style={{ background: colorAt(i) }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Matrix({ data, onMoveItem }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const o = data.options
  const q = o.quadrants ?? ['', '', '', '']
  const drag = (row: number) => (e: React.PointerEvent) => {
    if (!onMoveItem || !box.current) return
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const rect = box.current.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const x = Math.round(Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100)))
      const y = Math.round(Math.min(100, Math.max(0, (1 - (ev.clientY - rect.top) / rect.height) * 100)))
      onMoveItem(row, x, y)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  return (
    <div className="flex h-full w-full flex-col gap-1 text-[10px] text-muted-foreground">
      <div className="flex min-h-0 flex-1 gap-1">
        <div className="relative w-4 shrink-0">
          <span className="absolute bottom-1 left-0 origin-bottom-left translate-x-3.5 -rotate-90 whitespace-nowrap">{o.yAxis?.[0]}</span>
          <span className="absolute top-1 left-0 origin-top-left translate-y-full -rotate-90 whitespace-nowrap">{o.yAxis?.[1]}</span>
        </div>
        <div ref={box} className="relative grid min-h-0 flex-1 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border">
          {[q[0], q[1], q[2], q[3]].map((label, i) => (
            <div
              key={i}
              className={cn('p-2 text-xs font-semibold text-foreground/70', i % 2 === 0 && 'border-r', i < 2 && 'border-b')}
              style={{ background: `color-mix(in oklch, ${colorAt(i)} 7%, transparent)` }}
            >
              {label}
            </div>
          ))}
          {data.rows.map((r, i) => {
            const x = Math.min(100, Math.max(0, num(r[1])))
            const y = Math.min(100, Math.max(0, num(r[2])))
            return (
              <div
                key={i}
                onPointerDown={drag(i)}
                className={cn('nodrag absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap', onMoveItem && 'cursor-grab active:cursor-grabbing')}
                style={{ left: `${x}%`, top: `${100 - y}%` }}
              >
                <span className="size-3 shrink-0 rounded-full border-2 border-card shadow" style={{ background: colorAt(i) }} />
                <span className="rounded bg-card/80 px-1 text-[11px] font-medium text-foreground backdrop-blur">{r[0]}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex justify-between pl-5">
        <span>{o.xAxis?.[0]}</span>
        <span>{o.xAxis?.[1]}</span>
      </div>
    </div>
  )
}

function Venn({ data }: Props) {
  const sets = data.options.sets ?? 3
  const text = new Map(data.rows.map((r) => [r[0], r[1] ?? '']))
  const W = 300
  const H = sets === 3 ? 280 : 200
  const r = sets === 3 ? 82 : 78
  const centers =
    sets === 3
      ? [
          { x: 150 - 48, y: 105 },
          { x: 150 + 48, y: 105 },
          { x: 150, y: 185 }
        ]
      : [
          { x: 150 - 50, y: 100 },
          { x: 150 + 50, y: 100 }
        ]
  const regionPos: Record<string, { x: number; y: number }> =
    sets === 3
      ? {
          A: { x: 72, y: 88 }, B: { x: 228, y: 88 }, C: { x: 150, y: 230 },
          'A∩B': { x: 150, y: 70 }, 'A∩C': { x: 108, y: 165 }, 'B∩C': { x: 192, y: 165 }, 'A∩B∩C': { x: 150, y: 132 }
        }
      : { A: { x: 72, y: 100 }, B: { x: 228, y: 100 }, 'A∩B': { x: 150, y: 100 } }
  const setNames = ['A', 'B', 'C'].slice(0, sets)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {centers.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={r} fill={colorAt(i)} fillOpacity={0.22} stroke={colorAt(i)} strokeWidth={1.5} />
      ))}
      {VENN_REGIONS[sets].map((region) => {
        const p = regionPos[region]
        const isSet = setNames.includes(region)
        const label = text.get(region)
        if (!label) return null
        return (
          <text key={region} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={isSet ? 12 : 10} fontWeight={isSet ? 600 : 500} fill="var(--foreground)">
            {label.length > 18 ? label.slice(0, 17) + '…' : label}
          </text>
        )
      })}
    </svg>
  )
}

function Heatmap({ data }: Props) {
  const cols = data.columns.slice(1)
  const values = data.rows.flatMap((r) => r.slice(1).map(num))
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const color = SCHEMES[data.options.scheme ?? 'blue']
  return (
    <div className="grid h-full w-full gap-1 text-[11px]" style={{ gridTemplateColumns: `auto repeat(${cols.length}, minmax(0, 1fr))`, gridTemplateRows: `auto repeat(${data.rows.length}, minmax(0, 1fr))` }}>
      <div />
      {cols.map((c, i) => (
        <div key={i} className="truncate text-center text-muted-foreground">
          {c}
        </div>
      ))}
      {data.rows.map((r, ri) => (
        <div key={ri} className="contents">
          <div className="flex items-center pr-1 text-muted-foreground">{r[0]}</div>
          {cols.map((_c, ci) => {
            const v = num(r[ci + 1])
            const pct = max === min ? 50 : Math.round(8 + ((v - min) / (max - min)) * 88)
            return (
              <div
                key={ci}
                title={`${r[0]} · ${cols[ci]}: ${v}`}
                className="grid place-items-center rounded-md font-medium tabular-nums"
                style={{ background: `color-mix(in oklch, ${color} ${pct}%, transparent)`, color: pct > 55 ? 'white' : 'var(--foreground)' }}
              >
                {r[ci + 1]}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
