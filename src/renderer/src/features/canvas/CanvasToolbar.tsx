import { ArrowUpRight, BoxSelect, Ellipsis, MousePointer2, PenTool, Search, SquarePlus, Type, Upload } from '@/components/icons'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'
import { t, type MessageKey } from '@/lib/i18n'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import type { CanvasTool } from '@/store/ui'
import type { CanvasAction } from './actions'
import { CanvasMenuItems } from './CanvasContextMenu'
import { IS_IPAD } from '@/lib/platform'
import { cn } from '@/lib/utils'

/** Every tool that has a keyboard shortcut; `primary` ones get a button on the toolbar. */
export const TOOLS: { id: CanvasTool; label: MessageKey; icon: ReactNode; primary?: boolean }[] = [
  { id: 'select', label: 'tool.select', icon: <MousePointer2 />, primary: true },
  { id: 'pen', label: 'ink.pen', icon: <PenTool />, primary: true },
  { id: 'text', label: 'insert.text', icon: <Type />, primary: true },
  { id: 'card', label: 'task.card', icon: <SquarePlus />, primary: true },
  { id: 'connector', label: 'insert.connector', icon: <ArrowUpRight />, primary: true },
  { id: 'section', label: 'canvas.section', icon: <BoxSelect />, primary: true },
  { id: 'import', label: 'cmd.tool.import', icon: <Upload /> },
  { id: 'search', label: 'cmd.tool.search', icon: <Search /> }
]

interface Props {
  tool: CanvasTool
  onTool: (t: CanvasTool) => void
  onAction: (a: CanvasAction) => void
}

/**
 * Floating vertical toolbar — only the most-used tools; everything else lives in the
 * overflow menu, which shows exactly what the canvas right-click menu offers.
 */
export function CanvasToolbar({ tool, onTool, onAction }: Props) {
  const current = tool
  return (
    <motion.div
      data-tour="canvas-toolbar"
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'absolute top-1/2 left-3 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border bg-popover/95 p-1 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.18)] backdrop-blur',
        IS_IPAD && 'rounded-[18px] border-foreground/10 bg-popover/90 p-1.5 shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_18px_40px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl'
      )}
    >
      <ToggleGroup
        type="single"
        orientation="vertical"
        value={tool}
        onValueChange={(v) => v && onTool(v as CanvasTool)}
        className="flex flex-col gap-0.5 shadow-none"
      >
        {TOOLS.filter((tool) => tool.primary).map((tool) => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={tool.id}
                aria-label={t(tool.label)}
                data-tour={`tool-${tool.id}`}
                className={cn(
                  'relative rounded-xl! border-0 text-muted-foreground',
                  IS_IPAD
                    ? 'size-11 [&_svg]:size-5 aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-[0_1px_3px_rgba(0,0,0,0.12)] aria-checked:ring-1 aria-checked:ring-foreground/10'
                    : 'size-9 aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:hover:bg-primary aria-checked:hover:text-primary-foreground [&_svg]:size-[18px]'
                )}
              >
                {tool.icon}
                {IS_IPAD && tool.id === current && <span className="absolute right-[5px] size-1 rounded-full bg-brand shadow-[0_0_6px_var(--brand)]" />}
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              {t(tool.label)} <ToolKey id={tool.id} />
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <div className="my-0.5 h-px w-6 bg-border" />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              data-tour="canvas-insert"
              aria-label={t('insert.more')}
              className={cn(IS_IPAD ? 'size-11' : 'size-9', 'grid place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground')}
            >
              <Ellipsis className="size-[18px]" />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t('insert.more')}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="center" sideOffset={10} className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          <CanvasMenuItems onAction={onAction} />
        </DropdownMenuContent>
      </DropdownMenu>
    </motion.div>
  )
}

function ToolKey({ id }: { id: CanvasTool }) {
  const binding = useBinding(`tool.${id}`)
  return binding ? <Kbd>{formatBinding(binding)}</Kbd> : null
}
