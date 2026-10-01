// Pure task view logic (filter / sort / group / labels) — no React, unit tested.
import { addDays, matchesDue } from '@shared/tasks'
import { labelMap, locale, t } from '../../lib/i18n'
import type { Task, TaskDueFilter, TaskPriority, TaskStatus } from '@shared/types'

export type TaskViewMode = 'list' | 'board'
export type GroupBy = 'status' | 'card' | 'assignee' | 'priority' | 'none'

export interface TaskFilters {
  statuses: TaskStatus[]
  /** 'any' | 'me' | 'none' (unassigned) | profile id */
  assignee: string
  priorities: TaskPriority[]
  due: TaskDueFilter | 'any'
  query: string
}

export const EMPTY_FILTERS: TaskFilters = { statuses: [], assignee: 'any', priorities: [], due: 'any', query: '' }

export const STATUS_ORDER: TaskStatus[] = ['in_progress', 'todo', 'done']
export const STATUS_LABEL = labelMap<TaskStatus>({ todo: 'task.status.todo', in_progress: 'task.status.inProgress', done: 'task.status.done' })
/** PALETTE keys (lib/colors) */
export const STATUS_COLOR: Record<TaskStatus, string> = { todo: 'gray', in_progress: 'yellow', done: 'blue' }

export const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']
export const PRIORITY_LABEL = labelMap<TaskPriority>({
  none: 'task.priority.none',
  low: 'task.priority.low',
  medium: 'task.priority.medium',
  high: 'task.priority.high',
  urgent: 'task.priority.urgent'
})

export const DUE_LABEL = labelMap<TaskDueFilter>({ overdue: 'task.due.overdue', today: 'task.due.today', week: 'task.due.week' })

export const nextStatus = (s: TaskStatus): TaskStatus => (s === 'todo' ? 'in_progress' : s === 'in_progress' ? 'done' : 'todo')

export const activeFilterCount = (f: TaskFilters): number =>
  (f.statuses.length ? 1 : 0) + (f.assignee !== 'any' ? 1 : 0) + (f.priorities.length ? 1 : 0) + (f.due !== 'any' ? 1 : 0)

export function filterTasks(tasks: Task[], f: TaskFilters, meId: string | null, today: string): Task[] {
  const q = f.query.trim().toLowerCase()
  return tasks.filter((t) => {
    if (f.statuses.length && !f.statuses.includes(t.status)) return false
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false
    if (f.assignee !== 'any') {
      const want = f.assignee === 'me' ? meId : f.assignee === 'none' ? null : f.assignee
      if ((t.assignee?.id ?? null) !== want) return false
    }
    if (f.due !== 'any' && !matchesDue(t.dueDate, f.due, today, t.status === 'done')) return false
    if (q && !t.text.toLowerCase().includes(q) && !t.cardTitle.toLowerCase().includes(q)) return false
    return true
  })
}

const rank = <T>(order: T[], v: T): number => order.indexOf(v)

/** Priority first (urgent → none), then earliest due date, then newest. Deterministic for keyboard navigation. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      rank(PRIORITY_ORDER, a.priority) - rank(PRIORITY_ORDER, b.priority) ||
      (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
      (b.createdAt ?? 0) - (a.createdAt ?? 0) ||
      a.cardId.localeCompare(b.cardId) ||
      a.index - b.index
  )
}

export interface TaskGroup {
  key: string
  label: string
  kind: GroupBy
  /** value behind the group (status / priority / profile id / card id) */
  value: string | null
  tasks: Task[]
}

export function groupTasks(tasks: Task[], by: GroupBy, meId: string | null = null): TaskGroup[] {
  const sorted = sortTasks(tasks)
  if (by === 'none') return [{ key: 'all', label: t('task.allTasks'), kind: 'none', value: null, tasks: sorted }]
  if (by === 'status')
    return STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], kind: by, value: s, tasks: sorted.filter((t) => t.status === s) })).filter(
      (g) => g.tasks.length
    )
  if (by === 'priority')
    return PRIORITY_ORDER.map((p) => ({ key: p, label: PRIORITY_LABEL[p], kind: by, value: p, tasks: sorted.filter((t) => t.priority === p) })).filter(
      (g) => g.tasks.length
    )
  const map = new Map<string, TaskGroup>()
  const unassigned = () => t('task.unassigned')
  const untitled = () => t('common.untitled')
  for (const t of sorted) {
    const [key, label, value] =
      by === 'card' ? [t.cardId, t.cardTitle || untitled(), t.cardId] : t.assignee ? [t.assignee.id, t.assignee.name, t.assignee.id] : ['none', unassigned(), null]
    let g = map.get(key)
    if (!g) map.set(key, (g = { key, label, kind: by, value, tasks: [] }))
    g.tasks.push(t)
  }
  const groups = [...map.values()]
  if (by === 'assignee')
    return groups.sort((a, b) => Number(b.value === meId) - Number(a.value === meId) || Number(a.value === null) - Number(b.value === null) || a.label.localeCompare(b.label))
  return groups.sort((a, b) => a.label.localeCompare(b.label))
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done'

/** Short due label ("Today", "Tomorrow", "Fri", "Sep 30", "Mar 2, 2027") and its urgency tone. */
export function describeDue(due: string, today: string, done = false): { label: string; tone: DueTone } {
  const [y, m, d] = due.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const tone: DueTone = done ? 'done' : due < today ? 'overdue' : due === today ? 'today' : due <= addDays(today, 6) ? 'soon' : 'later'
  let label: string
  if (due === today) label = t('task.due.todayShort')
  else if (due === addDays(today, 1)) label = t('task.due.tomorrow')
  else if (due === addDays(today, -1)) label = t('task.due.yesterday')
  else if (due > today && due <= addDays(today, 6)) label = date.toLocaleDateString(locale(), { weekday: 'short' })
  else if (y === Number(today.slice(0, 4))) label = date.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  else label = date.toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' })
  return { label, tone }
}

/** "just now", "5m", "3h", "2d", then a short date. */
export function relativeTime(ms: number, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - ms) / 1000))
  if (s < 45) return t('time.justNow')
  const m = Math.round(s / 60)
  if (m < 60) return t('time.minAgo', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('time.hAgo', { n: h })
  const d = Math.round(h / 24)
  if (d < 7) return t('time.dAgo', { n: d })
  const date = new Date(ms)
  return date.toLocaleDateString(locale(), { month: 'short', day: 'numeric', ...(date.getFullYear() !== new Date(nowMs).getFullYear() && { year: 'numeric' }) })
}
