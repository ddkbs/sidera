import { ChevronRight, LayoutDashboard } from '@/components/icons'
import { Fragment, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import { useGetWhiteboardQuery, useUpdateWhiteboardMutation } from '@/store/api'
import { navigate } from '@/store/ui'

/** Floating breadcrumb pill on the canvas: parent boards + inline-editable title. */
export function BoardBreadcrumb({ id }: { id: string }) {
  return (
    <nav className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-10rem)] min-w-0 items-center gap-0.5 rounded-xl border bg-popover/95 p-1 text-sm shadow-[0_8px_30px_-12px_rgba(0,0,0,0.2)] backdrop-blur">
      <WhiteboardCrumbs id={id} />
    </nav>
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
      className="max-w-[40vw] min-w-16 rounded-md bg-transparent px-2 py-1 font-medium outline-none [field-sizing:content] hover:bg-accent focus:bg-accent"
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
