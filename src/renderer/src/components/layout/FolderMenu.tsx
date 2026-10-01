import { Folder as FolderIcon, FolderPlus, LayoutDashboard, Pencil, Trash2 } from '@/components/icons'
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
import { t } from '@/lib/i18n'
import { useAppDispatch } from '@/store'
import { useCreateWhiteboardMutation, useDeleteFolderMutation } from '@/store/api'
import { navigate } from '@/store/ui'
import type { Folder } from '@shared/types'

/** All ids that are `folder` or a descendant of it — can't be a valid move target. */
function descendantsOf(folder: Folder, all: Folder[]): Set<string> {
  const out = new Set<string>([folder.id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of all) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id)
        grew = true
      }
    }
  }
  return out
}

/**
 * Right-click menu for a sidebar folder: new whiteboard/subfolder inside it, rename, move, delete.
 * `onStartRename` triggers the inline rename input owned by the parent list item.
 */
export function FolderMenu({
  folder,
  allFolders,
  onStartRename,
  onNewSubfolder,
  onMove,
  children
}: {
  folder: Folder
  allFolders: Folder[]
  onStartRename: () => void
  onNewSubfolder: () => void
  onMove: (parentId: string | null) => void
  children: ReactElement
}) {
  const dispatch = useAppDispatch()
  const [create] = useCreateWhiteboardMutation()
  const [remove] = useDeleteFolderMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const blocked = descendantsOf(folder, allFolders)
  const moveTargets = allFolders.filter((f) => !blocked.has(f.id))

  const newWhiteboard = async () => {
    const res = await create({ name: t('board.untitled'), folderId: folder.id })
    if ('data' in res && res.data) dispatch(navigate({ type: 'whiteboard', id: res.data.id }))
    else toast.error(t('board.createFailed'))
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => void newWhiteboard()}>
            <LayoutDashboard /> {t('folder.newBoardIn')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onNewSubfolder}>
            <FolderPlus /> {t('folder.newSub')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onStartRename}>
            <Pencil /> {t('common.rename')}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderIcon /> {t('folder.moveTo')}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuItem disabled={folder.parentId === null} onSelect={() => onMove(null)}>
                {t('folder.topLevel')}
              </ContextMenuItem>
              {moveTargets.length > 0 && <ContextMenuSeparator />}
              {moveTargets.map((f) => (
                <ContextMenuItem key={f.id} disabled={folder.parentId === f.id} onSelect={() => onMove(f.id)}>
                  <FolderIcon /> {f.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> {t('folder.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('common.deleteNamed', { name: folder.name })}</DialogTitle>
            <DialogDescription>{t('folder.deleteBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmDelete(false)
                await remove(folder.id)
                toast(t('folder.deleted'))
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
