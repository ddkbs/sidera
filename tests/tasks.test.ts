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
