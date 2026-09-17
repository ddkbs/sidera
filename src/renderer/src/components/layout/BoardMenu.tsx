import { recordDelete } from '@/lib/undo-actions'
import { Folder as FolderIcon, LayoutDashboard, Pencil, Plus, Sparkles, Trash2 } from '@/components/icons'
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
import { useAppDispatch, useAppSelector } from '@/store'
import {
  useCreateWhiteboardMutation,
  useDeleteWhiteboardMutation,
  useListFoldersQuery,
  useMoveWhiteboardToFolderMutation,
  useUpdateWhiteboardMutation
} from '@/store/api'
import { navigate, openTab, queueChatMessage } from '@/store/ui'
import type { Whiteboard } from '@shared/types'

async function organizeWithAi(dispatch: ReturnType<typeof useAppDispatch>, board: Whiteboard): Promise<void> {
  const hasKey = await window.chat.hasKey()
  if (!hasKey) {
    toast('Add an Anthropic API key to organize with the built-in assistant', {
      description: 'Or ask Claude Desktop/Code to do it via the "organize-board" MCP prompt.'
    })
    return
  }
  dispatch(queueChatMessage(`Organize the whiteboard "${board.name}" (id ${board.id}) into meaningful sections.`))
}

export function BoardMenu({ board, children }: { board: Whiteboard; children: ReactElement }) {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const [update] = useUpdateWhiteboardMutation()
  const [remove] = useDeleteWhiteboardMutation()
  const [create] = useCreateWhiteboardMutation()
  const [moveToFolder] = useMoveWhiteboardToFolderMutation()
  const { data: folders = [] } = useListFoldersQuery()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [name, setName] = useState(board.name)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => dispatch(openTab({ type: 'whiteboard', id: board.id }))}>
            <Plus /> Open in new tab
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => (setName(board.name), setDialog('rename'))}>
            <Pencil /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void organizeWithAi(dispatch, board)}>
            <Sparkles /> Organize with AI
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={async () => {
              const r = await create({ name: 'Untitled whiteboard', parentId: board.id })
              if ('data' in r && r.data) {
                await window.api.addObject({ whiteboardId: board.id, kind: 'whiteboard', refId: r.data.id, x: 0, y: -240 })
                dispatch(navigate({ type: 'whiteboard', id: r.data.id }))
              }
            }}
          >
            <LayoutDashboard /> New sub-whiteboard
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderIcon /> Move to folder
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuItem disabled={!board.folderId} onSelect={() => void moveToFolder({ whiteboardId: board.id, folderId: null })}>
                No folder
              </ContextMenuItem>
              {folders.length > 0 && <ContextMenuSeparator />}
              {folders.map((f) => (
                <ContextMenuItem
                  key={f.id}
                  disabled={board.folderId === f.id}
                  onSelect={() => void moveToFolder({ whiteboardId: board.id, folderId: f.id })}
                >
                  <FolderIcon /> {f.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 /> Delete
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
                <DialogTitle>Rename whiteboard</DialogTitle>
              </DialogHeader>
              <Input className="mt-4" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              <DialogFooter className="mt-4">
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Delete “{board.name}”?</DialogTitle>
                <DialogDescription>The whiteboard and its layout are removed. Cards stay in your library.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancel
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
                  Delete
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
