import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Calendar as CalendarIcon,
  ExternalLink,
  File,
  FileText,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  UserCircle,
  X
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { locale, t, tRich } from '@/lib/i18n'
import { useCommands } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import {
  useAddTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useGetActiveProfileQuery,
  useListProfilesQuery,
  useListTaskActivityQuery,
  useListTaskCommentsQuery,
  useUpdateTaskCommentMutation
} from '@/store/api'
import { openCard, openPdf } from '@/store/ui'
import type { FileRecord, Profile, ProfileRef, Task, TaskActivity, TaskComment, TaskPriority, TaskStatus } from '@shared/types'
import { PRIORITY_LABEL, relativeTime, STATUS_LABEL } from './model'
import { AssigneeAvatar, AssigneePicker, DueLabel, DuePicker, PriorityIcon, PriorityPicker, StatusIcon, StatusPicker, useTaskPatch } from './TaskProperties'
import { isoDate } from '@shared/tasks'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const fullDate = (ms: number) => new Date(ms).toLocaleString(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Right-side panel: editable title, properties, and an activity timeline (comments + property changes). */
export function TaskDetailPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const patch = useTaskPatch()
  const { data: me } = useGetActiveProfileQuery()
  const { data: profiles = [] } = useListProfilesQuery()
  const { data: comments = [] } = useListTaskCommentsQuery({ cardId: task.cardId, taskId: task.taskId })
  const { data: activity = [] } = useListTaskActivityQuery({ cardId: task.cardId, taskId: task.taskId })
  const scroller = useRef<HTMLDivElement>(null)

  useCommands({
    'tasks.close': () => {
      if (document.querySelector('[role=dialog], [role=menu], [data-radix-popper-content-wrapper]')) return false
      onClose()
    }
  })

  const timeline = useMemo(
    () =>
      [
        ...comments.map((c) => ({ kind: 'comment' as const, at: c.createdAt, id: c.id, comment: c })),
        ...activity.map((a) => ({ kind: 'activity' as const, at: a.createdAt, id: a.id, activity: a }))
      ].sort((a, b) => a.at - b.at),
    [comments, activity]
  )

  // after sending a comment, follow the thread down once the new entry has rendered
  const [followId, setFollowId] = useState<string | null>(null)
  useEffect(() => {
    if (followId && comments.some((c) => c.id === followId)) {
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
      setFollowId(null)
    }
  }, [followId, comments])

  const isInbox = task.cardTitle === 'Inbox'
  const done = task.status === 'done'

  return (
    <motion.aside
      initial={{ x: 32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 32, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 42 }}
      className="absolute inset-y-2 right-2 z-30 flex w-[min(520px,48vw)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40"
    >
      {/* top bar */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <button
          onClick={() => dispatch(openCard(task.cardId))}
          className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title={t('task.openCard')}
        >
          {isInbox ? <Inbox className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
          <span className="truncate">{isInbox ? t('task.inbox') : task.cardTitle || t('common.untitled')}</span>
        </button>
        <span className="text-xs text-muted-foreground/60">/</span>
        <span className="truncate px-1 text-xs text-muted-foreground">{t('task.task')}</span>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => dispatch(openCard(task.cardId))}>
              <ExternalLink className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('task.openInCard')}</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label={t('common.close')}>
          <X className="size-4" />
        </Button>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {/* title */}
        <div className="flex items-start gap-2.5 px-5 pt-5">
          <StatusPicker value={task.status} onChange={(v) => void patch(task, { status: v })}>
            <button className="mt-1 grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-accent" aria-label={t('task.status')}>
              <StatusIcon status={task.status} className="size-[18px]" />
            </button>
          </StatusPicker>
          <TitleEditor key={task.taskId} value={task.text} done={done} onSave={(text) => void patch(task, { text })} />
        </div>

        {/* properties */}
        <div className="mx-5 mt-4 mb-2 grid grid-cols-[104px_1fr] items-center gap-y-0.5 text-sm">
          <PropLabel>{t('task.status')}</PropLabel>
          <StatusPicker value={task.status} onChange={(v) => void patch(task, { status: v })}>
            <PropValue>
              <StatusIcon status={task.status} /> {STATUS_LABEL[task.status as TaskStatus]}
            </PropValue>
          </StatusPicker>

          <PropLabel>{t('task.priority')}</PropLabel>
          <PriorityPicker value={task.priority} onChange={(v) => void patch(task, { priority: v })}>
            <PropValue muted={task.priority === 'none'}>
              <PriorityIcon priority={task.priority} /> {task.priority === 'none' ? t('task.setPriorityShort') : PRIORITY_LABEL[task.priority as TaskPriority]}
            </PropValue>
          </PriorityPicker>

          <PropLabel>{t('task.assignee')}</PropLabel>
          <AssigneePicker value={task.assignee?.id ?? null} onChange={(v) => void patch(task, { assigneeId: v })}>
            <PropValue muted={!task.assignee}>
              <AssigneeAvatar profile={task.assignee} />
              {task.assignee ? (
                <span className="truncate">
                  {task.assignee.name}
                  {task.assignee.id === me?.id && <span className="ml-1 text-muted-foreground">({t('task.you')})</span>}
                </span>
              ) : (
                t('task.unassigned')
              )}
            </PropValue>
          </AssigneePicker>

          <PropLabel>{t('task.dueDate')}</PropLabel>
          <div className="flex items-center gap-1">
            <DuePicker value={task.dueDate} onChange={(v) => void patch(task, { dueDate: v })}>
              <PropValue muted={!task.dueDate}>
                {task.dueDate ? (
                  <>
                    <DueLabel due={task.dueDate} done={done} className="text-sm" />
                    <span className="text-xs text-muted-foreground">{longDate(task.dueDate)}</span>
                  </>
                ) : (
                  <>
                    <CalendarIcon className="size-4" /> {t('task.noDue')}
                  </>
                )}
              </PropValue>
            </DuePicker>
          </div>

          <PropLabel>{t('task.card')}</PropLabel>
          <PropValue onClick={() => dispatch(openCard(task.cardId))}>
            {isInbox ? <Inbox className="size-4 text-muted-foreground" /> : <FileText className="size-4 text-muted-foreground" />}
            <span className="truncate">{isInbox ? t('task.inbox') : task.cardTitle || t('common.untitled')}</span>
          </PropValue>

          {task.createdBy && task.createdAt && (
            <>
              <PropLabel>{t('task.createdLabel')}</PropLabel>
              <div className="flex h-8 items-center gap-2 px-2 text-sm text-muted-foreground">
                <ProfileAvatar profile={task.createdBy} size="xs" />
                <span className="truncate">
                  {task.createdBy.name} · <TimeAgo ms={task.createdAt} />
                </span>
              </div>
            </>
          )}
        </div>

        {/* activity */}
        <div className="mt-3 border-t px-5 pt-4 pb-4">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold">{t('task.activity')}</h3>
            {comments.length > 0 && <span className="text-xs text-muted-foreground tabular-nums">{t('task.comments', { count: comments.length })}</span>}
          </div>
          {timeline.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('task.noActivity')}</p>
          ) : (
            <ol className="relative">
              <span className="absolute top-3 bottom-3 left-[11px] w-px bg-border" aria-hidden />
              {timeline.map((item) =>
                item.kind === 'comment' ? (
                  <CommentItem key={item.id} comment={item.comment} mine={!!me && item.comment.author?.id === me.id} />
                ) : (
                  <ActivityItem key={item.id} activity={item.activity} profiles={profiles} />
                )
              )}
            </ol>
          )}
        </div>
      </div>

      <Composer cardId={task.cardId} taskId={task.taskId} me={me} onSent={setFollowId} />
    </motion.aside>
  )
}

const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', ...(y !== new Date().getFullYear() && { year: 'numeric' }) })
}

function PropLabel({ children }: { children: ReactNode }) {
  return <div className="flex h-8 items-center text-[13px] text-muted-foreground">{children}</div>
}

function PropValue({ children, muted, ...rest }: { children: ReactNode; muted?: boolean } & React.ComponentProps<'button'>) {
  return (
    <button
      {...rest}
      className={cn(
        'flex h-8 min-w-0 items-center gap-2 justify-self-start rounded-md px-2 text-left text-sm transition hover:bg-accent data-[state=open]:bg-accent',
        muted && 'text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

function TimeAgo({ ms, className }: { ms: number; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={new Date(ms).toISOString()} className={cn('cursor-default', className)}>
          {relativeTime(ms)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{fullDate(ms)}</TooltipContent>
    </Tooltip>
  )
}

function TitleEditor({ value, done, onSave }: { value: string; done: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  const commit = () => {
    const v = text.replace(/\s+/g, ' ').trim()
    if (!v) return setText(value)
    if (v !== value) onSave(v)
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/\n/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          setText(value)
          requestAnimationFrame(() => ref.current?.blur())
        }
      }}
      placeholder={t('task.titlePlaceholder')}
      className={cn(
        'min-w-0 flex-1 resize-none overflow-hidden rounded-md bg-transparent py-0.5 text-xl leading-snug font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60 focus:bg-muted/40',
        done && 'text-muted-foreground'
      )}
    />
  )
}

// ---------- timeline ----------

function describeActivity(a: TaskActivity, profiles: Profile[]): ReactNode {
  const name = (id: string | null) => (id ? (profiles.find((p) => p.id === id)?.name ?? t('task.act.removedProfile')) : null)
  const strong = (s: ReactNode) => <span className="font-medium text-foreground">{s}</span>
  switch (a.kind) {
    case 'created':
      return t('task.act.created')
    case 'status':
      return tRich('task.act.status', {
        status: (
          <span className="inline-flex items-center gap-1 align-middle font-medium text-foreground">
            <StatusIcon status={(a.to ?? 'todo') as TaskStatus} className="size-3.5" />
            {STATUS_LABEL[(a.to ?? 'todo') as TaskStatus]}
          </span>
        )
      })
    case 'priority':
      return a.to === 'none' ? t('task.act.priorityRemoved') : tRich('task.act.priority', { priority: strong(PRIORITY_LABEL[(a.to ?? 'none') as TaskPriority]) })
    case 'assignee':
      if (a.to) return tRich('task.act.assigned', { name: strong(name(a.to)) })
      return a.from ? tRich('task.act.unassigned', { name: strong(name(a.from)) }) : t('task.act.unassignedTask')
    case 'due':
      return a.to
        ? tRich('task.act.due', { date: strong(a.to === isoDate() ? t('task.act.today') : longDate(a.to)) })
        : t('task.act.dueRemoved')
    case 'title':
      return tRich('task.act.title', { title: strong(t('task.act.quoted', { title: a.to ?? '' })) })
  }
}

function ActivityItem({ activity, profiles }: { activity: TaskActivity; profiles: Profile[] }) {
  return (
    <li className="relative flex items-center gap-3 py-1.5 pl-[3px] text-[13px] text-muted-foreground">
      <span className="relative z-10 grid size-[18px] shrink-0 place-items-center rounded-full bg-card ring-4 ring-card">
        {activity.actor ? <ProfileAvatar profile={activity.actor} size="xs" className="size-[18px] text-[8px]" /> : <UserCircle className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="font-medium text-foreground">{activity.actor?.name ?? t('task.someone')}</span> {describeActivity(activity, profiles)}
        <span className="mx-1.5 text-muted-foreground/50">·</span>
        <TimeAgo ms={activity.createdAt} className="text-xs" />
      </span>
    </li>
  )
}

function CommentItem({ comment, mine }: { comment: TaskComment; mine: boolean }) {
  const [update] = useUpdateTaskCommentMutation()
  const [remove] = useDeleteTaskCommentMutation()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.body)
  const edited = comment.updatedAt - comment.createdAt > 1000

  const save = async () => {
    const value = text.trim()
    setEditing(false)
    if (value && value !== comment.body) {
      const res = await update({ id: comment.id, body: value, taskId: comment.taskId })
      if ('error' in res) toast.error(String(res.error))
    } else setText(comment.body)
  }

  return (
    <li className="group/comment relative flex gap-3 py-2">
      <span className="relative z-10 shrink-0 rounded-full ring-4 ring-card">
        <AuthorAvatar author={comment.author} />
      </span>
      <div className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 shadow-xs">
        <div className="flex h-5 items-center gap-1.5 text-xs">
          <span className="truncate text-[13px] font-semibold">{comment.author?.name ?? t('task.deletedProfile')}</span>
          <TimeAgo ms={comment.createdAt} className="shrink-0 text-muted-foreground" />
          {edited && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 cursor-default text-muted-foreground/80">{t('task.edited')}</span>
              </TooltipTrigger>
              <TooltipContent>{t('home.edited', { time: fullDate(comment.updatedAt) })}</TooltipContent>
            </Tooltip>
          )}
          {mine && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-auto grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition group-hover/comment:opacity-100 hover:bg-accent hover:text-foreground data-[state=open]:opacity-100"
                  aria-label={t('task.commentActions')}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={async () => {
                    const res = await remove({ id: comment.id, taskId: comment.taskId })
                    if ('error' in res) toast.error(String(res.error))
                  }}
                >
                  <Trash2 /> {t('common.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="mt-1.5 space-y-1.5">
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setEditing(false)
                  setText(comment.body)
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
              }}
              rows={2}
              className="w-full resize-none rounded-md border bg-card px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/20"
            />
            <div className="flex justify-end gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setEditing(false)
                  setText(comment.body)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button size="xs" onClick={() => void save()}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        ) : (
          comment.body && <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
        )}
        {comment.files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {comment.files.map((f) => (
              <FileChip key={f.id} file={f} />
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function AuthorAvatar({ author }: { author: ProfileRef | null }) {
  return author ? <ProfileAvatar profile={author} size="sm" /> : <AssigneeAvatar profile={null} size="sm" />
}

function FileChip({ file }: { file: FileRecord }) {
  const dispatch = useAppDispatch()
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const isImage = file.mime.startsWith('image/') && file.mime !== 'image/svg+xml'
  const isPdf = file.mime === 'application/pdf'
  useEffect(() => {
    if (isImage) void window.api.getFileUrl(file.id).then(setUrl)
  }, [file.id, isImage])

  if (isImage)
    return (
      <>
        <button onClick={() => setOpen(true)} className="block h-20 w-28 overflow-hidden rounded-md border bg-muted transition hover:opacity-90" title={file.name}>
          {url && <img src={url} alt={file.name} className="size-full object-cover" />}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogTitle className="text-sm font-medium">{file.name}</DialogTitle>
            {url && <img src={url} alt={file.name} className="max-h-[75vh] w-full rounded-md object-contain" />}
          </DialogContent>
        </Dialog>
      </>
    )

  return (
    <button
      onClick={() =>
        isPdf
          ? dispatch(openPdf({ fileId: file.id, name: file.name }))
          : void window.api.openFile(file.id).catch((e: unknown) => toast.error(t('file.openFailed', { name: file.name, error: e instanceof Error ? e.message : String(e) })))
      }
      className="flex max-w-60 items-center gap-2 rounded-md border bg-muted/40 py-1.5 pr-2.5 pl-2 text-left transition hover:bg-accent"
      title={isPdf ? t('file.read', { name: file.name }) : t('file.open', { name: file.name })}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded bg-background">
        <File className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium">{file.name}</span>
        <span className="block text-[11px] text-muted-foreground">{formatSize(file.size)}</span>
      </span>
    </button>
  )
}

function Composer({ cardId, taskId, me, onSent }: { cardId: string; taskId: string; me: Profile | undefined; onSent: (commentId: string) => void }) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<FileRecord[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [addComment, { isLoading: sending }] = useAddTaskCommentMutation()
  const input = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [body])

  const pickFiles = async () => {
    const files = await window.api.importFiles()
    if (files.length) setPending((p) => [...p, ...files])
  }

  const send = async () => {
    const value = body.trim()
    if (!value && pending.length === 0) return
    const res = await addComment({ cardId, taskId, body: value, fileIds: pending.map((f) => f.id) })
    if ('error' in res) {
      toast.error(t('task.commentFailed'))
      return
    }
    setBody('')
    setPending([])
    onSent(res.data.id)
    input.current?.focus()
  }

  const importBlob = async (blob: Blob, name: string) => {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    try {
      const rec = await window.api.importFileData({ name, mime: blob.type, dataBase64: btoa(binary) })
      setPending((p) => [...p, rec])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
    const blob = item?.getAsFile()
    if (!item || !blob) return
    e.preventDefault()
    void importBlob(blob, `pasted-${Date.now()}.${item.type.split('/')[1] || 'png'}`)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = [...e.dataTransfer.files]
    const withPath = files.map((f) => ({ f, path: window.files.pathFor(f) }))
    const paths = withPath.filter((x) => x.path).map((x) => x.path)
    if (paths.length) {
      const recs = await window.api.importFiles(paths)
      if (recs.length) setPending((p) => [...p, ...recs])
      if (recs.length < paths.length) toast.error(t('file.unsupportedSome'))
    }
    for (const { f } of withPath.filter((x) => !x.path && x.f.type.startsWith('image/'))) await importBlob(f, f.name)
  }

  const canSend = !sending && (!!body.trim() || pending.length > 0)

  return (
    <div
      className="shrink-0 border-t bg-card px-4 py-3"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className="flex gap-3">
        <ProfileAvatar profile={me ?? null} size="sm" className="mt-1.5" />
        <div
          className={cn(
            'min-w-0 flex-1 rounded-lg border bg-background shadow-xs transition focus-within:border-ring/40 focus-within:ring-2 focus-within:ring-ring/15',
            dragOver && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
          )}
        >
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
              {pending.map((f) => (
                <span key={f.id} className="flex h-6 items-center gap-1 rounded-md border bg-muted pr-0.5 pl-1.5 text-xs">
                  <Paperclip className="size-3 text-muted-foreground" />
                  <span className="max-w-32 truncate">{f.name}</span>
                  <button onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground" aria-label={t('file.remove', { name: f.name })}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void send()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                e.currentTarget.blur()
              }
            }}
            placeholder={dragOver ? t('task.dropFiles') : t('task.commentPlaceholder')}
            rows={1}
            className="block max-h-40 min-h-9 w-full resize-none bg-transparent px-3 pt-2 pb-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => void pickFiles()} className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label={t('task.attach')}>
                  <Paperclip className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('task.attachHint')}</TooltipContent>
            </Tooltip>
            <span className="ml-auto pr-1 text-[11px] text-muted-foreground">{t('task.sendHint')}</span>
            <Button size="icon" className="size-7" disabled={!canSend} onClick={() => void send()} aria-label={t('task.send')}>
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
