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

  it('stores card colour and icon and returns them in summaries', () => {
    const c = api.createCard({ title: 'Styled' })
    expect(c.color).toBeNull()
    api.updateCard({ id: c.id, color: 'blue', icon: '🚀' })
    expect(api.getCard(c.id)).toMatchObject({ color: 'blue', icon: '🚀' })
    expect(api.listCards()[0]).toMatchObject({ color: 'blue', icon: '🚀' })
    api.updateCard({ id: c.id, icon: null })
    expect(api.getCard(c.id)!.icon).toBeNull()
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

describe('soft delete & restore', () => {
  it('hides deleted cards and whiteboards everywhere and restores them', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    const child = api.createWhiteboard({ name: 'Child', parentId: wb.id })
    const card = api.createCard({ title: 'Doomed', markdown: '- [ ] task' })
    const o1 = api.addObject({ whiteboardId: wb.id, kind: 'card', refId: card.id, x: 0, y: 0 })
    const o2 = api.addObject({ whiteboardId: wb.id, kind: 'whiteboard', refId: child.id, x: 400, y: 0 })
    api.addConnection({ whiteboardId: wb.id, sourceId: o1.id, targetId: o2.id })

    api.deleteCard(card.id)
    expect(api.getCard(card.id)).toBeNull()
    expect(api.search('Doomed')).toHaveLength(0)
    expect(api.listTasks()).toHaveLength(0)
    let board = api.getWhiteboard(wb.id)!
    expect(board.objects.map((o) => o.id)).toEqual([o2.id])
    expect(board.connections).toHaveLength(0)

    api.restoreCard(card.id)
    board = api.getWhiteboard(wb.id)!
    expect(board.objects).toHaveLength(2)
    expect(board.connections).toHaveLength(1)

    api.deleteWhiteboard(child.id)
    expect(api.listWhiteboards().map((w) => w.name)).toEqual(['Board'])
    expect(api.getWhiteboard(wb.id)!.objects.map((o) => o.id)).toEqual([o1.id])
    api.restoreWhiteboard(child.id)
    expect(api.listWhiteboards()).toHaveLength(2)

    api.deleteCard(card.id)
    api.purgeDeleted(-1)
    api.restoreCard(card.id)
    expect(api.getCard(card.id)).toBeNull()
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
    const prio = api.createProperty({ tagId: tag.id, name: 'Priority', type: 'number' })
    api.setPropertyValue(c1.id, prio.id, 3)
    const listed = api.listCards({ tagId: tag.id })
    expect(listed.find((c) => c.id === c1.id)!.values).toMatchObject({ [prio.id]: 3, [board.property.id]: done.id })
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
    const snapshot = api.getWhiteboard(child.id)!
    api.removeObjects([o1.id])
    expect(api.getWhiteboard(child.id)!.connections).toHaveLength(0)
    api.restoreObjects(snapshot.objects.filter((o) => o.id === o1.id), snapshot.connections)
    expect(api.getWhiteboard(child.id)!.connections).toHaveLength(1)
    api.removeObjects([o1.id])
    expect(api.getCard(card.id)!.whiteboards).toHaveLength(0)
  })

  it('duplicates a whiteboard with its objects and connections, remapping ids', () => {
    const board = api.createWhiteboard({ name: 'Plan' })
    const a = api.addObject({ whiteboardId: board.id, kind: 'text', x: 0, y: 0, data: { text: 'a' } })
    const b = api.addObject({ whiteboardId: board.id, kind: 'text', x: 100, y: 0, data: { text: 'b' } })
    api.addConnection({ whiteboardId: board.id, sourceId: a.id, targetId: b.id })

    const copy = api.duplicateWhiteboard(board.id)
    expect(copy.id).not.toBe(board.id)
    expect(copy.name).toBe('Plan copy')

    const detail = api.getWhiteboard(copy.id)!
    expect(detail.objects).toHaveLength(2)
    expect(detail.connections).toHaveLength(1)
    expect(detail.objects.map((o) => o.id)).not.toContain(a.id)
    expect(detail.objects.map((o) => o.id)).not.toContain(b.id)
    // original is untouched
    expect(api.getWhiteboard(board.id)!.objects).toHaveLength(2)
  })
})

describe('inbox', () => {
  it('finds or creates a single "Inbox" card, idempotently', () => {
    const c1 = api.getInboxCard()
    const c2 = api.getInboxCard()
    expect(c1.id).toBe(c2.id)
    expect(c1.title).toBe('Inbox')
    expect(api.listCards()).toHaveLength(1)
  })
})

describe('migrations', () => {
  it('a former journal card survives the journal_entries drop and shows up in listCards', async () => {
    const Database = (await import('better-sqlite3')).default
    const { drizzle } = await import('drizzle-orm/better-sqlite3')
    const { migrations } = await import('../src/main/db/migrations')
    const schema = await import('../src/main/db/schema')

    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    // Apply migrations up through "task comments" (index 3, the last one before the journal removal),
    // while journal_entries still exists, and seed a journal day the old way.
    for (let i = 0; i <= 3; i++) sqlite.exec(migrations[i])
    const t = Date.now()
    sqlite.prepare(`INSERT INTO cards (id, title, content, content_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run('c1', '2026-09-16', '{"type":"doc","content":[]}', '', t, t)
    sqlite.prepare(`INSERT INTO journal_entries (date, card_id) VALUES (?, ?)`).run('2026-09-16', 'c1')

    // Now run the remaining migrations, including the journal_entries drop.
    for (let i = 4; i < migrations.length; i++) {
      if (migrations[i].trim()) sqlite.exec(migrations[i])
    }
    sqlite.pragma(`user_version = ${migrations.length}`)

    const db = drizzle(sqlite, { schema })
    const migrated = createServices(db as unknown as Parameters<typeof createServices>[0])
    expect(migrated.listCards().map((c) => c.id)).toContain('c1')
  })
})

describe('markdown export/import', () => {
  it('round-trips cards with tags', async () => {
    const { exportCards, importCards } = await import('../src/main/services/markdown')
    const tag = api.createTag({ name: 'Ideas' })
    api.createCard({ title: 'A/B test', markdown: '- one\n- two', tagIds: [tag.id] })
    const files = exportCards(api)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('A-B test.md')
    expect(files[0].content).toContain('tags: ["Ideas"]')
    const fresh = createServices(openDatabase(':memory:'))
    expect(importCards(fresh, files)).toBe(1)
    const [card] = fresh.listCards()
    expect(card.title).toBe('A/B test')
    expect(card.tags.map((t) => t.name)).toEqual(['Ideas'])
    expect(importCards(fresh, [{ name: 'x.md', content: '# Heading title\nBody' }])).toBe(1)
    expect(fresh.search('Heading')[0].title).toBe('Heading title')
  })
})

describe('seed', () => {
  it('seeds a welcome board only into an empty database', async () => {
    const { seedWelcome } = await import('../src/main/services/seed')
    expect(seedWelcome(api)).toBe(true)
    expect(seedWelcome(api)).toBe(false)
    const [board] = api.listWhiteboards()
    const detail = api.getWhiteboard(board.id)!
    expect(detail.objects.length).toBeGreaterThan(5)
    expect(detail.connections).toHaveLength(2)
  })
})
