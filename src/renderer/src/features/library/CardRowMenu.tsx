import { recordDelete } from '@/lib/undo-actions'
import { Expand, Trash2 } from '@/components/icons'
import type { ReactNode } from 'react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { t } from '@/lib/i18n'
import { useAppDispatch } from '@/store'
import { useDeleteCardMutation } from '@/store/api'
import { openCard } from '@/store/ui'

export function CardRowMenu({ cardId, children }: { cardId: string; children: ReactNode }) {
  const dispatch = useAppDispatch()
  const [remove] = useDeleteCardMutation()
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
          <div className="h-full">{children}</div>
        </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => dispatch(openCard(cardId))}>
          <Expand /> {t('common.open')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={async () => {
            await remove(cardId)
            recordDelete('card', cardId)
          }}
        >
          <Trash2 /> {t('undo.deleteCard')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
