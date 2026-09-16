import { useState } from 'react'
import {
  AreaChart,
  BarChart,
  BubbleChart,
  ChartsMenu,
  ComboChart,
  DonutChart,
  Heatmap,
  LineChart,
  MatrixChart,
  Network,
  PenTool,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TimelineChart,
  VennChart,
  Workflow,
  type AppIcon
} from '@/components/icons'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ChartType } from '@/features/charts/model'
import type { OverflowAction } from './CanvasToolbar'

interface Item {
  label: string
  hint: string
  icon: AppIcon
  action: OverflowAction
  iconClass?: string
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Compare',
    items: [
      { label: 'Column', hint: 'Compare values across categories', icon: BarChart, action: chart('column') },
      { label: 'Bar', hint: 'Horizontal bars for long labels', icon: BarChart, action: chart('bar'), iconClass: 'rotate-90 -scale-x-100' },
      { label: 'Radar', hint: 'Profiles across several dimensions', icon: RadarChart, action: chart('radar') }
    ]
  },
  {
    title: 'Trends',
    items: [
      { label: 'Line', hint: 'Change over time', icon: LineChart, action: chart('line') },
      { label: 'Area', hint: 'Volume over time', icon: AreaChart, action: chart('area') },
      { label: 'Column + line', hint: 'Two measures, two axes', icon: ComboChart, action: chart('combo') }
    ]
  },
  {
    title: 'Parts of a whole',
    items: [
      { label: 'Pie', hint: 'Share of a total', icon: PieChart, action: chart('pie') },
      { label: 'Donut', hint: 'Share of a total, lighter', icon: DonutChart, action: chart('donut') },
      { label: 'Venn', hint: 'Overlaps between 2–3 sets', icon: VennChart, action: chart('venn') }
    ]
  },
  {
    title: 'Relationships & flows',
    items: [
      { label: 'Scatter', hint: 'Correlation of two values', icon: ScatterChart, action: chart('scatter') },
      { label: 'Bubble', hint: 'Scatter with a size dimension', icon: BubbleChart, action: chart('bubble') },
      { label: 'Sankey', hint: 'How quantities flow', icon: SankeyChart, action: chart('sankey') }
    ]
  },
  {
    title: 'Plan & prioritize',
    items: [
      { label: 'Timeline', hint: 'Milestones in order', icon: TimelineChart, action: chart('timeline') },
      { label: '2×2 matrix', hint: 'Drag items into quadrants', icon: MatrixChart, action: chart('matrix') },
      { label: 'Heatmap', hint: 'Intensity across a grid', icon: Heatmap, action: chart('heatmap') }
    ]
  },
  {
    title: 'Diagrams',
    items: [
      { label: 'Mindmap', hint: 'Branching ideas', icon: Network, action: 'mindmap' },
      { label: 'Flowchart', hint: 'Mermaid flow diagram', icon: Workflow, action: 'mermaid' },
      { label: 'Sketch', hint: 'Freehand drawing', icon: PenTool, action: 'sketch' }
    ]
  }
]

function chart(type: ChartType): OverflowAction {
  return `chart:${type}`
}

/** Toolbar popover listing every chart and diagram, grouped by what you want to show. */
export function InsertMenu({ onAction }: { onAction: (a: OverflowAction) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            className={cn('grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground', open && 'bg-accent text-foreground')}
            aria-label="Charts & diagrams"
          >
            <ChartsMenu className="size-[18px]" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Charts & diagrams</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="center" sideOffset={12} className="w-[380px] p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h4 className="px-1.5 pt-1 pb-1 text-xs font-medium text-muted-foreground">{g.title}</h4>
              <div className="grid grid-cols-3 gap-1">
                {g.items.map((item) => (
                  <button
                    key={item.label}
                    title={item.hint}
                    onClick={() => {
                      setOpen(false)
                      onAction(item.action)
                    }}
                    className="group flex flex-col items-center gap-1.5 rounded-lg px-1 py-2.5 text-xs transition hover:bg-accent"
                  >
                    <span className="grid size-9 place-items-center rounded-lg border bg-background text-muted-foreground transition group-hover:text-foreground">
                      <item.icon className={cn('size-[18px]', item.iconClass)} />
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
