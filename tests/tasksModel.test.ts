import { describe, expect, it } from 'vitest'
import { describeDue, EMPTY_FILTERS, filterTasks, groupTasks, nextStatus, relativeTime, sortTasks } from '../src/renderer/src/features/tasks/model'
import type { Task } from '../src/shared/types'

const me = { id: 'me', name: 'ddkbs', color: 'blue', avatarUrl: null }
const ada = { id: 'ada', name: 'Ada', color: 'pink', avatarUrl: null }
let n = 0
const task = (p: Partial<Task>): Task => ({
  cardId: 'c1',
  cardTitle: 'Launch',
  cardIcon: null,
  cardColor: null,
  taskId: `t${n++}`,
  index: n,
  text: 'task',
  checked: false,
  status: 'todo',
  priority: 'none',
  assignee: null,
  dueDate: null,
  createdBy: null,
  createdAt: n,
  updatedAt: 0,
  commentCount: 0,
  attachmentCount: 0,
  ...p
})

describe('tasks view model', () => {
  const tasks = [
    task({ text: 'Write copy', priority: 'low', assignee: me, dueDate: '2026-09-10' }),
    task({ text: 'Fix login', priority: 'urgent', status: 'in_progress', assignee: ada }),
    task({ text: 'Plan offsite', cardId: 'c2', cardTitle: 'Team', dueDate: '2026-09-18', status: 'done', checked: true }),
    task({ text: 'Design review', priority: 'high', dueDate: '2026-09-17' })
  ]
  const today = '2026-09-17'

  it('filters by status, assignee (me / none), priority, due and search', () => {
    const texts = (f: Partial<typeof EMPTY_FILTERS>) => filterTasks(tasks, { ...EMPTY_FILTERS, ...f }, 'me', today).map((t) => t.text)
    expect(texts({ statuses: ['in_progress', 'done'] })).toEqual(['Fix login', 'Plan offsite'])
    expect(texts({ assignee: 'me' })).toEqual(['Write copy'])
    expect(texts({ assignee: 'none' })).toEqual(['Plan offsite', 'Design review'])
    expect(texts({ priorities: ['urgent', 'high'] })).toEqual(['Fix login', 'Design review'])
    expect(texts({ due: 'overdue' })).toEqual(['Write copy'])
    expect(texts({ due: 'week' })).toEqual(['Plan offsite', 'Design review'])
    expect(texts({ query: 'team' })).toEqual(['Plan offsite'])
  })

  it('sorts by priority, then due date', () => {
    expect(sortTasks(tasks).map((t) => t.text)).toEqual(['Fix login', 'Design review', 'Write copy', 'Plan offsite'])
  })

  it('groups by status in workflow order and by assignee with me first', () => {
    expect(groupTasks(tasks, 'status').map((g) => [g.label, g.tasks.length])).toEqual([
      ['In Progress', 1],
      ['Todo', 2],
      ['Done', 1]
    ])
    expect(groupTasks(tasks, 'assignee', 'me').map((g) => g.label)).toEqual(['ddkbs', 'Ada', 'Unassigned'])
    expect(groupTasks(tasks, 'card').map((g) => g.label)).toEqual(['Launch', 'Team'])
  })

  it('cycles status and describes due dates', () => {
    expect([nextStatus('todo'), nextStatus('in_progress'), nextStatus('done')]).toEqual(['in_progress', 'done', 'todo'])
    expect(describeDue('2026-09-17', today)).toEqual({ label: 'Today', tone: 'today' })
    expect(describeDue('2026-09-18', today)).toEqual({ label: 'Tomorrow', tone: 'soon' })
    expect(describeDue('2026-09-01', today).tone).toBe('overdue')
    expect(describeDue('2026-09-01', today, true).tone).toBe('done')
    expect(describeDue('2027-01-05', today).label).toBe('Jan 5, 2027')
  })

  it('formats relative times', () => {
    const now = new Date(2026, 8, 17, 12).getTime()
    expect(relativeTime(now - 10_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeTime(now - 30 * 86_400_000, now)).toBe('Aug 18')
  })
})
