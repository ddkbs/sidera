import { recordTaskToggle } from '@/lib/undo-actions'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { File, FileText, Paperclip, Pencil, Send, Trash2, X } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useAppDispatch } from '@/store'
import {
  useAddTaskCommentMutation,
  useDeleteTaskCommentMutation,
  useListTaskCommentsQuery,
  useListTasksQuery,
  useSetTaskCheckedMutation,
  useUpdateTaskCommentMutation
} from '@/store/api'
import { navigate, openCard } from '@/store/ui'
import type { FileRecord, TaskComment } from '@shared/types'

function relTime(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Right-side panel for a single task: checkbox, its card, and a comment thread with file/photo attachments. */
export function TaskDetailPanel({ cardId, taskId, onClose }: { cardId: string; taskId: string; onClose: () => void }) {
  const dispatch = useAppDispatch()
  const { data: tasks = [] } = useListTasksQuery({ status: 'all' })
  const task = tasks.find((t) => t.cardId === cardId && t.taskId === taskId)
  const [setChecked] = useSetTaskCheckedMutation()
  const { data: comments = [], isLoading } = useListTaskCommentsQuery({ cardId, taskId })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role=dialog]') && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className="absolute inset-y-2 right-2 z-30 flex w-[min(480px,44vw)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl shadow-black/10"
    >
      <div className="flex h-11 shrink-0 items-center gap-1 border-b px-2">
        <span className="px-2 text-xs text-muted-foreground">Task</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {!task ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Task not found</div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b px-5 py-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={task.checked}
                onCheckedChange={(v) => {
                  void setChecked({ cardId, index: task.index, checked: v === true })
                  recordTaskToggle(cardId, task.index, v === true)
                }}
              />
              <span className={cn('min-w-0 flex-1', task.checked && 'text-muted-foreground line-through')}>{task.text || 'Untitled task'}</span>
            </label>
            <button
              onClick={() => (task.isJournal ? dispatch(navigate({ type: 'journal' })) : dispatch(openCard(cardId)))}
              className="flex items-center gap-1.5 pl-7 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <FileText className="size-3.5" />
              {task.isJournal ? 'In journal' : task.cardTitle || 'Untitled'}
            </button>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 px-5 py-4">
              {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
              {!isLoading && comments.length === 0 && <div className="text-sm text-muted-foreground">No comments yet.</div>}
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c} />
              ))}
            </div>
          </ScrollArea>
          <Composer cardId={cardId} taskId={taskId} />
        </>
      )}
    </motion.aside>
  )
}

function CommentRow({ comment }: { comment: TaskComment }) {
  const [update] = useUpdateTaskCommentMutation()
  const [remove] = useDeleteTaskCommentMutation()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.body)

  const save = async () => {
    const value = text.trim()
    setEditing(false)
    if (value && value !== comment.body) await update({ id: comment.id, body: value, taskId: comment.taskId })
  }

  if (editing)
    return (
      <div className="space-y-1.5">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setEditing(false)
              setText(comment.body)
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
          }}
          rows={2}
          className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none"
        />
        <div className="flex gap-1.5">
          <Button size="sm" onClick={() => void save()}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setText(comment.body)
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )

  return (
    <div className="group/comment">
      <div className="flex items-start justify-between gap-2">
        {comment.body && <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{comment.body}</p>}
        <div className="flex shrink-0 items-center gap-1.5 pl-2">
          <span className="text-[11px] text-muted-foreground">{relTime(comment.updatedAt)}</span>
          <div className="hidden items-center gap-0.5 group-hover/comment:flex">
            <button onClick={() => setEditing(true)} className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <Pencil className="size-3.5" />
            </button>
            <button
              onClick={() => void remove({ id: comment.id, taskId: comment.taskId })}
              className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
      {comment.files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {comment.files.map((f) => (
            <FileChip key={f.id} file={f} />
          ))}
        </div>
      )}
    </div>
  )
}

function FileChip({ file }: { file: FileRecord }) {
  const [url, setUrl] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    void window.api.getFileUrl(file.id).then(setUrl)
  }, [file.id])
  const isImage = file.mime.startsWith('image/')

  if (isImage)
    return (
      <>
        <button onClick={() => setOpen(true)} className="block size-16 overflow-hidden rounded-md border bg-muted">
          {url && <img src={url} alt={file.name} className="size-full object-cover" />}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl">
            <DialogTitle className="sr-only">{file.name}</DialogTitle>
            {url && <img src={url} alt={file.name} className="max-h-[75vh] w-full object-contain" />}
          </DialogContent>
        </Dialog>
      </>
    )

  return (
    <button
      onClick={() => url && window.open(url)}
      className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1.5 text-xs transition hover:bg-accent"
    >
      <File className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="max-w-32 truncate">{file.name}</span>
      <span className="text-muted-foreground">{formatSize(file.size)}</span>
    </button>
  )
}

function Composer({ cardId, taskId }: { cardId: string; taskId: string }) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<FileRecord[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [addComment, { isLoading: sending }] = useAddTaskCommentMutation()
  const input = useRef<HTMLTextAreaElement>(null)

  const pickFiles = async () => {
    const files = await window.api.importFiles()
    if (files.length) setPending((p) => [...p, ...files])
  }

  const send = async () => {
    const value = body.trim()
    if (!value && pending.length === 0) return
    const res = await addComment({ cardId, taskId, body: value, fileIds: pending.map((f) => f.id) })
    if ('error' in res) {
      toast.error('Could not add comment')
      return
    }
    setBody('')
    setPending([])
    input.current?.focus()
  }

  const addPastedImage = async (item: DataTransferItem) => {
    const blob = item.getAsFile()
    if (!blob) return
    const buf = await blob.arrayBuffer()
    let binary = ''
    const bytes = new Uint8Array(buf)
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const ext = item.type.split('/')[1] || 'png'
    const rec = await window.api.importFileData({ name: `pasted-${Date.now()}.${ext}`, mime: item.type, dataBase64: btoa(binary) })
    setPending((p) => [...p, rec])
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    void addPastedImage(item)
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const paths = [...e.dataTransfer.files].map((f) => window.files.pathFor(f)).filter(Boolean)
    if (!paths.length) return
    const files = await window.api.importFiles(paths)
    if (files.length) setPending((p) => [...p, ...files])
  }

  return (
    <div
      className={cn('shrink-0 border-t p-3 transition', dragOver && 'bg-accent/40')}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      {pending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {pending.map((f) => (
            <span key={f.id} className="flex items-center gap-1 rounded-md border bg-muted px-1.5 py-1 text-xs">
              <File className="size-3" />
              <span className="max-w-24 truncate">{f.name}</span>
              <button onClick={() => setPending((p) => p.filter((x) => x.id !== f.id))} className="text-muted-foreground hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring/20">
        <button
          onClick={() => void pickFiles()}
          className="mb-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="size-4" />
        </button>
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
          }}
          placeholder="Write a comment… (⌘⏎ to send)"
          rows={1}
          className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          disabled={sending || (!body.trim() && pending.length === 0)}
          onClick={() => void send()}
          className="mb-0.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  )
}
