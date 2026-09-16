import {
  ArrowUpRight,
  BoxSelect,
  Ellipsis,
  GitBranch,
  LayoutDashboard,
  Maximize,
  MousePointer2,
  Search,
  SquarePlus,
  Type,
  Upload
} from '@/components/icons'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import type { CanvasTool } from '@/store/ui'
import type { ChartType } from '@/features/charts/model'
import { InsertMenu } from './InsertMenu'

export const TOOLS: { id: CanvasTool; label: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 /> },
  { id: 'card', label: 'Card', icon: <SquarePlus /> },
  { id: 'import', label: 'Import file', icon: <Upload /> },
  { id: 'connector', label: 'Connector', icon: <ArrowUpRight /> },
  { id: 'text', label: 'Text', icon: <Type /> },
  { id: 'section', label: 'Section', icon: <BoxSelect /> },
  { id: 'search', label: 'Add existing card', icon: <Search /> }
]

export type OverflowAction = 'whiteboard' | 'mindmap' | 'mermaid' | 'sketch' | 'autolayout' | 'fit' | `chart:${ChartType}`

interface Props {
  tool: CanvasTool
  onTool: (t: CanvasTool) => void
  onAction: (a: OverflowAction) => void
}

/** Floating vertical toolbar — compact, rounded, shadowed; a single-select ToggleGroup with tooltips. */
export function CanvasToolbar({ tool, onTool, onAction }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="absolute top-1/2 left-3 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border bg-popover/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.18)] backdrop-blur"
    >
      <ToggleGroup
        type="single"
        orientation="vertical"
        value={tool}
        onValueChange={(v) => v && onTool(v as CanvasTool)}
        className="flex flex-col gap-0.5 shadow-none"
      >
        {TOOLS.map((t) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={t.id}
                aria-label={t.label}
                className="size-9 rounded-xl! border-0 text-muted-foreground aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:hover:bg-primary aria-checked:hover:text-primary-foreground [&_svg]:size-[18px]"
              >
                {t.icon}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {t.label} <ToolKey id={t.id} />
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <div className="my-0.5 h-px w-6 bg-border" />
      <InsertMenu onAction={onAction} />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger className="grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <Ellipsis className="size-[18px]" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">More</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuItem onClick={() => onAction('whiteboard')}>
            <LayoutDashboard /> Nested whiteboard
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction('autolayout')}>
            <GitBranch /> Auto-layout connected
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction('fit')}>
            <Maximize /> Fit to screen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  )
}

function ToolKey({ id }: { id: CanvasTool }) {
  const binding = useBinding(`tool.${id}`)
  return binding ? <Kbd>{formatBinding(binding)}</Kbd> : null
}
