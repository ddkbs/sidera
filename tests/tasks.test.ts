import { beforeEach, describe, expect, it } from 'vitest'
import { collectTasks, ensureTaskIds, setTaskChecked } from '../src/shared/tasks'
import { markdownToDoc } from '../src/shared/doc'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'

describe('shared/tasks', () => {
  it('collects taskItems depth-first with their own text', () => {
    const doc = markdownToDoc('- [ ] first\n- [x] second\n\nSome paragraph\n\n- [ ] third')
    const tasks = collectTasks(doc)
    expect(tasks.map(({ index, text, checked }) => ({ index, text, checked }))).toEqual([
      { index: 0, text: 'first', checked: false },
      { index: 1, text: 'second', checked: true },
      { index: 2, text: 'third', checked: false }
    ])
  })

  it('assigns a stable, unique id to every taskItem missing one, and is idempotent', () => {
    const doc = markdownToDoc('- [ ] first\n- [x] second')
    const withIds = ensureTaskIds(doc)
    const ids = collectTasks(withIds).map((t) => t.taskId)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(collectTasks(ensureTaskIds(withIds)).map((t) => t.taskId)).toEqual(ids)
  })

  it('sets the checked state of a single task by index without touching others', () => {
    const doc = markdownToDoc('- [ ] a\n- [ ] b\n- [ ] c')
    const next = setTaskChecked(doc, 1, true)
    expect(collectTasks(next).map((t) => t.checked)).toEqual([false, true, false])
  })
})

describe('services: tasks', () => {
  let api: Services
  beforeEach(() => {
    api = createServices(openDatabase(':memory:'))
  })

  it('lists tasks across cards, and filters by status', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] buy milk\n- [x] pay rent' })
    const inbox = api.getInboxCard()
    api.updateCard({ id: inbox.id, content: markdownToDoc('- [ ] call mom') })

    const all = api.listTasks({ status: 'all' })
    expect(all).toHaveLength(3)
    const forCard = all.filter((t) => t.cardId === card.id)
    expect(forCard.map((t) => t.text)).toEqual(['buy milk', 'pay rent'])
    expect(forCard[0].checked).toBe(false)
    expect(forCard[1].checked).toBe(true)

    const inboxTask = all.find((t) => t.cardId === inbox.id)!
    expect(inboxTask.text).toBe('call mom')

    expect(api.listTasks({ status: 'open' })).toHaveLength(2)
    expect(api.listTasks({ status: 'done' })).toHaveLength(1)
  })

  it('assigns stable taskIds on create and keeps them when a card is re-saved with an inserted task', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] a\n- [ ] b' })
    const before = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    expect(before.map((t) => t.taskId).every(Boolean)).toBe(true)
    const [a, b] = before

    // insert a new item at the front and re-save — existing ids must survive
    const withInsert = {
      ...card.content,
      content: [
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }] },
            ...(card.content.content?.[0].content ?? [])
          ]
        }
      ]
    }
    api.updateCard({ id: card.id, content: withInsert })
    const after = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    expect(after).toHaveLength(3)
    expect(after.find((t) => t.text === 'a')!.taskId).toBe(a.taskId)
    expect(after.find((t) => t.text === 'b')!.taskId).toBe(b.taskId)
    expect(after.find((t) => t.text === 'new')!.taskId).toBeTruthy()
  })

  it('flips a single task by card id + index and persists it', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] a\n- [ ] b' })
    api.setTaskChecked(card.id, 1, true)
    const tasks = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    expect(tasks.map((t) => t.checked)).toEqual([false, true])
  })
})

describe('adding tasks', async () => {
  const { appendTask, collectTasks } = await import('../src/shared/tasks')
  const { openDatabase } = await import('../src/main/db/client')
  const { createServices } = await import('../src/main/services')

  it('extends a trailing to-do list or starts a new one', () => {
    const empty = { type: 'doc', content: [{ type: 'paragraph' }] }
    const first = appendTask(empty, 'One')
    expect(first.doc.content).toHaveLength(1)
    expect(first.index).toBe(0)
    const second = appendTask(first.doc, 'Two')
    expect(second.doc.content).toHaveLength(1)
    expect(collectTasks(second.doc).map((t) => t.text)).toEqual(['One', 'Two'])
    const afterText = appendTask({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }] }, 'Three')
    expect(afterText.doc.content?.map((b) => b.type)).toEqual(['paragraph', 'taskList'])
  })

  it('adds to the Inbox card by default, and to a given card otherwise', () => {
    const api = createServices(openDatabase(':memory:'))
    const j = api.addTask({ text: 'Call Anna' })
    const inbox = api.getInboxCard()
    expect(j).toMatchObject({ cardId: inbox.id, cardTitle: 'Inbox', index: 0, checked: false })
    // adding again without a cardId reuses the same Inbox card rather than creating another one
    const j2 = api.addTask({ text: 'Buy milk' })
    expect(j2.cardId).toBe(inbox.id)
    expect(api.listCards().filter((c) => c.title === 'Inbox')).toHaveLength(1)
    const card = api.createCard({ title: 'Launch', markdown: '- [x] Scope' })
    const t = api.addTask({ text: 'Ship it', cardId: card.id })
    expect(t).toMatchObject({ cardId: card.id, index: 1 })
    expect(api.listTasks({ status: 'open' }).map((x) => x.text).sort()).toEqual(['Buy milk', 'Call Anna', 'Ship it'])
    expect(() => api.addTask({ text: '  ' })).toThrow()
  })
})

describe('task metadata', () => {
  let api: Services
  beforeEach(() => {
    api = createServices(openDatabase(':memory:'))
  })
  const find = (taskId: string) => api.listTasks({ status: 'all' }).find((t) => t.taskId === taskId)!

  it('defaults tasks written in a card to todo / no priority / unassigned', () => {
    api.createCard({ title: 'Plan', markdown: '- [ ] a\n- [x] b' })
    const [a, b] = api.listTasks({ status: 'all' })
    expect(a).toMatchObject({ status: 'todo', priority: 'none', assignee: null, dueDate: null, createdBy: null, attachmentCount: 0 })
    expect(b.status).toBe('done')
  })

  it('stores metadata from addTask with the active profile as creator', () => {
    const me = api.getActiveProfile()
    const t = api.addTask({ text: 'Ship', priority: 'high', assigneeId: me.id, dueDate: '2026-01-02', status: 'in_progress' })
    expect(t).toMatchObject({ status: 'in_progress', priority: 'high', dueDate: '2026-01-02', checked: false })
    expect(t.assignee?.id).toBe(me.id)
    expect(t.createdBy?.id).toBe(me.id)
    expect(api.listTaskActivity(t.cardId, t.taskId).map((a) => a.kind)).toEqual(['created'])
    expect(() => api.addTask({ text: 'x', dueDate: 'tomorrow' })).toThrow()
    expect(() => api.addTask({ text: 'x', assigneeId: 'missing' })).toThrow()
  })

  it('keeps status done in sync with the checkbox, both directions', () => {
    const t = api.addTask({ text: 'Ship', status: 'in_progress' })
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, status: 'done' })
    expect(find(t.taskId)).toMatchObject({ status: 'done', checked: true })
    expect(collectTasks(api.getCard(t.cardId)!.content)[t.index].checked).toBe(true)

    // unticking the checkbox in the card reopens the task
    api.setTaskChecked(t.cardId, t.index, false)
    expect(find(t.taskId)).toMatchObject({ status: 'todo', checked: false })

    // ticking it in the card completes it
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, status: 'in_progress' })
    api.setTaskChecked(t.cardId, t.index, true)
    expect(find(t.taskId).status).toBe('done')

    // moving a done task back to in_progress unticks it
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, status: 'in_progress' })
    expect(find(t.taskId)).toMatchObject({ status: 'in_progress', checked: false })
  })

  it('logs one activity entry per change, including checkbox flips made in the card', () => {
    const me = api.getActiveProfile()
    const t = api.addTask({ text: 'Ship' })
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, status: 'done', priority: 'urgent', assigneeId: me.id, dueDate: '2026-03-01' })
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, priority: 'urgent' }) // no-op
    api.setTaskChecked(t.cardId, t.index, false)
    api.updateTask({ cardId: t.cardId, taskId: t.taskId, text: 'Ship it  now' })
    const log = api.listTaskActivity(t.cardId, t.taskId)
    expect(log.map((a) => [a.kind, a.from, a.to])).toEqual([
      ['created', null, null],
      ['status', 'todo', 'done'],
      ['priority', 'none', 'urgent'],
      ['assignee', null, me.id],
      ['due', null, '2026-03-01'],
      ['status', 'done', 'todo'],
      ['title', 'Ship', 'Ship it now']
    ])
    expect(log.every((a) => a.actor?.id === me.id)).toBe(true)
    expect(find(t.taskId).text).toBe('Ship it now')
  })

  it('edits task text without touching nested sub-tasks', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] parent\n  - [ ] child' })
    const [parent, child] = api.listTasks({ status: 'all' })
    api.updateTask({ cardId: card.id, taskId: parent.taskId, text: 'renamed' })
    const after = api.listTasks({ status: 'all' })
    expect(after.map((t) => [t.taskId, t.text])).toEqual([
      [parent.taskId, 'renamed'],
      [child.taskId, 'child']
    ])
  })

  it('filters by status, assignee, priority and due date', () => {
    const me = api.getActiveProfile()
    const other = api.createProfile({ name: 'Ada' })
    api.addTask({ text: 'overdue', dueDate: '2026-09-10', assigneeId: me.id, priority: 'high' })
    api.addTask({ text: 'today', dueDate: '2026-09-17', assigneeId: other.id })
    api.addTask({ text: 'week', dueDate: '2026-09-23', status: 'in_progress' })
    api.addTask({ text: 'later', dueDate: '2026-10-30' })
    api.addTask({ text: 'done late', dueDate: '2026-09-01', status: 'done' })
    const texts = (opts: Parameters<Services['listTasks']>[0]) =>
      api
        .listTasks({ today: '2026-09-17', ...opts })
        .map((t) => t.text)
        .sort()
    expect(texts({ due: 'overdue' })).toEqual(['overdue'])
    expect(texts({ due: 'today' })).toEqual(['today'])
    expect(texts({ due: 'week' })).toEqual(['today', 'week'])
    expect(texts({ status: 'open' })).toEqual(['later', 'overdue', 'today', 'week'])
    expect(texts({ status: 'in_progress' })).toEqual(['week'])
    expect(texts({ assigneeId: me.id })).toEqual(['overdue'])
    expect(texts({ assigneeId: null, status: 'open' })).toEqual(['later', 'week'])
    expect(texts({ priority: 'high' })).toEqual(['overdue'])
  })

  it('unassigns tasks when the assignee profile is deleted', () => {
    const other = api.createProfile({ name: 'Ada' })
    const t = api.addTask({ text: 'x', assigneeId: other.id })
    api.deleteProfile(other.id)
    expect(find(t.taskId).assignee).toBeNull()
  })

  it('counts attachments and only lets authors edit or delete their comments', () => {
    const t = api.addTask({ text: 'x' })
    const file = api.registerFile({ name: 'a.png', mime: 'image/png', path: '/tmp/a.png', size: 1 })
    const c = api.addTaskComment({ cardId: t.cardId, taskId: t.taskId, body: 'mine', fileIds: [file.id] })
    expect(find(t.taskId)).toMatchObject({ commentCount: 1, attachmentCount: 1 })
    const other = api.createProfile({ name: 'Ada' })
    api.setActiveProfile(other.id)
    expect(() => api.updateTaskComment({ id: c.id, body: 'hijack' })).toThrow(/own comments/)
    expect(() => api.deleteTaskComment(c.id)).toThrow(/own comments/)
  })
})
