import { AskAI, BoxSelect, ChartsMenu, Copy, GitBranch, Maximize } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { CHART_GROUPS, INSERT_ITEMS, type CanvasAction } from './actions'

/**
 * Insert + board actions, shared by the toolbar overflow and the canvas right-click menu,
 * so both offer exactly the same set.
 */
export function CanvasMenuItems({ onAction }: { onAction: (a: CanvasAction) => void }) {
  const act = (a: CanvasAction) => () => onAction(a)
  return (
    <>
      <DropdownMenuLabel className="text-muted-foreground">Insert</DropdownMenuLabel>
      {INSERT_ITEMS.map((i) => (
        <DropdownMenuItem key={i.action} onClick={act(i.action)}>
          <i.icon /> {i.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ChartsMenu /> Chart
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {CHART_GROUPS.map((g, gi) => (
            <div key={g.title}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-muted-foreground">{g.title}</DropdownMenuLabel>
              {g.items.map((item) => (
                <DropdownMenuItem key={item.label} onClick={act(item.action)}>
                  <item.icon className={cn(item.iconClass)} /> {item.label}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={act('paste')}>
        <Copy /> Paste
      </DropdownMenuItem>
      <DropdownMenuItem onClick={act('select-all')}>
        <BoxSelect /> Select all
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={act('autolayout')}>
        <GitBranch /> Auto-layout connected
      </DropdownMenuItem>
      <DropdownMenuItem onClick={act('fit')}>
        <Maximize /> Fit to screen
      </DropdownMenuItem>
      <DropdownMenuItem onClick={act('organize')}>
        <AskAI /> Organize with AI
      </DropdownMenuItem>
    </>
  )
}

interface Props {
  /** Screen position of the right-click, or null when closed. */
  at: { x: number; y: number } | null
  onClose: () => void
  onAction: (a: CanvasAction) => void
}

/** Right-click menu for empty canvas — inserts land at the cursor. */
export function CanvasContextMenu({ at, onClose, onAction }: Props) {
  return (
    <DropdownMenu open={!!at} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <span className="fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <CanvasMenuItems onAction={onAction} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
