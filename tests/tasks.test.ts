import { beforeEach, describe, expect, it } from 'vitest'
import { collectTasks, setTaskChecked } from '../src/shared/tasks'
import { markdownToDoc } from '../src/shared/doc'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'
import { todayISO } from '../src/shared/util'

describe('shared/tasks', () => {
  it('collects taskItems depth-first with their own text', () => {
    const doc = markdownToDoc('- [ ] first\n- [x] second\n\nSome paragraph\n\n- [ ] third')
    const tasks = collectTasks(doc)
    expect(tasks).toEqual([
      { index: 0, text: 'first', checked: false },
      { index: 1, text: 'second', checked: true },
      { index: 2, text: 'third', checked: false }
    ])
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

  it('lists tasks across cards and journal days, and filters by status', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] buy milk\n- [x] pay rent' })
    const date = todayISO()
    const day = api.getJournal(date)
    api.updateCard({ id: day.card.id, content: markdownToDoc('- [ ] call mom') })

    const all = api.listTasks({ status: 'all' })
    expect(all).toHaveLength(3)
    const forCard = all.filter((t) => t.cardId === card.id)
    expect(forCard.map((t) => t.text)).toEqual(['buy milk', 'pay rent'])
    expect(forCard[0].checked).toBe(false)
    expect(forCard[1].checked).toBe(true)

    const journalTask = all.find((t) => t.cardId === day.card.id)!
    expect(journalTask.isJournal).toBe(true)
    expect(journalTask.journalDate).toBe(date)

    expect(api.listTasks({ status: 'open' })).toHaveLength(2)
    expect(api.listTasks({ status: 'done' })).toHaveLength(1)
  })

  it('flips a single task by card id + index and persists it', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] a\n- [ ] b' })
    api.setTaskChecked(card.id, 1, true)
    const tasks = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    expect(tasks.map((t) => t.checked)).toEqual([false, true])
  })
})
