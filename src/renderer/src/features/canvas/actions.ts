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
  Tablet,
  TextBlock,
  Type,
  Upload,
  Workflow,
  type AppIcon
} from '@/components/icons'
import type { ChartType } from '@shared/charts'
import type { ShapeKind } from '@/features/ink/shapes'

/** Everything the toolbar overflow and the canvas context menu can trigger. */
export type CanvasAction =
  | 'text-block'
  | 'table'
  | 'card'
  | 'existing-card'
  | 'text'
  | 'section'
  | 'connector'
  | 'sketch'
  | 'draw-ipad'
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

/** Insert entries shared by the toolbar overflow and the right-click menu, in menu order. */
export const INSERT_ITEMS: { action: CanvasAction; label: string; icon: AppIcon }[] = [
  { action: 'text-block', label: 'Text block', icon: TextBlock },
  { action: 'card', label: 'Card', icon: SquarePlus },
  { action: 'existing-card', label: 'Existing card…', icon: Search },
  { action: 'text', label: 'Heading', icon: Type },
  { action: 'section', label: 'Section', icon: BoxSelect },
  { action: 'connector', label: 'Connector', icon: ArrowUpRight },
  { action: 'sketch', label: 'Sketch', icon: PenTool },
  { action: 'draw-ipad', label: 'Draw on iPad…', icon: Tablet },
  { action: 'mindmap', label: 'Mindmap', icon: Network },
  { action: 'mermaid', label: 'Flowchart', icon: Workflow },
  { action: 'whiteboard', label: 'Nested whiteboard', icon: LayoutDashboard },
  { action: 'link', label: 'Link preview…', icon: Globe },
  { action: 'import', label: 'Import file…', icon: Upload },
  { action: 'table', label: 'Table', icon: Table2 }
]

/** Window event to trigger a canvas action from outside the board (command palette); detail = CanvasAction. */
export const CANVAS_ACTION_EVENT = 'sidera:canvas-action'

export interface ChartItem {
  label: string
  hint: string
  icon: AppIcon
  action: CanvasAction
  iconClass?: string
}

const chart = (type: ChartType): CanvasAction => `chart:${type}`
const shape = (kind: ShapeKind): CanvasAction => `shape:${kind}`

export interface ShapeItem {
  label: string
  icon: AppIcon
  action: CanvasAction
}

/** Shape entries for the insert menus' "Shapes" group — frameless sketches built from native Excalidraw elements. */
export const SHAPE_ITEMS: ShapeItem[] = [
  { label: 'Rectangle', icon: ShapeRectangle, action: shape('rectangle') },
  { label: 'Ellipse', icon: ShapeEllipse, action: shape('ellipse') },
  { label: 'Diamond', icon: ShapeDiamond, action: shape('diamond') },
  { label: 'Line', icon: ShapeLine, action: shape('line') },
  { label: 'Arrow', icon: ShapeArrow, action: shape('arrow') },
  { label: 'Curved arrow', icon: ShapeCurvedArrow, action: shape('curved-arrow') },
  { label: 'Curve', icon: ShapeCurve, action: shape('curve') },
  { label: 'Semicircle', icon: ShapeSemicircle, action: shape('semicircle') },
  { label: 'Cross', icon: ShapeCross, action: shape('cross') },
  { label: 'Checkmark', icon: ShapeCheck, action: shape('check') },
  { label: 'Star', icon: ShapeStar, action: shape('star') }
]

/** Chart entries for the insert menus, grouped by what you want to show. */
export const CHART_GROUPS: { title: string; items: ChartItem[] }[] = [
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
  }
]

