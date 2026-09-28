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

describe('connections', () => {
  it('stores styling and keeps it through a restore', () => {
    const wb = api.createWhiteboard({ name: 'Board' })
    const a = api.addObject({ whiteboardId: wb.id, kind: 'text', x: 0, y: 0 })
    const b = api.addObject({ whiteboardId: wb.id, kind: 'text', x: 300, y: 0 })
    const conn = api.addConnection({ whiteboardId: wb.id, sourceId: a.id, targetId: b.id })
    expect(conn).toMatchObject({ label: '', color: null, lineStyle: 'solid', arrows: 'end' })

    api.updateConnection({ id: conn.id, label: 'depends on', color: 'red', lineStyle: 'dashed', arrows: 'both' })
    const styled = api.getWhiteboard(wb.id)!.connections[0]
    expect(styled).toMatchObject({ label: 'depends on', color: 'red', lineStyle: 'dashed', arrows: 'both' })

    // A partial patch leaves the other fields alone.
    api.updateConnection({ id: conn.id, color: null })
    expect(api.getWhiteboard(wb.id)!.connections[0]).toMatchObject({ color: null, lineStyle: 'dashed', arrows: 'both' })

    api.removeConnections([conn.id])
    expect(api.getWhiteboard(wb.id)!.connections).toHaveLength(0)
    api.restoreObjects([], [styled])
    expect(api.getWhiteboard(wb.id)!.connections[0]).toMatchObject({ color: 'red', lineStyle: 'dashed', arrows: 'both' })
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

  it('lists boards with an object count, for Home tiles', () => {
    const empty = api.createWhiteboard({ name: 'Empty' })
    const busy = api.createWhiteboard({ name: 'Busy' })
    api.addObject({ whiteboardId: busy.id, kind: 'text', x: 0, y: 0, data: { text: 'a' } })
    api.addObject({ whiteboardId: busy.id, kind: 'text', x: 100, y: 0, data: { text: 'b' } })

    const stats = api.listWhiteboardsWithStats()
    expect(stats.find((b) => b.id === empty.id)).toMatchObject({ objectCount: 0 })
    expect(stats.find((b) => b.id === busy.id)).toMatchObject({ objectCount: 2 })
  })

  it('builds small Home-tile previews from object geometry (no content)', () => {
    const board = api.createWhiteboard({ name: 'Preview' })
    const empty = api.createWhiteboard({ name: 'Empty' })
    const w = board.id
    api.addObject({ whiteboardId: w, kind: 'section', x: -20, y: -20, width: 800, height: 500, color: 'blue', data: { title: 'Research' } })
    api.addObject({ whiteboardId: w, kind: 'text', x: 0, y: 0, width: 300, height: 50, data: { text: 'Heading\nsecond line' } })
    const { card: blockCard } = api.addTextBlock({ whiteboardId: w, x: 0, y: 80, markdown: 'A secret note body', style: 'framed' })
    const card = api.createCard({ title: 'Launch goals', markdown: 'long private body' })
    api.addObject({ whiteboardId: w, kind: 'card', refId: card.id, x: 400, y: 0 })
    const gone = api.createCard({ title: 'Deleted' })
    api.addObject({ whiteboardId: w, kind: 'card', refId: gone.id, x: 900, y: 0 })
    api.deleteCard(gone.id)
    api.addObject({ whiteboardId: w, kind: 'chart', x: 0, y: 300, data: { chartType: 'timeline', title: 'History', columns: [], rows: [], options: {} } })
    api.addObject({
      whiteboardId: w,
      kind: 'sketch',
      x: 100,
      y: 100,
      width: 50,
      height: 10,
      data: { frameless: true, files: {}, elements: [{ type: 'freedraw', x: 0, y: 0, points: Array.from({ length: 100 }, (_, i) => [i, i % 2]), strokeColor: '#e03131' }] }
    })

    const [p, e] = api.getBoardPreviews([w, empty.id])
    expect(e).toEqual({ id: empty.id, bounds: null, items: [] })
    expect(p.id).toBe(w)
    expect(p.items[0]).toMatchObject({ kind: 'section', label: 'Research', color: 'blue' })
    expect(p.items.map((i) => i.kind).sort()).toEqual(['block', 'card', 'chart', 'ink', 'section', 'text'])
    expect(p.items.find((i) => i.kind === 'text')!.label).toBe('Heading')
    expect(p.items.find((i) => i.kind === 'block')).toMatchObject({ framed: true })
    expect(p.items.find((i) => i.kind === 'card')!.label).toBe('Launch goals')
    expect(p.items.find((i) => i.kind === 'chart')!.chartType).toBe('timeline')
    const ink = p.items.find((i) => i.kind === 'ink')!
    expect(ink.strokes![0].color).toBe('#e03131')
    expect(ink.strokes![0].points.length).toBeLessThanOrEqual(24)
    // ink fitted into the object's box
    for (const [x, y] of ink.strokes![0].points) {
      expect(x).toBeGreaterThanOrEqual(100)
      expect(x).toBeLessThanOrEqual(150)
      expect(y).toBeGreaterThanOrEqual(100)
      expect(y).toBeLessThanOrEqual(110)
    }
    expect(p.bounds).toMatchObject({ x: -20, y: -20 })
    // never ships content
    const json = JSON.stringify(p)
    expect(json).not.toContain('secret')
    expect(json).not.toContain('private')
    expect(blockCard.kind).toBe('block')
  })

  it('stores free-form key/value properties on a whiteboard', () => {
    const board = api.createWhiteboard({ name: 'Notes' })
    expect(board.properties).toEqual([])

    const properties = [
      { id: 'p1', key: 'Autor', value: 'Jane Doe' },
      { id: 'p2', key: 'Datum', value: '2026-09-23' }
    ]
    const updated = api.updateWhiteboardProperties(board.id, properties)
    expect(updated.properties).toEqual(properties)

    // persists across reads
    expect(api.getWhiteboard(board.id)!.whiteboard.properties).toEqual(properties)
    expect(api.listWhiteboards().find((w) => w.id === board.id)!.properties).toEqual(properties)
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

describe('pdf highlights', () => {
  const file = () => api.registerFile({ name: 'paper.pdf', mime: 'application/pdf', path: '/tmp/paper.pdf', size: 1234 })

  it('stores highlights per file and returns them in page order', () => {
    const f = file()
    const second = api.createHighlight({ fileId: f.id, page: 2, text: 'second', rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.04 }] })
    const lower = api.createHighlight({ fileId: f.id, page: 1, text: 'lower', rects: [{ x: 0.1, y: 0.8, w: 0.2, h: 0.04 }], color: 'green' })
    const upper = api.createHighlight({ fileId: f.id, page: 1, text: 'upper', rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.04 }] })

    expect(upper.color).toBe('yellow')
    expect(lower.color).toBe('green')
    expect(upper.rects).toEqual([{ x: 0.1, y: 0.1, w: 0.2, h: 0.04 }])
    expect(api.listHighlights(f.id).map((h) => h.id)).toEqual([upper.id, lower.id, second.id])

    // a second file keeps its own list
    const other = file()
    api.createHighlight({ fileId: other.id, page: 1, text: 'elsewhere', rects: [] })
    expect(api.listHighlights(f.id)).toHaveLength(3)
    expect(api.listHighlights(other.id)).toHaveLength(1)
  })

  it('updates colour and note and deletes', () => {
    const f = file()
    const h = api.createHighlight({ fileId: f.id, page: 1, text: 'quote', rects: [] })
    expect(h.note).toBeNull()
    const patched = api.updateHighlight({ id: h.id, color: 'pink', note: 'check this' })
    expect(patched).toMatchObject({ color: 'pink', note: 'check this', text: 'quote' })
    expect(api.listHighlights(f.id)[0]).toMatchObject({ color: 'pink', note: 'check this' })
    // note only, colour stays
    expect(api.updateHighlight({ id: h.id, note: null })).toMatchObject({ color: 'pink', note: null })
    api.deleteHighlight(h.id)
    expect(api.listHighlights(f.id)).toEqual([])
  })

  it('rejects highlights for unknown files', () => {
    expect(() => api.createHighlight({ fileId: 'nope', page: 1, text: 'x', rects: [] })).toThrow(/File not found/)
    expect(() => api.updateHighlight({ id: 'nope', color: 'red' })).toThrow(/Highlight not found/)
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
    const kinds = detail.objects.map((o) => o.kind)
    expect(kinds).toEqual(expect.arrayContaining(['text', 'card', 'table', 'chart', 'sketch']))
    // the chart follows the table
    const table = detail.objects.find((o) => o.kind === 'table')!
    expect(detail.objects.find((o) => o.kind === 'chart')!.data.source).toEqual({ tableId: table.id })
    // pen ink is frameless, like pen mode's
    const ink = detail.objects.filter((o) => o.kind === 'sketch')
    expect(ink.length).toBeGreaterThan(0)
    for (const o of ink) {
      expect(o.data.frameless).toBe(true)
      expect((o.data.elements as { type: string }[]).every((e) => e.type === 'freedraw')).toBe(true)
    }
    // the basics are text blocks (cards of kind 'block'), not library cards
    expect(api.listCards()).toHaveLength(0)
    expect(api.listCards({ kind: 'block' }).length).toBeGreaterThanOrEqual(4)
  })
})

describe('text blocks', () => {
  it('creates a block card on a board, titled by its first line and hidden from the library', () => {
    const wb = api.createWhiteboard({ name: 'Tech Startups' })
    const { card, object } = api.addTextBlock({ whiteboardId: wb.id, x: 10, y: 20, markdown: '# SpaceX\nFounded: 2002 · HQ: Hawthorne', style: 'framed' })
    expect(card).toMatchObject({ kind: 'block', title: 'SpaceX' })
    expect(object).toMatchObject({ kind: 'card', refId: card.id, x: 10, y: 20, data: { style: 'framed' } })
    const regular = api.createCard({ title: 'Regular' })
    expect(api.listCards().map((c) => c.id)).toEqual([regular.id])
    expect(api.listCards({ kind: 'all' }).map((c) => c.id).sort()).toEqual([card.id, regular.id].sort())
    expect(api.listCards({ kind: 'block' })[0]).toMatchObject({ id: card.id, kind: 'block' })
    // search still finds blocks (and says what they are); empty query = recent regular cards only
    expect(api.search('Hawthorne')[0]).toMatchObject({ id: card.id, cardKind: 'block' })
    expect(api.search('Hawthorne', 20, { kind: 'card' })).toHaveLength(0)
    expect(api.search('').map((h) => h.id)).toEqual([regular.id])
    expect(api.getWhiteboard(wb.id)!.cards[card.id].kind).toBe('block')
  })

  it('keeps the title in sync with the first line and promotes a block to a card', () => {
    const wb = api.createWhiteboard({ name: 'B' })
    const { card } = api.addTextBlock({ whiteboardId: wb.id, x: 0, y: 0 })
    expect(card.title).toBe('')
    api.updateCard({ id: card.id, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Idee: more tests' }] }] } })
    expect(api.getCard(card.id)!.title).toBe('Idee: more tests')
    api.updateCard({ id: card.id, kind: 'card' })
    expect(api.getCard(card.id)!.kind).toBe('card')
    expect(api.listCards().map((c) => c.id)).toContain(card.id)
    // a regular card keeps its own title when content changes
    api.updateCard({ id: card.id, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Changed' }] }] } })
    expect(api.getCard(card.id)!.title).toBe('Idee: more tests')
  })

  it('refuses unknown boards', () => {
    expect(() => api.addTextBlock({ whiteboardId: 'nope', x: 0, y: 0 })).toThrow(/Whiteboard not found/)
  })
})

describe('tables', () => {
  const revenue = () => ({
    title: 'Revenue',
    columns: [
      { id: 'y', name: 'Year' },
      { id: 'r', name: 'Revenue', type: 'number' as const }
    ],
    rows: [
      { id: 'a', cells: { y: '2022', r: '4,600' } as Record<string, string | number> },
      { id: 'b', cells: { y: '2023', r: 8700 } as Record<string, string | number> }
    ]
  })

  it('validates table data and stores numbers as numbers', () => {
    const wb = api.createWhiteboard({ name: 'T' })
    const t = api.addObject({ whiteboardId: wb.id, kind: 'table', x: 0, y: 0, data: revenue() })
    expect(t.data.rows).toEqual([
      { id: 'a', cells: { y: '2022', r: 4600 } },
      { id: 'b', cells: { y: '2023', r: 8700 } }
    ])
    expect(() => api.addObject({ whiteboardId: wb.id, kind: 'table', x: 0, y: 0, data: { rows: [] } })).toThrow(/columns/)
    const tooMany = { columns: [{ id: 'c', name: 'C' }], rows: Array.from({ length: 1001 }, (_, i) => ({ id: String(i), cells: {} })) }
    expect(() => api.addObject({ whiteboardId: wb.id, kind: 'table', x: 0, y: 0, data: tooMany })).toThrow(/Too many rows/)
  })

  it('creates a linked chart that follows table edits until unlinked', () => {
    const changes: string[] = []
    const svc = createServices(openDatabase(':memory:'), (s) => changes.push(s))
    const wb = svc.createWhiteboard({ name: 'T' })
    const t = svc.addObject({ whiteboardId: wb.id, kind: 'table', x: 0, y: 0, width: 400, data: revenue() })
    const chart = svc.chartFromTable({ tableId: t.id })
    expect(chart).toMatchObject({ kind: 'chart', x: 460, y: 0 })
    expect(chart.data).toMatchObject({ chartType: 'column', title: 'Revenue', columns: ['Year', 'Revenue'], rows: [['2022', '4600'], ['2023', '8700']], source: { tableId: t.id } })

    // a UI edit of the table (generic updateObjects) re-derives the chart and tells the UI
    changes.length = 0
    const next = revenue()
    next.rows.push({ id: 'c', cells: { y: '2024', r: '13100' } })
    svc.updateObjects([{ id: t.id, data: next }])
    expect(svc.getObject(chart.id)!.data.rows).toEqual([['2022', '4600'], ['2023', '8700'], ['2024', '13100']])
    expect(changes).toContain('whiteboards')

    // updateTable (MCP path) too; chart type / title chosen on the chart survive
    svc.updateObjects([{ id: chart.id, data: { ...svc.getObject(chart.id)!.data, chartType: 'line', title: 'Growth' } }])
    svc.updateTable(t.id, { rows: [{ id: 'z', cells: { y: '2025', r: 1 } }] })
    expect(svc.getObject(chart.id)!.data).toMatchObject({ chartType: 'line', title: 'Growth', rows: [['2025', '1']] })

    // unlinked charts keep their data
    const { source: _s, ...unlinked } = svc.getObject(chart.id)!.data
    svc.updateObjects([{ id: chart.id, data: unlinked }])
    svc.updateTable(t.id, { rows: [] })
    expect(svc.getObject(chart.id)!.data.rows).toEqual([['2025', '1']])
    expect(() => svc.chartFromTable({ tableId: chart.id })).toThrow(/Table not found/)
  })
})
