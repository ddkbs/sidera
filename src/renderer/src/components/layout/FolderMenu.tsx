import { FolderPlus, LayoutDashboard, Pencil, Trash2 } from '@/components/icons'
import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppDispatch } from '@/store'
import { useCreateWhiteboardMutation, useDeleteFolderMutation } from '@/store/api'
import { navigate } from '@/store/ui'
import type { Folder } from '@shared/types'

/**
 * Right-click menu for a sidebar folder: new whiteboard/subfolder inside it, rename, delete.
 * `onStartRename` triggers the inline rename input owned by the parent list item.
 */
export function FolderMenu({
  folder,
  onStartRename,
  onNewSubfolder,
  children
}: {
  folder: Folder
  onStartRename: () => void
  onNewSubfolder: () => void
  children: ReactElement
}) {
  const dispatch = useAppDispatch()
  const [create] = useCreateWhiteboardMutation()
  const [remove] = useDeleteFolderMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const newWhiteboard = async () => {
    const res = await create({ name: 'Untitled whiteboard', folderId: folder.id })
    if ('data' in res && res.data) dispatch(navigate({ type: 'whiteboard', id: res.data.id }))
    else toast.error('Could not create whiteboard')
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => void newWhiteboard()}>
            <LayoutDashboard /> New whiteboard in folder
          </ContextMenuItem>
          <ContextMenuItem onSelect={onNewSubfolder}>
            <FolderPlus /> New subfolder
          </ContextMenuItem>
          <ContextMenuItem onSelect={onStartRename}>
            <Pencil /> Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete folder
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{folder.name}”?</DialogTitle>
            <DialogDescription>
              The folder is removed, but its whiteboards and subfolders are kept — they move up to the level above.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setConfirmDelete(false)
                await remove(folder.id)
                toast('Folder deleted')
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
