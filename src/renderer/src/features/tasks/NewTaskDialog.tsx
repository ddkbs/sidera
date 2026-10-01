import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, ChevronDown, FileText, Inbox } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { ProfileAvatar } from '@/features/profile/ProfileAvatar'
import { t } from '@/lib/i18n'
import { addTaskUndoable } from '@/lib/undo-actions'
import { cn } from '@/lib/utils'
import { useAddTaskMutation, useListProfilesQuery } from '@/store/api'
import type { TaskPriority, TaskStatus } from '@shared/types'
import { PRIORITY_LABEL, STATUS_LABEL } from './model'
import { AssigneePicker, CardPicker, DueLabel, DuePicker, PriorityIcon, PriorityPicker, StatusIcon, StatusPicker, type CardTarget } from './TaskProperties'
import { storageKey } from '@/lib/storage'

export interface NewTaskDefaults {
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string | null
  dueDate?: string | null
  card?: CardTarget
}

const TARGET_KEY = storageKey('sidera.tasks.target')
const loadTarget = (): CardTarget => {
  try {
    const target = JSON.parse(localStorage.getItem(TARGET_KEY) ?? 'null') as CardTarget | null
    return target && 'id' in target ? target : { id: null, title: 'Inbox' }
  } catch {
    return { id: null, title: 'Inbox' }
  }
}

const pill =
  'inline-flex h-7 max-w-52 items-center gap-1.5 rounded-md border bg-background px-2 text-xs text-foreground/90 shadow-xs transition hover:bg-accent data-[state=open]:bg-accent'

export function NewTaskDialog({ open, onOpenChange, defaults, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: NewTaskDefaults; onCreated?: (t: { cardId: string; taskId: string }) => void }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [card, setCard] = useState<CardTarget>(loadTarget)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: profiles = [] } = useListProfilesQuery()
  const [addTask] = useAddTaskMutation()
  const input = useRef<HTMLTextAreaElement>(null)
  const assignee = profiles.find((p) => p.id === assigneeId) ?? null

  useEffect(() => {
    if (!open) return
    setText('')
    setStatus(defaults?.status ?? 'todo')
    setPriority(defaults?.priority ?? 'none')
    setAssigneeId(defaults?.assigneeId ?? null)
    setDueDate(defaults?.dueDate ?? null)
    setCard(defaults?.card ?? loadTarget())
  }, [open, defaults])

  const chooseCard = (target: CardTarget) => {
    setCard(target)
    try {
      localStorage.setItem(TARGET_KEY, JSON.stringify(target))
    } catch {
      /* ignore */
    }
  }

  const submit = async () => {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    let created: { cardId: string; taskId: string } | undefined
    let error: string | undefined
    await addTaskUndoable(async () => {
      const res = await addTask({ text: value, cardId: card.id ?? undefined, status, priority, assigneeId, dueDate })
      if ('error' in res) error = String(res.error)
      else created = res.data
      return created
    }, card.id ?? undefined)
    setBusy(false)
    if (!created) {
      toast.error(error ? t('task.createFailedError', { error }) : t('task.createFailed'))
      if (card.id) chooseCard({ id: null, title: 'Inbox' })
      return
    }
    toast.success(t('task.created'), { duration: 1500 })
    onCreated?.(created)
    if (more) {
      setText('')
      input.current?.focus()
    } else onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[22%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <div className="flex items-center gap-1.5 px-4 pt-3.5 text-xs text-muted-foreground">
          <CardPicker value={card} onChange={chooseCard}>
            <button className="inline-flex h-6 max-w-60 items-center gap-1.5 rounded-md bg-muted px-2 font-medium text-foreground/80 transition hover:bg-accent">
              {card.id ? <FileText className="size-3.5 shrink-0" /> : <Inbox className="size-3.5 shrink-0" />}
              <span className="truncate">{card.id === null ? t('task.inbox') : card.title || t('common.untitled')}</span>
              <ChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </CardPicker>
          <span>›</span>
          <DialogTitle className="text-xs font-normal text-muted-foreground">{t('cmd.tasks.new')}</DialogTitle>
          <DialogDescription className="sr-only">{t('task.newHint')}</DialogDescription>
        </div>
        <textarea
          ref={input}
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder={t('task.titlePlaceholder')}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-lg font-medium tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
          <StatusPicker value={status} onChange={setStatus}>
            <button className={pill}>
              <StatusIcon status={status} className="size-3.5" />
              {STATUS_LABEL[status]}
            </button>
          </StatusPicker>
          <PriorityPicker value={priority} onChange={setPriority}>
            <button className={pill}>
              <PriorityIcon priority={priority} className="size-3.5" />
              {priority === 'none' ? t('task.priority') : PRIORITY_LABEL[priority]}
            </button>
          </PriorityPicker>
          <AssigneePicker value={assigneeId} onChange={setAssigneeId}>
            <button className={pill}>
              {assignee ? <ProfileAvatar profile={assignee} size="xs" className="-ml-0.5 size-4 text-[8px]" /> : null}
              <span className={cn('truncate', !assignee && 'text-muted-foreground')}>{assignee?.name ?? t('task.assignee')}</span>
            </button>
          </AssigneePicker>
          <DuePicker value={dueDate} onChange={setDueDate}>
            <button className={pill}>
              {dueDate ? (
                <DueLabel due={dueDate} className="text-inherit" />
              ) : (
                <>
                  <CalendarIcon className="size-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{t('task.dueDate')}</span>
                </>
              )}
            </button>
          </DuePicker>
        </div>
        <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
            <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} className="accent-primary" />
            {t('task.createMore')}
          </label>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={!text.trim() || busy} onClick={() => void submit()}>
            {t('task.create')} <Kbd className="bg-primary-foreground/15 text-primary-foreground">↩</Kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
