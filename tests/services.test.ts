import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { createServices, type Services } from '../src/main/services'
import { MENTION_NODE } from '@shared/doc'

let api: Services
beforeEach(() => {
  api = createServices(openDatabase(':memory:'))
})

describe('cards', () => {
  it('creates from markdown and finds via FTS', () => {
    const c = api.createCard({ title: 'Quantum notes', markdown: '# Intro\nEntanglement is **spooky**' })
    expect(c.contentText).toContain('Entanglement is spooky')
    const hits = api.search('entangle')
    expect(hits.map((h) => h.id)).toContain(c.id)
    api.updateCard({ id: c.id, title: 'Physics' })
    expect(api.search('physics')[0].id).toBe(c.id)
    api.deleteCard(c.id)
    expect(api.search('entangle')).toHaveLength(0)
  })

  it('tracks backlinks from mentions', () => {
    const a = api.createCard({ title: 'A' })
    const b = api.createCard({
      title: 'B',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: MENTION_NODE, attrs: { id: a.id, label: 'A' } }] }] }
    })
    expect(api.getCard(a.id)!.backlinks).toEqual([{ cardId: b.id, title: 'B' }])
  })
})

describe('tags & kanban', () => {
  it('moves items between columns with ordering', () => {
    const tag = api.createTag({ name: '#Project' })
    expect(api.createTag({ name: 'project' }).id).toBe(tag.id)
    const c1 = api.createCard({ title: 'one', tagIds: [tag.id] })
    const c2 = api.createCard({ title: 'two', tagIds: [tag.id] })
    let board = api.getKanban(tag.id)!
    expect(board.columns).toHaveLength(4)
    expect(board.columns[0].cards).toHaveLength(2)
    const done = board.property.options[2]
    api.moveKanbanItem({ cardId: c1.id, propertyId: board.property.id, optionId: done.id, index: 0 })
    api.moveKanbanItem({ cardId: c2.id, propertyId: board.property.id, optionId: done.id, index: 0 })
    board = api.getKanban(tag.id)!
    expect(board.columns[3].cards.map((c) => c.title)).toEqual(['two', 'one'])
    expect(board.columns[0].cards).toHaveLength(0)
  })
})

describe('whiteboards', () => {
  it('nests boards, places cards and connects them', () => {
    const root = api.createWhiteboard({ name: 'Root' })
    const child = api.createWhiteboard({ name: 'Child', parentId: root.id })
    const card = api.createCard({ title: 'Idea' })
    const o1 = api.addObject({ whiteboardId: child.id, kind: 'card', refId: card.id, x: 0, y: 0 })
    const o2 = api.addObject({ whiteboardId: child.id, kind: 'text', x: 400, y: 0, data: { text: 'hi' } })
    api.addConnection({ whiteboardId: child.id, sourceId: o1.id, targetId: o2.id })
    const detail = api.getWhiteboard(child.id)!
    expect(detail.breadcrumb.map((b) => b.name)).toEqual(['Root', 'Child'])
    expect(detail.cards[card.id].title).toBe('Idea')
    expect(detail.connections).toHaveLength(1)
    expect(api.getWhiteboard(root.id)!.children.map((c) => c.id)).toEqual([child.id])
    api.removeObjects([o1.id])
    expect(api.getWhiteboard(child.id)!.connections).toHaveLength(0)
    expect(api.getCard(card.id)!.whiteboards).toHaveLength(0)
  })
})

describe('journal', () => {
  it('creates one card per day, idempotently', () => {
    const d1 = api.getJournal('2026-09-16')
    const d2 = api.getJournal('2026-09-16')
    expect(d1.card.id).toBe(d2.card.id)
    expect(api.listJournal()).toHaveLength(1)
    expect(api.listCards()).toHaveLength(0)
  })
})
