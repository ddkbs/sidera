import { BookOpen, CalendarDays, ChevronRight, Home, LayoutDashboard, Moon, PanelLeft, Sparkles, Sun } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetWhiteboardQuery, useListTagsQuery, useUpdateWhiteboardMutation } from '@/store/api'
import { navigate, setChatOpen, toggleSidebar, toggleTheme } from '@/store/ui'

export function TopBar() {
  const dispatch = useAppDispatch()
  const { sidebarOpen, view, theme, chatOpen } = useAppSelector((s) => s.ui)

  return (
    <header className={cn('drag-region flex h-12 shrink-0 items-center gap-1 border-b px-2', !sidebarOpen && 'pl-20')}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="no-drag size-8" onClick={() => dispatch(toggleSidebar())}>
            <PanelLeft className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle sidebar ⌘\</TooltipContent>
      </Tooltip>
      <div className="mx-1 h-4 w-px bg-border" />
      <nav className="no-drag flex min-w-0 items-center gap-0.5 text-sm">
        {view.type === 'whiteboard' && <WhiteboardCrumbs id={view.id} />}
        {view.type === 'library' && <LibraryCrumbs tagId={view.tagId} />}
        {view.type === 'journal' && <Crumb icon={<CalendarDays className="size-3.5" />} current>Journal</Crumb>}
        {view.type === 'home' && <Crumb icon={<Home className="size-3.5" />} current>Home</Crumb>}
      </nav>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={chatOpen ? 'secondary' : 'ghost'} size="sm" className="no-drag h-8 gap-1.5" onClick={() => dispatch(setChatOpen(!chatOpen))}>
            <Sparkles className="size-4" /> Ask AI
          </Button>
        </TooltipTrigger>
        <TooltipContent>Assistant ⌘J</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon" className="no-drag size-8" onClick={() => dispatch(toggleTheme())} aria-label="Toggle theme">
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
    </header>
  )
}

function LibraryCrumbs({ tagId }: { tagId: string | null }) {
  const dispatch = useAppDispatch()
  const { data: tags = [] } = useListTagsQuery()
  const tag = tags.find((t) => t.id === tagId)
  return (
    <>
      <Crumb icon={<BookOpen className="size-3.5" />} current={!tag} onClick={() => dispatch(navigate({ type: 'library', tagId: null, mode: 'table' }))}>
        Card Library
      </Crumb>
      {tag && (
        <>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <Crumb current>#{tag.name}</Crumb>
        </>
      )}
    </>
  )
}

function WhiteboardCrumbs({ id }: { id: string }) {
  const dispatch = useAppDispatch()
  const { data } = useGetWhiteboardQuery(id)
  const crumbs = data?.breadcrumb ?? []
  return (
    <>
      {crumbs.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {i === crumbs.length - 1 ? (
            <EditableTitle id={c.id} name={c.name} />
          ) : (
            <Crumb icon={i === 0 ? <LayoutDashboard className="size-3.5" /> : undefined} onClick={() => dispatch(navigate({ type: 'whiteboard', id: c.id }))}>
              {c.name}
            </Crumb>
          )}
        </Fragment>
      ))}
    </>
  )
}

function EditableTitle({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name)
  const [update] = useUpdateWhiteboardMutation()
  useEffect(() => setValue(name), [name])
  const commit = () => {
    const next = value.trim() || 'Untitled whiteboard'
    if (next !== name) void update({ id, name: next })
    setValue(next)
  }
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      size={Math.max(8, value.length)}
      className="rounded-md bg-transparent px-1.5 py-1 font-medium outline-none hover:bg-accent focus:bg-accent"
    />
  )
}

function Crumb(props: { icon?: React.ReactNode; current?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      disabled={!props.onClick}
      onClick={props.onClick}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground transition enabled:hover:bg-accent enabled:hover:text-foreground',
        props.current && 'font-medium text-foreground'
      )}
    >
      {props.icon}
      <span className="truncate">{props.children}</span>
    </button>
  )
}
