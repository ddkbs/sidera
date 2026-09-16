import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Hash, Home, LayoutDashboard, PanelLeft, Plus, X } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useListTagsQuery, useListWhiteboardsQuery } from '@/store/api'
import { back, closeTab, forward, moveTab, openTab, selectTab, toggleSidebar, type View } from '@/store/ui'

/** Human title + icon for any view (used by tabs). */
export function useViewLabel(view: View): { title: string; Icon: typeof Home } {
  const { data: boards = [] } = useListWhiteboardsQuery()
  const { data: tags = [] } = useListTagsQuery()
  switch (view.type) {
    case 'whiteboard':
      return { title: boards.find((b) => b.id === view.id)?.name ?? 'Whiteboard', Icon: LayoutDashboard }
    case 'library': {
      const tag = tags.find((t) => t.id === view.tagId)
      return tag ? { title: tag.name, Icon: Hash } : { title: 'Card Library', Icon: BookOpen }
    }
    case 'journal':
      return { title: 'Journal', Icon: CalendarDays }
    default:
      return { title: 'Home', Icon: Home }
  }
}

function TabItem({ id, view, index, active, closable }: { id: string; view: View; index: number; active: boolean; closable: boolean }) {
  const dispatch = useAppDispatch()
  const { title, Icon } = useViewLabel(view)
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/x-canvascl-tab', String(index))}
      onDragOver={(e) => e.dataTransfer.types.includes('application/x-canvascl-tab') && e.preventDefault()}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData('application/x-canvascl-tab'))
        if (!Number.isNaN(from) && from !== index) dispatch(moveTab({ from, to: index }))
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          dispatch(closeTab(id))
        }
      }}
      onClick={() => dispatch(selectTab(id))}
      className={cn(
        'no-drag group relative flex h-full max-w-56 min-w-28 shrink cursor-default items-center gap-2 border-r px-3 text-sm select-none',
        active ? 'bg-background text-foreground' : 'bg-sidebar text-muted-foreground hover:text-foreground'
      )}
      title={title}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{title}</span>
      {closable && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            dispatch(closeTab(id))
          }}
          className={cn('ml-auto grid size-5 shrink-0 place-items-center rounded hover:bg-accent', !active && 'opacity-0 group-hover:opacity-100')}
          aria-label="Close tab"
        >
          <X className="size-3" />
        </button>
      )}
      {active && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
    </div>
  )
}

export function TabBar() {
  const dispatch = useAppDispatch()
  const { tabs, activeTabId, sidebarOpen } = useAppSelector((s) => s.ui)
  const activeTab = tabs.find((t) => t.id === activeTabId)
  const newTabKey = formatBinding(useBinding('tab.new'))

  const navBtn = 'no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className={cn('drag-region flex h-10 shrink-0 items-stretch border-b bg-sidebar', !sidebarOpen && 'pl-20')}>
      <div className="flex items-center gap-0.5 px-2">
        {!sidebarOpen && (
          <button className={navBtn} onClick={() => dispatch(toggleSidebar())} aria-label="Show sidebar">
            <PanelLeft className="size-4" />
          </button>
        )}
        <button className={navBtn} disabled={!activeTab?.back.length} onClick={() => dispatch(back())} aria-label="Back">
          <ChevronLeft className="size-4" />
        </button>
        <button className={navBtn} disabled={!activeTab?.forward.length} onClick={() => dispatch(forward())} aria-label="Forward">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto border-l [scrollbar-width:none]">
          {tabs.map((t, i) => (
            <TabItem key={t.id} id={t.id} view={t.view} index={i} active={t.id === activeTabId} closable={tabs.length > 1} />
          ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="no-drag grid w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-foreground" onClick={() => dispatch(openTab(undefined))} aria-label="New tab">
              <Plus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>New tab {newTabKey}</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
      </div>
    </div>
  )
}
