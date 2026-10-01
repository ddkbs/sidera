import {
  AreaChart,
  ArrowUpRight,
  BarChart,
  BubbleChart,
  ComboChart,
  DonutChart,
  Heatmap,
  LineChart,
  MatrixChart,
  PieChart,
  RadarChart,
  SankeyChart,
  ScatterChart,
  TimelineChart,
  VennChart,
  BoxSelect,
  Globe,
  LayoutDashboard,
  Network,
  PenTool,
  Search,
  ShapeArrow,
  ShapeCheck,
  ShapeCross,
  ShapeCurvedArrow,
  ShapeCurve,
  ShapeSemicircle,
  ShapeDiamond,
  ShapeEllipse,
  ShapeLine,
  ShapeRectangle,
  ShapeStar,
  SquarePlus,
  Table2,
  Type,
  Upload,
  Workflow,
  type AppIcon
} from '@/components/icons'
import type { ChartType } from '@shared/charts'
import type { MessageKey } from '@/lib/i18n'
import type { ShapeKind } from '@/features/ink/shapes'
import { IS_IPAD } from '@/lib/platform'

/** Everything the toolbar overflow and the canvas context menu can trigger. */
export type CanvasAction =
  | 'text'
  | 'table'
  | 'card'
  | 'existing-card'
  | 'section'
  | 'connector'
  | 'sketch'
  | 'link'
  | 'mindmap'
  | 'mermaid'
  | 'whiteboard'
  | 'import'
  | 'paste'
  | 'select-all'
  | 'autolayout'
  | 'fit'
  | 'organize'
  | 'properties'
  | `chart:${ChartType}`
  | `shape:${ShapeKind}`

/** Not offered on Sidera for iPad: they reach outside the shared board (card library, nested boards). */
const NOT_ON_IPAD = new Set<CanvasAction>(['existing-card', 'whiteboard'])

/** Insert entries shared by the toolbar overflow and the right-click menu, in menu order (labels are dictionary keys). */
export const INSERT_ITEMS: { action: CanvasAction; label: MessageKey; icon: AppIcon }[] = (
  [
  { action: 'text', label: 'insert.text', icon: Type },
  { action: 'card', label: 'task.card', icon: SquarePlus },
  { action: 'existing-card', label: 'insert.existingCard', icon: Search },
  { action: 'section', label: 'canvas.section', icon: BoxSelect },
  { action: 'connector', label: 'insert.connector', icon: ArrowUpRight },
  { action: 'sketch', label: 'ink.sketch', icon: PenTool },
  { action: 'mindmap', label: 'insert.mindmap', icon: Network },
  { action: 'mermaid', label: 'insert.flowchart', icon: Workflow },
  { action: 'whiteboard', label: 'insert.nestedBoard', icon: LayoutDashboard },
  { action: 'link', label: 'insert.link', icon: Globe },
  { action: 'import', label: 'insert.import', icon: Upload },
  { action: 'table', label: 'library.table', icon: Table2 }
  ] as { action: CanvasAction; label: MessageKey; icon: AppIcon }[]
).filter((i) => !IS_IPAD || !NOT_ON_IPAD.has(i.action))

/** Window event to trigger a canvas action from outside the board (command palette); detail = CanvasAction. */
export const CANVAS_ACTION_EVENT = 'sidera:canvas-action'

export interface ChartItem {
  label: MessageKey
  hint: MessageKey
  icon: AppIcon
  action: CanvasAction
  iconClass?: string
}

const chart = (type: ChartType): CanvasAction => `chart:${type}`
const shape = (kind: ShapeKind): CanvasAction => `shape:${kind}`

export interface ShapeItem {
  label: MessageKey
  icon: AppIcon
  action: CanvasAction
}

/** Shape entries for the insert menus' "Shapes" group — frameless sketches built from native Excalidraw elements. */
export const SHAPE_ITEMS: ShapeItem[] = [
  { label: 'shape.rectangle', icon: ShapeRectangle, action: shape('rectangle') },
  { label: 'shape.ellipse', icon: ShapeEllipse, action: shape('ellipse') },
  { label: 'shape.diamond', icon: ShapeDiamond, action: shape('diamond') },
  { label: 'shape.line', icon: ShapeLine, action: shape('line') },
  { label: 'shape.arrow', icon: ShapeArrow, action: shape('arrow') },
  { label: 'shape.curvedArrow', icon: ShapeCurvedArrow, action: shape('curved-arrow') },
  { label: 'shape.curve', icon: ShapeCurve, action: shape('curve') },
  { label: 'shape.semicircle', icon: ShapeSemicircle, action: shape('semicircle') },
  { label: 'shape.cross', icon: ShapeCross, action: shape('cross') },
  { label: 'shape.check', icon: ShapeCheck, action: shape('check') },
  { label: 'shape.star', icon: ShapeStar, action: shape('star') }
]

/** Chart entries for the insert menus, grouped by what you want to show. */
export const CHART_GROUPS: { title: MessageKey; items: ChartItem[] }[] = [
  {
    title: 'chartGroup.compare',
    items: [
      { label: 'chart.type.column', hint: 'chartHint.column', icon: BarChart, action: chart('column') },
      { label: 'chart.type.bar', hint: 'chartHint.bar', icon: BarChart, action: chart('bar'), iconClass: 'rotate-90 -scale-x-100' },
      { label: 'chart.type.radar', hint: 'chartHint.radar', icon: RadarChart, action: chart('radar') }
    ]
  },
  {
    title: 'chartGroup.trends',
    items: [
      { label: 'chart.type.line', hint: 'chartHint.line', icon: LineChart, action: chart('line') },
      { label: 'chart.type.area', hint: 'chartHint.area', icon: AreaChart, action: chart('area') },
      { label: 'chart.type.combo', hint: 'chartHint.combo', icon: ComboChart, action: chart('combo') }
    ]
  },
  {
    title: 'chartGroup.parts',
    items: [
      { label: 'chart.type.pie', hint: 'chartHint.pie', icon: PieChart, action: chart('pie') },
      { label: 'chart.type.donut', hint: 'chartHint.donut', icon: DonutChart, action: chart('donut') },
      { label: 'chart.type.venn', hint: 'chartHint.venn', icon: VennChart, action: chart('venn') }
    ]
  },
  {
    title: 'chartGroup.relations',
    items: [
      { label: 'chart.type.scatter', hint: 'chartHint.scatter', icon: ScatterChart, action: chart('scatter') },
      { label: 'chart.type.bubble', hint: 'chartHint.bubble', icon: BubbleChart, action: chart('bubble') },
      { label: 'chart.type.sankey', hint: 'chartHint.sankey', icon: SankeyChart, action: chart('sankey') }
    ]
  },
  {
    title: 'chartGroup.plan',
    items: [
      { label: 'chart.type.timeline', hint: 'chartHint.timeline', icon: TimelineChart, action: chart('timeline') },
      { label: 'chart.type.matrix', hint: 'chartHint.matrix', icon: MatrixChart, action: chart('matrix') },
      { label: 'chart.type.heatmap', hint: 'chartHint.heatmap', icon: Heatmap, action: chart('heatmap') }
    ]
  }
]

