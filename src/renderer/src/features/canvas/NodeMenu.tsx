import { ArrowDownToLine, ArrowUpToLine, BarChart, Expand, Frame, LayoutDashboard, SquarePlus, Type, Trash2, Unlink, X } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { TEXT_SIZE_PRESETS, type TextSizePreset } from './textSize'
import type { ObjectNode } from './types'
import { t } from '@/lib/i18n'

export type NodeMenuAction =
  | 'open'
  | 'front'
  | 'back'
  | 'remove'
  | 'delete-card'
  | 'convert-card'
  | 'style-plain'
  | 'style-framed'
  | 'chart-from-table'
  | 'unlink-chart'
  | 'frame'
  | `size-${Lowercase<TextSizePreset>}`

interface Props {
  menu: { node: ObjectNode; x: number; y: number } | null
  onClose: () => void
  onAction: (a: NodeMenuAction, node: ObjectNode) => void
}

/** Right-click menu for whiteboard objects, anchored at the cursor. */
export function NodeMenu({ menu, onClose, onAction }: Props) {
  const node = menu?.node
  const act = (a: NodeMenuAction) => () => node && onAction(a, node)
  const block = node?.type === 'card' && node.data.card?.kind === 'block'
  const framed = block && node.data.object.data.style === 'framed'
  const linkedChart = node?.type === 'chart' && !!(node.data.object.data.source as { tableId?: string } | undefined)?.tableId
  const isText = node?.type === 'card'
  return (
    <DropdownMenu open={!!menu} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DropdownMenuTrigger asChild>
        <span className="fixed size-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {node?.type === 'card' && (
          <DropdownMenuItem onClick={act('open')}>
            <Expand /> {block ? t('sel.openAsCard') : t('task.openCard')}
          </DropdownMenuItem>
        )}
        {block && (
          <>
            <DropdownMenuItem onClick={act('convert-card')}>
              <SquarePlus /> {t('undo.convertToCard')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={act(framed ? 'style-plain' : 'style-framed')}>
              <Frame /> {framed ? t('undo.removeFrame') : t('undo.addFrame')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {node?.type === 'table' && (
          <DropdownMenuItem onClick={act('chart-from-table')}>
            <BarChart /> {t('sel.chartFromTable')}
          </DropdownMenuItem>
        )}
        {linkedChart && (
          <DropdownMenuItem onClick={act('unlink-chart')}>
            <Unlink /> {t('sel.unlinkTable')}
          </DropdownMenuItem>
        )}
        {node?.type === 'whiteboard' && (
          <DropdownMenuItem onClick={act('open')}>
            <LayoutDashboard /> {t('sel.openBoard')}
          </DropdownMenuItem>
        )}
        {node?.type === 'sketch' && (
          <DropdownMenuItem onClick={act('frame')}>
            <Frame /> {node.data.object.data.frameless === true ? t('undo.addFrame') : t('undo.removeFrame')}
          </DropdownMenuItem>
        )}
        {isText && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Type /> {t('settings.appearance.textSize')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TEXT_SIZE_PRESETS.map((p) => (
                <DropdownMenuItem key={p} onClick={act(`size-${p.toLowerCase()}` as NodeMenuAction)}>
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onClick={act('front')}>
          <ArrowUpToLine /> {t('node.front')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={act('back')}>
          <ArrowDownToLine /> {t('node.back')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {block ? (
          <DropdownMenuItem variant="destructive" onClick={act('remove')}>
            <Trash2 /> {t('node.deleteTextBox')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={act('remove')}>
            <X /> {t('help.fixed.remove')}
          </DropdownMenuItem>
        )}
        {node?.type === 'card' && !block && (
          <DropdownMenuItem variant="destructive" onClick={act('delete-card')}>
            <Trash2 /> {t('node.deleteEverywhere')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
