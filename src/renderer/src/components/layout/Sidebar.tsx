import { record } from '@/lib/undo'
import {
  BookOpen,
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Hash,
  Home,
  LayoutDashboard,
  ListChecks,
  PanelLeft,
  Plus,
  Search,

} from '@/components/icons'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Orb } from '@/components/Orb'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import { BoardMenu } from './BoardMenu'
import { FolderMenu } from './FolderMenu'
import { ProfileFooter } from '@/features/profile/ProfileMenu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TagMenu } from '@/features/card/TagMenu'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  useCreateFolderMutation,
  useCreateWhiteboardMutation,
  useListFoldersQuery,
  useListTagsQuery,
  useListWhiteboardsQuery,
  useMoveFolderMutation,
  useMoveWhiteboardToFolderMutation,
  useRenameFolderMutation
} from '@/store/api'
import { type View, navigate, openTab, setChatOpen, setPaletteOpen, toggleSidebar } from '@/store/ui'
import type { Folder, Whiteboard } from '@shared/types'

const COLLAPSED_KEY = 'canvascl.folders.collapsed'
const WHITEBOARD_DND = 'application/x-canvascl-whiteboard'
const FOLDER_DND = 'application/x-canvascl-folder'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function Sidebar() {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const { data: boards = [] } = useListWhiteboardsQuery()
  const { data: folders = [] } = useListFoldersQuery()
  const { data: tags = [] } = useListTagsQuery()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const [createFolder] = useCreateFolderMutation()
  const [moveWhiteboardToFolder] = useMoveWhiteboardToFolderMutation()
  const [moveFolder] = useMoveFolderMutation()
  const last = useAppSelector((s) => s.ui.activity[0])
  const chatOpen = useAppSelector((s) => s.ui.chatOpen)
  const searchKey = formatBinding(useBinding('palette.open'))
  const chatKey = formatBinding(useBinding('chat.toggle'))
  const [agentBusy, setAgentBusy] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [draftFolder, setDraftFolder] = useState<{ parentId: string | null; name: string } | null>(null)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // folder id being dragged over, or 'root'
  useEffect(() => {
    if (!last) return
    setAgentBusy(true)
    const t = setTimeout(() => setAgentBusy(false), 2500)
    return () => clearTimeout(t)
  }, [last])

  const toggleFolder = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })

  /** Nested-board tree (board placed on another board) — unaffected by folders. */
  const tree = useMemo(() => {
    const byParent = new Map<string | null, Whiteboard[]>()
    const ids = new Set(boards.map((b) => b.id))
    for (const b of boards) {
      const key = b.parentId && ids.has(b.parentId) ? b.parentId : null
      byParent.set(key, [...(byParent.get(key) ?? []), b])
    }
    for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return byParent
  }, [boards])

  /** Sidebar folder tree (folder inside folder), independent of nested boards. */
  const folderTree = useMemo(() => {
    const byParent = new Map<string | null, Folder[]>()
    const ids = new Set(folders.map((f) => f.id))
    for (const f of folders) {
      const key = f.parentId && ids.has(f.parentId) ? f.parentId : null
      byParent.set(key, [...(byParent.get(key) ?? []), f])
    }
    for (const list of byParent.values()) list.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    return byParent
  }, [folders])

  /** Root whiteboards (no parent board) grouped by their sidebar folder. */
  const boardsByFolder = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id))
    const map = new Map<string | null, Whiteboard[]>()
    for (const b of tree.get(null) ?? []) {
      const key = b.folderId && folderIds.has(b.folderId) ? b.folderId : null
      map.set(key, [...(map.get(key) ?? []), b])
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return map
  }, [tree, folders])

  /** ⌘-click opens in a new tab, like a browser */
  const go = (v: View, e?: { metaKey: boolean }) => dispatch(e?.metaKey ? openTab(v) : navigate(v))
  const newBoard = async (folderId?: string | null) => {
    const res = await createWhiteboard({ name: 'Untitled whiteboard', folderId: folderId ?? null })
    if ('data' in res && res.data) go({ type: 'whiteboard', id: res.data.id })
    else toast.error('Could not create whiteboard')
  }

  const confirmDraftFolder = async () => {
    if (!draftFolder) return
    const name = draftFolder.name.trim()
    const parentId = draftFolder.parentId
    setDraftFolder(null)
    if (!name) return
    if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n })
    const res = await createFolder({ name, parentId })
    if (!('data' in res)) toast.error('Could not create folder')
  }

  const dropOnFolder = async (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault()
    setDropTarget(null)
    const boardId = e.dataTransfer.getData(WHITEBOARD_DND)
    const draggedFolderId = e.dataTransfer.getData(FOLDER_DND)
    if (boardId) {
      const prev = boards.find((b) => b.id === boardId)?.folderId ?? null
      if (prev === folderId) return
      await moveWhiteboardToFolder({ whiteboardId: boardId, folderId })
      record({
        label: 'Move whiteboard',
        undo: () => window.api.moveWhiteboardToFolder(boardId, prev),
        redo: () => window.api.moveWhiteboardToFolder(boardId, folderId)
      })
    } else if (draggedFolderId && draggedFolderId !== folderId) {
      const prev = folders.find((f) => f.id === draggedFolderId)?.parentId ?? null
      const res = await moveFolder({ id: draggedFolderId, parentId: folderId })
      if ('error' in res) toast.error(String(res.error))
      else
        record({
          label: 'Move folder',
          undo: () => window.api.moveFolder(draggedFolderId, prev),
          redo: () => window.api.moveFolder(draggedFolderId, folderId)
        })
    }
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-sidebar-border text-sidebar-foreground">
      <div className="drag-region flex h-10 shrink-0 items-center justify-end px-2">
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          aria-label="Hide sidebar"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
      <div className="px-2 pb-2">
        <button
          data-tour="sidebar-search"
          onClick={() => dispatch(setPaletteOpen(true))}
          className="no-drag flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search</span>
          <Kbd>{searchKey}</Kbd>
        </button>
        <button
          data-tour="ask-ai"
          onClick={() => dispatch(setChatOpen(!chatOpen))}
          className={cn(
            'no-drag mt-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-sm transition hover:bg-sidebar-accent',
            chatOpen && 'bg-sidebar-accent font-medium'
          )}
        >
          <Orb online active={agentBusy} className="size-3.5" />
          <span className="flex-1 text-left">Ask AI</span>
          <span className="text-xs text-muted-foreground">{chatKey}</span>
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav data-tour="sidebar-nav" className="flex flex-col gap-0.5 px-2 text-sm">
          <NavItem icon={<Home className="size-4" />} active={view.type === 'home'} onClick={(e) => go({ type: 'home' }, e)}>
            Home
          </NavItem>
          <NavItem icon={<ListChecks className="size-4" />} active={view.type === 'tasks'} onClick={(e) => go({ type: 'tasks' }, e)}>
            Tasks
          </NavItem>
          <NavItem
            icon={<BookOpen className="size-4" />}
            active={view.type === 'library' && !view.tagId}
            onClick={(e) => go({ type: 'library', tagId: null, mode: 'table' }, e)}
          >
            Card Library
          </NavItem>

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(WHITEBOARD_DND) || e.dataTransfer.types.includes(FOLDER_DND)) {
                    e.preventDefault()
                    setDropTarget('root')
                  }
                }}
                onDragLeave={() => setDropTarget((t) => (t === 'root' ? null : t))}
                onDrop={(e) => void dropOnFolder(e, null)}
              >
                <SectionHeader
                  action={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-5" aria-label="Add">
                          <Plus className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => void newBoard(null)}>
                          <LayoutDashboard /> New whiteboard
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setDraftFolder({ parentId: null, name: '' })}>
                          <FolderPlus /> New folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                  className={cn(dropTarget === 'root' && 'rounded bg-sidebar-accent ring-1 ring-inset ring-primary/40')}
                >
                  Whiteboards
                </SectionHeader>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-48">
              <ContextMenuItem onSelect={() => setDraftFolder({ parentId: null, name: '' })}>
                <FolderPlus /> New folder
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {(folderTree.get(null) ?? []).map((f) => (
            <FolderItem
              key={f.id}
              folder={f}
              depth={0}
              folderTree={folderTree}
              boardsByFolder={boardsByFolder}
              tree={tree}
              collapsed={collapsed}
              toggleFolder={toggleFolder}
              draftFolder={draftFolder}
              setDraftFolder={setDraftFolder}
              confirmDraftFolder={confirmDraftFolder}
              renamingFolderId={renamingFolderId}
              setRenamingFolderId={setRenamingFolderId}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
              dropOnFolder={dropOnFolder}
            />
          ))}
          {draftFolder && draftFolder.parentId === null && (
            <FolderDraftRow depth={0} value={draftFolder.name} onChange={(name) => setDraftFolder({ parentId: null, name })} onConfirm={confirmDraftFolder} onCancel={() => setDraftFolder(null)} />
          )}
          {(boardsByFolder.get(null) ?? []).map((b) => (
            <BoardItem key={b.id} board={b} tree={tree} depth={0} />
          ))}
          {!boards.length && !folders.length && <p className="px-2 py-1 text-xs text-muted-foreground">No whiteboards yet</p>}

          <SectionHeader>Tags</SectionHeader>
          {tags.map((t) => (
            <TagMenu key={t.id} tag={t}>
              <NavItem
                icon={<Hash className="size-3.5" style={{ color: color(t.color).fg }} />}
                active={view.type === 'library' && view.tagId === t.id}
                onClick={(e) => go({ type: 'library', tagId: t.id, mode: view.type === 'library' ? view.mode : 'table' }, e)}
              >
                {t.name}
              </NavItem>
            </TagMenu>
          ))}
          {!tags.length && <p className="px-2 py-1 text-xs text-muted-foreground">Tag cards to build databases</p>}
        </nav>
      </ScrollArea>
      <ProfileFooter status={agentBusy && last ? `Agent: ${last.tool}` : undefined} />
    </div>
  )
}

interface FolderItemProps {
  folder: Folder
  depth: number
  folderTree: Map<string | null, Folder[]>
  boardsByFolder: Map<string | null, Whiteboard[]>
  tree: Map<string | null, Whiteboard[]>
  collapsed: Set<string>
  toggleFolder: (id: string) => void
  draftFolder: { parentId: string | null; name: string } | null
  setDraftFolder: (v: { parentId: string | null; name: string } | null) => void
  confirmDraftFolder: () => void
  renamingFolderId: string | null
  setRenamingFolderId: (id: string | null) => void
  dropTarget: string | null
  setDropTarget: (id: string | null) => void
  dropOnFolder: (e: React.DragEvent, folderId: string | null) => void
}

function FolderItem(props: FolderItemProps) {
  const {
    folder,
    depth,
    folderTree,
    boardsByFolder,
    tree,
    collapsed,
    toggleFolder,
    draftFolder,
    setDraftFolder,
    confirmDraftFolder,
    renamingFolderId,
    setRenamingFolderId,
    dropTarget,
    setDropTarget,
    dropOnFolder
  } = props
  const [renameFolder] = useRenameFolderMutation()
  const [name, setName] = useState(folder.name)
  const isOpen = !collapsed.has(folder.id)
  const subfolders = folderTree.get(folder.id) ?? []
  const childBoards = boardsByFolder.get(folder.id) ?? []
  const isRenaming = renamingFolderId === folder.id
  const isDropTarget = dropTarget === folder.id

  return (
    <>
      <FolderMenu
        folder={folder}
        onStartRename={() => {
          setName(folder.name)
          setRenamingFolderId(folder.id)
        }}
        onNewSubfolder={() => {
          setDraftFolder({ parentId: folder.id, name: '' })
          if (!isOpen) toggleFolder(folder.id)
        }}
      >
        <div
          style={{ paddingLeft: depth * 12 }}
          className={cn('group flex items-center rounded', isDropTarget && 'bg-sidebar-accent ring-1 ring-inset ring-primary/40')}
          draggable={!isRenaming}
          onDragStart={(e) => {
            e.dataTransfer.setData(FOLDER_DND, folder.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(WHITEBOARD_DND) || e.dataTransfer.types.includes(FOLDER_DND)) {
              e.preventDefault()
              setDropTarget(folder.id)
            }
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => void dropOnFolder(e, folder.id)}
        >
          <button
            onClick={() => toggleFolder(folder.id)}
            className={cn('grid size-5 place-items-center rounded text-muted-foreground hover:bg-sidebar-accent', !subfolders.length && !childBoards.length && 'invisible')}
          >
            <ChevronRight className={cn('size-3 transition-transform', isOpen && 'rotate-90')} />
          </button>
          {isRenaming ? (
            <InlineNameInput
              value={name}
              onChange={setName}
              onConfirm={() => {
                setRenamingFolderId(null)
                const trimmed = name.trim()
                if (trimmed && trimmed !== folder.name) void renameFolder({ id: folder.id, name: trimmed })
              }}
              onCancel={() => setRenamingFolderId(null)}
            />
          ) : (
            <NavItem className="flex-1" icon={<FolderIcon className="size-4" />} onClick={() => toggleFolder(folder.id)}>
              {folder.name}
            </NavItem>
          )}
        </div>
      </FolderMenu>
      {isOpen && (
        <>
          {subfolders.map((f) => (
            <FolderItem key={f.id} {...props} folder={f} depth={depth + 1} />
          ))}
          {draftFolder && draftFolder.parentId === folder.id && (
            <FolderDraftRow
              depth={depth + 1}
              value={draftFolder.name}
              onChange={(v) => setDraftFolder({ parentId: folder.id, name: v })}
              onConfirm={confirmDraftFolder}
              onCancel={() => setDraftFolder(null)}
            />
          )}
          {childBoards.map((b) => (
            <BoardItem key={b.id} board={b} tree={tree} depth={depth + 1} />
          ))}
          {!subfolders.length && !childBoards.length && !draftFolder && (
            <p style={{ paddingLeft: (depth + 1) * 12 + 8 }} className="py-1 text-xs text-muted-foreground">
              Empty
            </p>
          )}
        </>
      )}
    </>
  )
}

function FolderDraftRow({
  depth,
  value,
  onChange,
  onConfirm,
  onCancel
}: {
  depth: number
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ paddingLeft: depth * 12 }} className="flex items-center">
      <span className="grid size-5 place-items-center text-muted-foreground">
        <FolderIcon className="size-4" />
      </span>
      <InlineNameInput value={value} onChange={onChange} onConfirm={onConfirm} onCancel={onCancel} placeholder="Folder name" />
    </div>
  )
}

function InlineNameInput({
  value,
  onChange,
  onConfirm,
  onCancel,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  onConfirm: () => void
  onCancel: () => void
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onConfirm()
        else if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={onConfirm}
      className="h-7 flex-1 rounded-md border border-sidebar-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary/40"
    />
  )
}

function BoardItem({ board, tree, depth }: { board: Whiteboard; tree: Map<string | null, Whiteboard[]>; depth: number }) {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const children = tree.get(board.id) ?? []
  const [open, setOpen] = useState(true)
  return (
    <>
      <BoardMenu board={board}>
        <div
          style={{ paddingLeft: depth * 12 }}
          className="group flex items-center"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(WHITEBOARD_DND, board.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
        >
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn('grid size-5 place-items-center rounded text-muted-foreground hover:bg-sidebar-accent', !children.length && 'invisible')}
          >
            <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
          </button>
          <NavItem
            className="flex-1"
            icon={<LayoutDashboard className="size-4" />}
            active={view.type === 'whiteboard' && view.id === board.id}
            onClick={(e) => dispatch(e.metaKey ? openTab({ type: 'whiteboard', id: board.id }) : navigate({ type: 'whiteboard', id: board.id }))}
          >
            {board.name}
          </NavItem>
        </div>
      </BoardMenu>
      {open && children.map((c) => <BoardItem key={c.id} board={c} tree={tree} depth={depth + 1} />)}
    </>
  )
}

function NavItem(props: { icon: ReactNode; active?: boolean; onClick: (e: React.MouseEvent) => void; children: ReactNode; className?: string }) {
  return (
    <button
      onClick={props.onClick}
      className={cn(
        'flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent',
        props.active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        props.className
      )}
    >
      <span className="shrink-0 text-muted-foreground">{props.icon}</span>
      <span className="truncate">{props.children}</span>
    </button>
  )
}

function SectionHeader({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-4 mb-1 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground', className)}>
      {children}
      {action}
    </div>
  )
}
