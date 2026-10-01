import { BookOpen, Redo2, Undo2, Hash, Home, LayoutDashboard, ListChecks, PanelLeft, Plus, X } from '@/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AppActions } from './AppActions'
import { t } from '@/lib/i18n'
import { formatBinding, useBinding } from '@/lib/shortcuts'
import { useUndoState } from '@/lib/undo'
import { redoWithToast, undoWithToast } from '@/lib/undo-actions'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useListTagsQuery, useListWhiteboardsQuery } from '@/store/api'
import { closeTab, moveTab, openTab, selectTab, toggleSidebar, type View } from '@/store/ui'

/** Human title + icon for any view (used by tabs). */
export function useViewLabel(view: View): { title: string; Icon: typeof Home } {
  const { data: boards = [] } = useListWhiteboardsQuery()
  const { data: tags = [] } = useListTagsQuery()
  switch (view.type) {
    case 'whiteboard':
      return { title: boards.find((b) => b.id === view.id)?.name ?? t('board.whiteboard'), Icon: LayoutDashboard }
    case 'library': {
      const tag = tags.find((tg) => tg.id === view.tagId)
      return tag ? { title: tag.name, Icon: Hash } : { title: t('sidebar.library'), Icon: BookOpen }
    }
    case 'tasks':
      return { title: t('sidebar.tasks'), Icon: ListChecks }
    default:
      return { title: t('sidebar.home'), Icon: Home }
  }
}

function TabItem({ id, view, index, active, closable }: { id: string; view: View; index: number; active: boolean; closable: boolean }) {
  const dispatch = useAppDispatch()
  const { title, Icon } = useViewLabel(view)
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('application/x-sidera-tab', String(index))}
      onDragOver={(e) => e.dataTransfer.types.includes('application/x-sidera-tab') && e.preventDefault()}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData('application/x-sidera-tab'))
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
          aria-label={t('cmd.tab.close')}
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
  const { tabs, activeTabId, sidebarOpen, fullscreen } = useAppSelector((s) => s.ui)
  const undoState = useUndoState()
  const undoKey = formatBinding(useBinding('edit.undo'))
  const redoKey = formatBinding(useBinding('edit.redo'))
  const newTabKey = formatBinding(useBinding('tab.new'))

  const navBtn =
    'no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div
      data-tour="tab-bar"
      className={cn(
        'drag-region flex h-10 shrink-0 items-stretch border-b bg-sidebar transition-[padding-left] duration-200',
        !sidebarOpen && !fullscreen && 'pl-20'
      )}
    >
      <div className="flex items-center gap-0.5 px-2">
        {!sidebarOpen && (
          <button className={navBtn} onClick={() => dispatch(toggleSidebar())} aria-label={t('tabs.showSidebar')}>
            <PanelLeft className="size-4" />
          </button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={navBtn} disabled={!undoState.undo} onClick={() => void undoWithToast()} aria-label={t('common.undo')}>
              <Undo2 className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {undoState.undo ? t('undo.tooltip', { label: undoState.undo }) : t('undo.nothing')} {undoKey}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className={navBtn} disabled={!undoState.redo} onClick={() => void redoWithToast()} aria-label={t('cmd.edit.redo')}>
              <Redo2 className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {undoState.redo ? t('redo.tooltip', { label: undoState.redo }) : t('redo.nothing')} {redoKey}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto border-l [scrollbar-width:none]">
        {tabs.map((tab, i) => (
          <TabItem key={tab.id} id={tab.id} view={tab.view} index={i} active={tab.id === activeTabId} closable={tabs.length > 1} />
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="no-drag grid w-9 shrink-0 place-items-center text-muted-foreground transition hover:text-foreground"
              onClick={() => dispatch(openTab(undefined))}
              aria-label={t('cmd.tab.new')}
            >
              <Plus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t('cmd.tab.new')} {newTabKey}</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
      </div>
      {!sidebarOpen && <AppActions className="border-l px-2" />}
    </div>
  )
}
