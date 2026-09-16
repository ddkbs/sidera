import { Pencil, Trash2 } from '@/components/icons'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PALETTE } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useDeleteTagMutation, useUpdateTagMutation } from '@/store/api'
import { navigate } from '@/store/ui'
import type { Tag } from '@shared/types'

/** Right-click menu for a tag: color, rename, delete. */
export function TagMenu({ tag, children }: { tag: Tag; children: ReactNode }) {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const [update] = useUpdateTagMutation()
  const [remove] = useDeleteTagMutation()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(tag.name)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="flex flex-col">{children}</div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuLabel className="text-xs text-muted-foreground">Color</ContextMenuLabel>
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {Object.keys(PALETTE).map((c) => (
              <button
                key={c}
                aria-label={c}
                onClick={() => update({ id: tag.id, color: c })}
                className={cn('size-5 rounded-full border-2', c === tag.color ? 'border-foreground/60' : 'border-transparent')}
                style={{ background: PALETTE[c].fg }}
              />
            ))}
          </div>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => (setName(tag.name), setRenaming(true))}>
            <Pencil /> Rename
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={async () => {
              if (view.type === 'library' && view.tagId === tag.id) dispatch(navigate({ type: 'library', tagId: null, mode: 'table' }))
              await remove(tag.id)
              toast(`Deleted #${tag.name} (cards kept)`)
            }}
          >
            <Trash2 /> Delete tag
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename tag</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) void update({ id: tag.id, name: name.trim().replace(/^#/, '') })
              setRenaming(false)
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <DialogFooter className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
