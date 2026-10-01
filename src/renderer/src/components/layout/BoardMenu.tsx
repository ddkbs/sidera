import { record } from '@/lib/undo'
import { recordDelete } from '@/lib/undo-actions'
import { Copy, Folder as FolderIcon, LayoutDashboard, Pencil, Plus, Sparkles, Table2, Trash2 } from '@/components/icons'
import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  useCreateWhiteboardMutation,
  useDeleteWhiteboardMutation,
  useDuplicateWhiteboardMutation,
  useListFoldersQuery,
  useMoveWhiteboardToFolderMutation,
  useUpdateWhiteboardMutation
} from '@/store/api'
import { navigate, openTab, queueChatMessage } from '@/store/ui'
import type { Whiteboard } from '@shared/types'
import { WhiteboardPropertiesDialog } from '@/features/canvas/WhiteboardPropertiesDialog'

async function organizeWithAi(dispatch: ReturnType<typeof useAppDispatch>, board: Whiteboard): Promise<void> {
  const hasKey = await window.chat.hasKey()
  if (!hasKey) {
    toast(t('board.organizeNoKey'), { description: t('board.organizeNoKeyHint') })
    return
  }
  dispatch(queueChatMessage(t('board.organizePrompt', { name: board.name, id: board.id })))
}

export function BoardMenu({ board, children }: { board: Whiteboard; children: ReactElement }) {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const [update] = useUpdateWhiteboardMutation()
  const [remove] = useDeleteWhiteboardMutation()
  const [create] = useCreateWhiteboardMutation()
  const [duplicate] = useDuplicateWhiteboardMutation()
  const [moveToFolder] = useMoveWhiteboardToFolderMutation()
  const moveBoard = async (folderId: string | null) => {
    const prev = board.folderId ?? null
    await moveToFolder({ whiteboardId: board.id, folderId })
    record({ label: t('undo.moveBoard'), undo: () => window.api.moveWhiteboardToFolder(board.id, prev), redo: () => window.api.moveWhiteboardToFolder(board.id, folderId) })
  }
  const { data: folders = [] } = useListFoldersQuery()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [name, setName] = useState(board.name)
  const [propertiesFor, setPropertiesFor] = useState<string | null>(null)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => dispatch(openTab({ type: 'whiteboard', id: board.id }))}>
            <Plus /> {t('help.fixed.cmdClick')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => (setName(board.name), setDialog('rename'))}>
            <Pencil /> {t('common.rename')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setPropertiesFor(board.id)}>
            <Table2 /> {t('board.properties')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void organizeWithAi(dispatch, board)}>
            <Sparkles /> {t('board.organize')}
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={async () => {
              const r = await create({ name: t('board.untitled'), parentId: board.id })
              if ('data' in r && r.data) {
                await window.api.addObject({ whiteboardId: board.id, kind: 'whiteboard', refId: r.data.id, x: 0, y: -240 })
                dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
              }
            }}
          >
            <LayoutDashboard /> {t('board.newSub')}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderIcon /> {t('folder.moveTo')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuItem disabled={!board.folderId} onSelect={() => moveBoard(null)}>
                {t('folder.none')}
              </ContextMenuItem>
              {folders.length > 0 && <ContextMenuSeparator />}
              {folders.map((f) => (
                <ContextMenuItem
                  key={f.id}
                  disabled={board.folderId === f.id}
                  onSelect={() => moveBoard(f.id)}
                >
                  <FolderIcon /> {f.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            onSelect={async () => {
              const r = await duplicate(board.id)
              if ('data' in r && r.data) {
                dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
                toast.success(t('board.duplicated', { name: board.name }))
              } else toast.error(t('board.duplicateFailed'))
            }}
          >
            <Copy /> {t('common.duplicate')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 /> {t('common.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          {dialog === 'rename' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (name.trim()) void update({ id: board.id, name: name.trim() })
                setDialog(null)
              }}
            >
              <DialogHeader>
                <DialogTitle>{t('board.renameTitle')}</DialogTitle>
              </DialogHeader>
              <Input className="mt-4" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <DialogFooter className="mt-4">
                <Button type="submit">{t('common.save')}</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t('common.deleteNamed', { name: board.name })}</DialogTitle>
                <DialogDescription>{t('board.deleteBody')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    setDialog(null)
                    if (view.type === 'whiteboard' && view.id === board.id) dispatch(navigate({ type: 'home' }))
                    await remove(board.id)
                    recordDelete('whiteboard', board.id)
                  }}
                >
                  {t('common.delete')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <WhiteboardPropertiesDialog whiteboardId={propertiesFor} onClose={() => setPropertiesFor(null)} />
    </>
  )
}
