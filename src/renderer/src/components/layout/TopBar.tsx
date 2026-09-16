import { AskAI, BookOpen, CalendarDays, ChevronRight, Home, LayoutDashboard, ListChecks, Moon, Settings, Sun } from '@/components/icons'
import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetWhiteboardQuery, useListTagsQuery, useUpdateWhiteboardMutation } from '@/store/api'
import { navigate, openSettings, setChatOpen } from '@/store/ui'
import { updateSettings } from '@/store/settings'
import { formatBinding, useBinding } from '@/lib/shortcuts'

export function TopBar() {
  const dispatch = useAppDispatch()
  const { view, theme, chatOpen } = useAppSelector((s) => s.ui)
  const chatKey = formatBinding(useBinding('chat.toggle'))
  const settingsKey = formatBinding(useBinding('settings.open'))

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b px-3">
      <nav className="flex min-w-0 items-center gap-0.5 text-sm">
        {view.type === 'whiteboard' && <WhiteboardCrumbs id={view.id} />}
        {view.type === 'library' && <LibraryCrumbs tagId={view.tagId} />}
        {view.type === 'journal' && <Crumb icon={<CalendarDays className="size-3.5" />} current>Journal</Crumb>}
        {view.type === 'tasks' && <Crumb icon={<ListChecks className="size-3.5" />} current>Tasks</Crumb>}
        {view.type === 'home' && <Crumb icon={<Home className="size-3.5" />} current>Home</Crumb>}
      </nav>
      <div className="flex-1" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button data-tour="ask-ai" variant={chatOpen ? 'secondary' : 'ghost'} size="sm" className="h-8 gap-1.5" onClick={() => dispatch(setChatOpen(!chatOpen))}>
            <AskAI className="size-4" /> Ask AI
          </Button>
        </TooltipTrigger>
        <TooltipContent>Assistant {chatKey}</TooltipContent>
      </Tooltip>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => dispatch(updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' }))}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button data-tour="settings-gear" variant="ghost" size="icon" className="size-8" onClick={() => dispatch(openSettings(undefined))} aria-label="Settings">
            <Settings className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Settings {settingsKey}</TooltipContent>
      </Tooltip>
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
