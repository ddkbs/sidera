import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowHeadBoth,
  ArrowHeadEnd,
  ArrowHeadNone,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FlowShapeIcons,
  LineDotted,
  LineSolid,
  LineThick,
  Plus,
  X,
  type AppIcon
} from '@/components/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { colorName } from '@/lib/colors'
import { labelMap, t, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  FLOW_COLORS,
  FLOW_SHAPES,
  MAIN_SHAPES,
  addEdge,
  addNode,
  getCurve,
  nodeColor,
  parseFlowchart,
  removeEdge,
  removeNode,
  serializeFlowchart,
  setCurve,
  setNodeColor,
  updateEdge,
  updateNode,
  type EdgeArrow,
  type EdgeStyle,
  type FlowCurve,
  type FlowDirection,
  type FlowShape,
  type Flowchart
} from '@shared/flowchart'

interface Props {
  source: string
  /** Mermaid render error for the current source */
  error: string | null
  onChange: (source: string) => void
}

type Tab = 'nodes' | 'connections' | 'layout' | 'code'

const input = 'h-7 w-full min-w-0 rounded-md border border-transparent bg-muted/50 px-2 text-xs outline-none focus:border-brand focus:bg-background'
const iconBtn = 'grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground'

/** Floating editor for Mermaid diagrams: structured tabs for flowcharts, raw source for everything. */
export function FlowchartEditor({ source, error, onChange }: Props) {
  const chart = useMemo(() => parseFlowchart(source), [source])
  const [tab, setTab] = useState<Tab>(chart ? 'nodes' : 'code')
  const apply = (next: Flowchart) => onChange(serializeFlowchart(next))
  const body = useRef<HTMLDivElement>(null)
  const focus = (selector: string) => requestAnimationFrame(() => body.current?.querySelector<HTMLInputElement>(selector)?.focus())

  return (
    <div
      data-node-editor
      onKeyDown={(e) => e.stopPropagation()}
      className="nodrag nowheel flex max-h-[min(480px,64vh)] w-[480px] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
    >
      <Tabs value={chart ? tab : 'code'} onValueChange={(v) => setTab(v as Tab)} className="min-h-0 flex-1 gap-0">
        <div className="flex items-center justify-between border-b px-2 py-1.5">
          <TabsList className="h-7">
            {(['nodes', 'connections', 'layout'] as const).map((tab) => (
              <TabsTrigger key={tab} value={tab} disabled={!chart} className="px-2.5 text-xs">
                {t(`flow.tab.${tab}`)}
              </TabsTrigger>
            ))}
            <TabsTrigger value="code" className="px-2.5 text-xs">
              {t('flow.tab.code')}
            </TabsTrigger>
          </TabsList>
          {!chart && <span className="pr-1 text-[10px] text-muted-foreground">Mermaid</span>}
        </div>

        <div ref={body} className="min-h-0 flex-1 overflow-auto">
          {chart && (
            <>
              <TabsContent value="nodes" className="p-2">
                <NodesTab chart={chart} apply={apply} focus={focus} />
              </TabsContent>
              <TabsContent value="connections" className="p-2">
                <ConnectionsTab chart={chart} apply={apply} focus={focus} />
              </TabsContent>
              <TabsContent value="layout" className="p-3">
                <LayoutTab chart={chart} apply={apply} />
              </TabsContent>
            </>
          )}
          <TabsContent value="code" className="flex flex-col">
            <CodeTab source={source} onChange={onChange} autoFocus={!chart} />
          </TabsContent>
        </div>
      </Tabs>

      {error && <div className="border-t bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{error.split('\n')[0]}</div>}
      <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
        {chart ? t('flow.tip') : t('flow.notFlowchart')}
      </div>
    </div>
  )
}

interface TabProps {
  chart: Flowchart
  apply: (next: Flowchart) => void
  focus: (selector: string) => void
}

function NodesTab({ chart, apply, focus }: TabProps) {
  const shapeOptions = (current: FlowShape) => (MAIN_SHAPES.includes(current) ? MAIN_SHAPES : [...MAIN_SHAPES, current])
  return (
    <div className="space-y-0.5">
      {chart.nodes.map((n) => {
        const color = nodeColor(n)
        const fill = FLOW_COLORS.find((c) => c.name === color)
        return (
          <div key={n.id} className="group flex items-center gap-1.5">
            {n.external ? (
              <span className="grid size-6 shrink-0 place-items-center" />
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button aria-label={t('flow.nodeColor')} className={iconBtn}>
                    <span
                      className={cn('size-3.5 rounded-full border', !fill && 'border-dashed border-muted-foreground/60')}
                      style={fill ? { background: fill.fill, borderColor: fill.stroke } : undefined}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent data-node-editor side="bottom" align="start" className="flex w-auto gap-1 p-1.5">
                  <button
                    aria-label={t('flow.noColor')}
                    onClick={() => apply(setNodeColor(chart, n.id, null))}
                    className={cn('size-5 rounded-full border border-dashed border-muted-foreground/60', !color && 'ring-2 ring-foreground/40')}
                  />
                  {FLOW_COLORS.map((c) => (
                    <button
                      key={c.name}
                      aria-label={colorName(c.name)}
                      onClick={() => apply(setNodeColor(chart, n.id, c.name))}
                      className={cn('size-5 rounded-full border-2', color === c.name && 'ring-2 ring-foreground/40')}
                      style={{ background: c.fill, borderColor: c.stroke }}
                    />
                  ))}
                </PopoverContent>
              </Popover>
            )}
            <input
              data-node-label={n.id}
              value={n.label}
              readOnly={n.external}
              title={n.external ? t('flow.external') : undefined}
              onChange={(e) => apply(updateNode(chart, n.id, { label: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const added = addNode(chart, t('flow.newStep'))
                apply(addEdge(added.chart, n.id, added.id))
                focus(`[data-node-label="${added.id}"]`)
              }}
              className={cn(input, n.external && 'bg-transparent text-muted-foreground')}
            />
            <span className="w-10 shrink-0 truncate font-mono text-[10px] text-muted-foreground" title={t('flow.nodeId')}>
              {n.id}
            </span>
            <Select value={n.shape} disabled={n.external} onValueChange={(v) => apply(updateNode(chart, n.id, { shape: v as FlowShape }))}>
              <SelectTrigger size="sm" aria-label={t('flow.shape')} className="!h-7 w-[132px] shrink-0 gap-1 px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-node-editor>
                {shapeOptions(n.shape).map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    <ShapeIcon shape={s} />
                    {SHAPE_LABEL[s] ?? FLOW_SHAPES[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              aria-label={t('flow.deleteNode')}
              disabled={n.external}
              onClick={() => apply(removeNode(chart, n.id))}
              className={cn(iconBtn, 'invisible group-hover:visible', n.external && 'hidden')}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => {
          const added = addNode(chart, t('flow.newStep'))
          apply(added.chart)
          focus(`[data-node-label="${added.id}"]`)
        }}
        className="mt-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="size-3.5" /> {t('flow.addNode')}
      </button>
    </div>
  )
}

function ShapeIcon({ shape }: { shape: FlowShape }) {
  const Icon = FlowShapeIcons[shape]
  return Icon ? <Icon className="size-4 text-muted-foreground" /> : null
}

const SHAPE_LABEL = labelMap<FlowShape>({
  rect: 'shape.rectangle',
  round: 'flow.shape.round',
  stadium: 'flow.shape.stadium',
  circle: 'flow.shape.circle',
  diamond: 'flow.shape.decision',
  hexagon: 'flow.shape.hexagon',
  parallelogram: 'flow.shape.io',
  database: 'flow.shape.database',
  subroutine: 'flow.shape.subroutine',
  'parallelogram-alt': 'flow.shape.parallelogramAlt',
  trapezoid: 'flow.shape.trapezoid',
  'trapezoid-alt': 'flow.shape.trapezoidAlt',
  asymmetric: 'flow.shape.flag',
  'double-circle': 'flow.shape.doubleCircle'
})

const LINE_STYLES: { value: EdgeStyle; label: MessageKey; icon: AppIcon }[] = [
  { value: 'solid', label: 'flow.line.solid', icon: LineSolid },
  { value: 'dotted', label: 'flow.line.dotted', icon: LineDotted },
  { value: 'thick', label: 'flow.line.thick', icon: LineThick }
]
const ARROWS: { value: EdgeArrow; label: MessageKey; icon: AppIcon }[] = [
  { value: 'arrow', label: 'shape.arrow', icon: ArrowHeadEnd },
  { value: 'none', label: 'edge.noArrow', icon: ArrowHeadNone },
  { value: 'both', label: 'flow.bothEnds', icon: ArrowHeadBoth }
]

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: MessageKey; icon?: AppIcon }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-md bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          title={t(o.label)}
          aria-label={t(o.label)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition hover:text-foreground',
            o.value === value && 'bg-background text-foreground shadow-sm'
          )}
        >
          {o.icon ? <o.icon className="size-4" /> : t(o.label)}
        </button>
      ))}
    </div>
  )
}

function ConnectionsTab({ chart, apply, focus }: TabProps) {
  const nodeSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="!h-7 min-w-0 flex-1 px-2 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent data-node-editor>
        {chart.nodes.map((n) => (
          <SelectItem key={n.id} value={n.id} className="text-xs">
            <ShapeIcon shape={n.shape} />
            {n.label || n.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="space-y-1">
      {chart.edges.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t('flow.noConnections')}</p>}
      {chart.edges.map((e, i) => (
        <div key={e.id} className="group space-y-1 rounded-lg border border-transparent p-1.5 hover:border-border">
          <div className="flex items-center gap-1.5">
            {nodeSelect(e.from, (from) => apply(updateEdge(chart, e.id, { from })), t('flow.from'))}
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            {nodeSelect(e.to, (to) => apply(updateEdge(chart, e.id, { to })), t('flow.to'))}
            <button aria-label={t('edge.delete')} onClick={() => apply(removeEdge(chart, e.id))} className={cn(iconBtn, 'invisible group-hover:visible')}>
              <X className="size-3" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 pr-7.5">
            <input
              data-edge-label={i}
              value={e.label ?? ''}
              placeholder={t('edge.label')}
              onChange={(ev) => apply(updateEdge(chart, e.id, { label: ev.target.value || undefined }))}
              className={input}
            />
            <Segmented value={e.style} options={LINE_STYLES} onChange={(style) => apply(updateEdge(chart, e.id, { style }))} />
            <Segmented value={e.arrow} options={ARROWS} onChange={(arrow) => apply(updateEdge(chart, e.id, { arrow }))} />
          </div>
        </div>
      ))}
      <button
        disabled={chart.nodes.length < 1}
        onClick={() => {
          const last = chart.edges.at(-1)
          const from = last?.to ?? chart.nodes[0].id
          const to = chart.nodes.find((n) => n.id !== from && !chart.edges.some((x) => x.from === from && x.to === n.id))?.id ?? from
          apply(addEdge(chart, from, to))
          focus(`[data-edge-label="${chart.edges.length}"]`)
        }}
        className="mt-1 flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Plus className="size-3.5" /> {t('flow.addConnection')}
      </button>
    </div>
  )
}

const DIRECTIONS: { value: FlowDirection; label: MessageKey; icon: AppIcon }[] = [
  { value: 'TD', label: 'flow.dir.td', icon: ArrowDown },
  { value: 'LR', label: 'flow.dir.lr', icon: ArrowRight },
  { value: 'BT', label: 'flow.dir.bt', icon: ArrowUp },
  { value: 'RL', label: 'flow.dir.rl', icon: ArrowLeft }
]
const CURVES: { value: FlowCurve | 'default'; label: MessageKey }[] = [
  { value: 'default', label: 'appearance.default' },
  { value: 'basis', label: 'flow.curve.curved' },
  { value: 'linear', label: 'flow.curve.straight' },
  { value: 'step', label: 'flow.curve.stepped' }
]

function LayoutTab({ chart, apply }: Omit<TabProps, 'focus'>) {
  const direction = chart.direction === 'TB' ? 'TD' : chart.direction
  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-1.5">
        <div className="text-muted-foreground">{t('flow.direction')}</div>
        <div className="grid grid-cols-4 gap-1">
          {DIRECTIONS.map((d) => (
            <button
              key={d.value}
              aria-pressed={d.value === direction}
              onClick={() => apply({ ...chart, direction: d.value })}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-muted-foreground transition hover:text-foreground',
                d.value === direction && 'border-brand bg-brand/10 text-brand hover:text-brand'
              )}
            >
              <d.icon className="size-4" />
              <span className="text-[11px]">{t(d.label)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-muted-foreground">{t('flow.lines')}</div>
        <div className="flex gap-1">
          {CURVES.map((c) => {
            const active = (getCurve(chart) ?? 'default') === c.value
            return (
              <button
                key={c.value}
                onClick={() => apply(setCurve(chart, c.value === 'default' ? null : c.value))}
                className={cn('h-6 rounded-md px-2 transition', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              >
                {t(c.label)}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CodeTab({ source, onChange, autoFocus }: { source: string; onChange: (s: string) => void; autoFocus: boolean }) {
  return (
    <>
      <textarea
        autoFocus={autoFocus}
        value={source}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          e.preventDefault()
          const el = e.currentTarget
          const s = el.selectionStart
          onChange(source.slice(0, s) + '  ' + source.slice(el.selectionEnd))
          requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
        }}
        spellCheck={false}
        rows={Math.min(16, Math.max(6, source.split('\n').length + 1))}
        className="block w-full resize-none bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
      />
      <div className="flex justify-end border-t px-3 py-1 text-[10px]">
        <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
          {t('flow.syntax')}
        </a>
      </div>
    </>
  )
}
