import { memo, useMemo, useRef } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
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
import { locale, t, useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { CHART_DEFS, VENN_REGIONS, num, sankeyData, seriesNames, seriesRows, type ChartData } from '@shared/charts'
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
const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--muted-foreground)' }} />

interface Props {
  data: ChartData
  /** Matrix only: drag an item to a new position (x, y in 0–100) */
  onMoveItem?: (row: number, x: number, y: number) => void
}

/** Renders any chart type into its parent (fills 100% × 100%). */
export const ChartView = memo(function ChartView({ data, onMoveItem }: Props) {
  useLang() // memoised: re-render on language change
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
      const curve = options.smooth ? 'monotone' : 'linear'
      switch (type) {
        case 'bar':
          return (
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" {...axis} />
              <YAxis type="category" dataKey="label" width={70} {...axis} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId={stack} fill={colorAt(i)} radius={stack ? 0 : [0, 4, 4, 0]} />
              ))}
            </BarChart>
          )
        case 'line':
          return (
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Line key={n} dataKey={n} type={curve} stroke={colorAt(i)} strokeWidth={2.2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          )
        case 'area':
          return (
            <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Area key={n} dataKey={n} type={curve} stackId={stack} stroke={colorAt(i)} fill={colorAt(i)} fillOpacity={0.25} strokeWidth={2} />
              ))}
            </AreaChart>
          )
        case 'combo': {
          const lines = new Set(options.lineSeries ?? [names.length - 1])
          return (
            <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis yAxisId="left" {...axis} />
              <YAxis yAxisId="right" orientation="right" {...axis} />
              {tooltip}
              {options.legend !== false && legend}
              {names.map((n, i) =>
                lines.has(i) ? (
                  <Line key={n} yAxisId="right" dataKey={n} type={curve} stroke={colorAt(i)} strokeWidth={2.4} dot={{ r: 3 }} />
                ) : (
                  <Bar key={n} yAxisId="left" dataKey={n} stackId={stack} fill={colorAt(i)} radius={stack ? 0 : [4, 4, 0, 0]} />
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
            <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              {grid}
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} />
              {tooltip}
              {options.legend !== false && names.length > 1 && legend}
              {names.map((n, i) => (
                <Bar key={n} dataKey={n} stackId={stack} fill={colorAt(i)} radius={stack ? 0 : [4, 4, 0, 0]} />
              ))}
            </BarChart>
          )
      }
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
        <ScatterChart margin={{ top: bubble ? 24 : 8, right: bubble ? 28 : 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name="X" {...axis} />
          <YAxis type="number" dataKey="y" name="Y" {...axis} />
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
