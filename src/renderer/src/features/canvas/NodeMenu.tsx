import { ArrowDownToLine, ArrowUpToLine, Expand, LayoutDashboard, Trash2, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { ObjectNode } from './types'

export type NodeMenuAction = 'open' | 'front' | 'back' | 'remove' | 'delete-card'

interface Props {
  menu: { node: ObjectNode; x: number; y: number } | null
  onClose: () => void
  onAction: (a: NodeMenuAction, node: ObjectNode) => void
}

/** Right-click menu for whiteboard objects, anchored at the cursor. */
export function NodeMenu({ menu, onClose, onAction }: Props) {
  const node = menu?.node
  const act = (a: NodeMenuAction) => () => node && onAction(a, node)
  return (
    <DropdownMenu open={!!menu} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <span className="fixed size-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {node?.type === 'card' && (
          <DropdownMenuItem onClick={act('open')}>
            <Expand /> Open card
          </DropdownMenuItem>
        )}
        {node?.type === 'whiteboard' && (
          <DropdownMenuItem onClick={act('open')}>
            <LayoutDashboard /> Open whiteboard
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={act('front')}>
          <ArrowUpToLine /> Bring to front
        </DropdownMenuItem>
        <DropdownMenuItem onClick={act('back')}>
          <ArrowDownToLine /> Send to back
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={act('remove')}>
          <X /> Remove from whiteboard
        </DropdownMenuItem>
        {node?.type === 'card' && (
          <DropdownMenuItem variant="destructive" onClick={act('delete-card')}>
            <Trash2 /> Delete card everywhere
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
