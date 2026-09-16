import {
  ArrowUpRight,
  BoxSelect,
  Ellipsis,
  GitBranch,
  LayoutDashboard,
  Maximize,
  MousePointer2,
  Network,
  PenTool,
  Search,
  SquarePlus,
  Type,
  Upload,
  Workflow
} from '@/components/icons'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import type { CanvasTool } from '@/store/ui'

export const TOOLS: { id: CanvasTool; label: string; icon: ReactNode; key: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 />, key: 'V' },
  { id: 'card', label: 'Card', icon: <SquarePlus />, key: 'C' },
  { id: 'import', label: 'Import file', icon: <Upload />, key: 'U' },
  { id: 'connector', label: 'Connector', icon: <ArrowUpRight />, key: 'A' },
  { id: 'text', label: 'Text', icon: <Type />, key: 'T' },
  { id: 'section', label: 'Section', icon: <BoxSelect />, key: 'S' },
  { id: 'search', label: 'Add existing card', icon: <Search />, key: 'F' }
]

export type OverflowAction = 'whiteboard' | 'mindmap' | 'mermaid' | 'sketch' | 'autolayout' | 'fit'

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
              {t.label} <Kbd>{t.key}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <div className="my-0.5 h-px w-6 bg-border" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger className="grid size-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <Ellipsis className="size-[18px]" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">More</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="end" sideOffset={10} className="w-56">
          <DropdownMenuItem onClick={() => onAction('whiteboard')}>
            <LayoutDashboard /> Nested whiteboard
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction('mindmap')}>
            <Network /> Mindmap
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction('sketch')}>
            <PenTool /> Freehand sketch
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction('mermaid')}>
            <Workflow /> Mermaid diagram
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction('autolayout')}>
            <GitBranch /> Auto-layout connected
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAction('fit')}>
            <Maximize /> Fit to screen <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  )
}
