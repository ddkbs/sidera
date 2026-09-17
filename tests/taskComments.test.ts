import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'

let api: Services
beforeEach(() => {
  api = createServices(openDatabase(':memory:'))
})

describe('task comments', () => {
  it('adds, lists and deletes comments, with files attached', () => {
    const card = api.createCard({ title: 'Launch', markdown: '- [ ] ship it' })
    const [task] = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    expect(task.commentCount).toBe(0)

    const file = api.registerFile({ name: 'shot.png', mime: 'image/png', path: '/tmp/shot.png', size: 1234 })
    const c1 = api.addTaskComment({ cardId: card.id, taskId: task.taskId, body: 'Looks good', fileIds: [file.id] })
    expect(c1.body).toBe('Looks good')
    expect(c1.files).toEqual([file])

    const c2 = api.addTaskComment({ cardId: card.id, taskId: task.taskId, body: 'One more thing' })
    expect(c2.files).toEqual([])

    const list = api.listTaskComments(card.id, task.taskId)
    expect(list.map((c) => c.id)).toEqual([c1.id, c2.id])

    const afterCount = api.listTasks({ status: 'all' }).find((t) => t.taskId === task.taskId)!
    expect(afterCount.commentCount).toBe(2)

    const updated = api.updateTaskComment({ id: c1.id, body: 'Edited' })
    expect(updated.body).toBe('Edited')
    expect(api.listTaskComments(card.id, task.taskId).find((c) => c.id === c1.id)!.body).toBe('Edited')

    api.deleteTaskComment(c1.id)
    const afterDelete = api.listTaskComments(card.id, task.taskId)
    expect(afterDelete.map((c) => c.id)).toEqual([c2.id])
    expect(api.listTasks({ status: 'all' }).find((t) => t.taskId === task.taskId)!.commentCount).toBe(1)
  })

  it('keeps comments scoped to their exact task id, not just the card', () => {
    const card = api.createCard({ title: 'Plan', markdown: '- [ ] a\n- [ ] b' })
    const [a, b] = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    api.addTaskComment({ cardId: card.id, taskId: a.taskId, body: 'on a' })
    expect(api.listTaskComments(card.id, a.taskId)).toHaveLength(1)
    expect(api.listTaskComments(card.id, b.taskId)).toHaveLength(0)
  })

  it('keeps comments through soft delete, cascades when the card is purged', () => {
    const card = api.createCard({ title: 'Temp', markdown: '- [ ] a' })
    const [task] = api.listTasks({ status: 'all' }).filter((t) => t.cardId === card.id)
    const file = api.registerFile({ name: 'a.png', mime: 'image/png', path: '/tmp/a.png', size: 10 })
    const comment = api.addTaskComment({ cardId: card.id, taskId: task.taskId, body: 'hi', fileIds: [file.id] })

    api.deleteCard(card.id)
    api.restoreCard(card.id)
    expect(api.listTaskComments(card.id, task.taskId)).toHaveLength(1)

    api.deleteCard(card.id)
    api.purgeDeleted(-1)

    expect(api.listTaskComments(card.id, task.taskId)).toEqual([])
    // the underlying row is gone too (not just filtered by a now-missing card)
    expect(() => api.updateTaskComment({ id: comment.id, body: 'x' })).toThrow()
  })
})
