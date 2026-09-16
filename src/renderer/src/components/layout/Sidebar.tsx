import { BookOpen, CalendarDays, ChevronRight, Hash, Home, LayoutDashboard, ListChecks, PanelLeft, Plus, Search } from '@/components/icons'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Orb } from '@/components/Orb'
import { BoardMenu } from './BoardMenu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TagMenu } from '@/features/card/TagMenu'
import { color } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useCreateWhiteboardMutation, useGetMcpInfoQuery, useListTagsQuery, useListWhiteboardsQuery } from '@/store/api'
import { navigate, openSettings, openTab, setPaletteOpen, toggleSidebar, type View } from '@/store/ui'
import type { Whiteboard } from '@shared/types'

export function Sidebar() {
  const dispatch = useAppDispatch()
  const view = useAppSelector((s) => s.ui.view)
  const { data: boards = [] } = useListWhiteboardsQuery()
  const { data: tags = [] } = useListTagsQuery()
  const { data: mcp } = useGetMcpInfoQuery()
  const [createWhiteboard] = useCreateWhiteboardMutation()
  const last = useAppSelector((s) => s.ui.activity[0])
  const [agentBusy, setAgentBusy] = useState(false)
  useEffect(() => {
    if (!last) return
    setAgentBusy(true)
    const t = setTimeout(() => setAgentBusy(false), 2500)
    return () => clearTimeout(t)
  }, [last])

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

  /** ⌘-click opens in a new tab, like a browser */
  const go = (v: View, e?: { metaKey: boolean }) => dispatch(e?.metaKey ? openTab(v) : navigate(v))
  const newBoard = async () => {
    const res = await createWhiteboard({ name: 'Untitled whiteboard' })
    if ('data' in res && res.data) go({ type: 'whiteboard', id: res.data.id })
    else toast.error('Could not create whiteboard')
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
          onClick={() => dispatch(setPaletteOpen(true))}
          className="no-drag flex h-8 w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition hover:text-foreground"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Search</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-0.5 px-2 text-sm">
          <NavItem icon={<Home className="size-4" />} active={view.type === 'home'} onClick={(e) => go({ type: 'home' }, e)}>
            Home
          </NavItem>
          <NavItem icon={<CalendarDays className="size-4" />} active={view.type === 'journal'} onClick={(e) => go({ type: 'journal' }, e)}>
            Journal
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

          <SectionHeader action={<AddButton onClick={newBoard} label="New whiteboard" />}>Whiteboards</SectionHeader>
          {(tree.get(null) ?? []).map((b) => (
            <BoardItem key={b.id} board={b} tree={tree} depth={0} />
          ))}
          {!boards.length && <p className="px-2 py-1 text-xs text-muted-foreground">No whiteboards yet</p>}

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
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={() => dispatch(openSettings('mcp'))}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <Orb online={!!mcp?.running} active={agentBusy} />
          <span className="truncate">{agentBusy && last ? `Agent: ${last.tool}` : `MCP server ${mcp?.running ? 'ready' : 'offline'}`}</span>
        </button>
      </div>
    </div>
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
      <div style={{ paddingLeft: depth * 12 }} className="group flex items-center">
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

function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
      {children}
      {action}
    </div>
  )
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" className="size-5" onClick={onClick} aria-label={label}>
      <Plus className="size-3.5" />
    </Button>
  )
}
