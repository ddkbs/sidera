import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { CanvasApi, DbChangeScope } from '@shared/api'
import { docToText, emptyDoc, extractMentions, markdownToDoc } from '@shared/doc'
import { collectTasks, setTaskChecked as applyTaskChecked } from '@shared/tasks'
import type {
  Card,
  CardDetail,
  CardSummary,
  Connection,
  DocJSON,
  FileRecord,
  JournalDay,
  KanbanBoard,
  SearchHit,
  SelectOption,
  Tag,
  TagProperty,
  Task,
  Whiteboard,
  WhiteboardDetail,
  WhiteboardObject
} from '@shared/types'
import { between, now, TAG_COLORS } from '@shared/util'
import type { DB } from '../db/client'
import * as s from '../db/schema'
import { layoutGroups } from './organize'

type Electronish = 'importFiles' | 'getFileUrl' | 'getMcpInfo' | 'exportMarkdown' | 'importMarkdown' | 'fetchLinkPreview' | 'clipUrl'
export type ServiceMethods = {
  [K in Exclude<keyof CanvasApi, Electronish>]: (
    ...args: Parameters<CanvasApi[K]>
  ) => Awaited<ReturnType<CanvasApi[K]>>
}
export type Services = ServiceMethods & {
  registerFile(input: Omit<FileRecord, 'id' | 'createdAt'>): FileRecord
  getFile(id: string): FileRecord | null
}

const DEFAULT_SIZES: Record<string, [number, number]> = {
  card: [320, 220],
  text: [240, 60],
  section: [640, 420],
  whiteboard: [260, 140],
  file: [320, 400],
  mindmap: [480, 320],
  mermaid: [420, 300],
  sketch: [380, 280],
  chart: [440, 300],
  link: [320, 200]
}

const json = <T>(v: string | null | undefined, fallback: T): T => {
  if (!v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export function createServices(db: DB, onChange: (scope: DbChangeScope) => void = () => {}): Services {
  const sql = db.$client
  const tx = <T>(fn: () => T): T => sql.transaction(fn)()

  // ---------- mappers ----------
  const toCard = (r: typeof s.cards.$inferSelect): Card => ({
    id: r.id,
    title: r.title,
    content: json<DocJSON>(r.content, emptyDoc()),
    contentText: r.contentText,
    color: r.color,
    icon: r.icon,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
  const toTag = (r: typeof s.tags.$inferSelect): Tag => ({ id: r.id, name: r.name, color: r.color })
  const toProp = (r: typeof s.tagProperties.$inferSelect): TagProperty => ({
    id: r.id,
    tagId: r.tagId,
    name: r.name,
    type: r.type as TagProperty['type'],
    options: json<SelectOption[]>(r.options, []),
    position: r.position
  })
  const toBoard = (r: typeof s.whiteboards.$inferSelect): Whiteboard => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId,
    viewport: json(r.viewport, { x: 0, y: 0, zoom: 1 }),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
  const toObject = (r: typeof s.whiteboardObjects.$inferSelect): WhiteboardObject => ({
    id: r.id,
    whiteboardId: r.whiteboardId,
    kind: r.kind as WhiteboardObject['kind'],
    refId: r.refId,
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    z: r.z,
    color: r.color,
    data: json(r.data, {})
  })
  const toConn = (r: typeof s.connections.$inferSelect): Connection => ({
    id: r.id,
    whiteboardId: r.whiteboardId,
    sourceId: r.sourceId,
    targetId: r.targetId,
    label: r.label,
    data: json(r.data, {})
  })

  const tagsFor = (cardIds: string[]): Map<string, Tag[]> => {
    const map = new Map<string, Tag[]>()
    if (!cardIds.length) return map
    const rows = db
      .select({ cardId: s.cardTags.cardId, tag: s.tags })
      .from(s.cardTags)
      .innerJoin(s.tags, eq(s.tags.id, s.cardTags.tagId))
      .where(inArray(s.cardTags.cardId, cardIds))
      .all()
    for (const r of rows) {
      const list = map.get(r.cardId) ?? []
      list.push(toTag(r.tag))
      map.set(r.cardId, list)
    }
    return map
  }

  const summarize = (rows: CardSummaryRow[]): CardSummary[] => {
    const tags = tagsFor(rows.map((r) => r.id))
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: r.contentText.slice(0, 280),
      color: r.color ?? null,
      icon: r.icon ?? null,
      updatedAt: r.updatedAt,
      tags: tags.get(r.id) ?? []
    }))
  }

  const syncBacklinks = (cardId: string, doc: DocJSON): void => {
    sql.prepare('DELETE FROM backlinks WHERE source_card_id = ?').run(cardId)
    const ins = sql.prepare(
      'INSERT OR IGNORE INTO backlinks (source_card_id, target_card_id) SELECT ?, id FROM cards WHERE id = ?'
    )
    for (const target of extractMentions(doc)) if (target !== cardId) ins.run(cardId, target)
  }

  const getCardRow = (id: string) => db.select().from(s.cards).where(eq(s.cards.id, id)).get()

  const requireCard = (id: string): Card => {
    const r = getCardRow(id)
    if (!r) throw new Error(`Card not found: ${id}`)
    return toCard(r)
  }

  const ensureStatusProperty = (tagId: string): TagProperty => {
    const existing = db
      .select()
      .from(s.tagProperties)
      .where(and(eq(s.tagProperties.tagId, tagId), eq(s.tagProperties.type, 'select')))
      .orderBy(s.tagProperties.position)
      .get()
    if (existing) return toProp(existing)
    return api.createProperty({
      tagId,
      name: 'Status',
      type: 'select',
      options: [
        { id: nanoid(8), name: 'To do', color: 'gray' },
        { id: nanoid(8), name: 'In progress', color: 'blue' },
        { id: nanoid(8), name: 'Done', color: 'green' }
      ]
    })
  }

  const api: Services = {
    // ---------- cards ----------
    listCards(opts = {}) {
      const limit = opts.limit ?? 500
      const offset = opts.offset ?? 0
      const rows = opts.tagId
        ? (sql
            .prepare(
              `SELECT c.id, c.title, c.content_text AS contentText, c.color, c.icon, c.updated_at AS updatedAt FROM cards c
               JOIN card_tags ct ON ct.card_id = c.id
               WHERE ct.tag_id = ? AND c.deleted_at IS NULL AND c.id NOT IN (SELECT card_id FROM journal_entries)
               ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`
            )
            .all(opts.tagId, limit, offset) as CardSummaryRow[])
        : (sql
            .prepare(
              `SELECT id, title, content_text AS contentText, color, icon, updated_at AS updatedAt FROM cards
               WHERE deleted_at IS NULL AND id NOT IN (SELECT card_id FROM journal_entries)
               ORDER BY updated_at DESC LIMIT ? OFFSET ?`
            )
            .all(limit, offset) as CardSummaryRow[])
      const cards = summarize(rows)
      if (opts.tagId && cards.length) {
        const values = sql
          .prepare(
            `SELECT v.card_id AS cardId, v.property_id AS propertyId, v.value FROM card_property_values v
             JOIN tag_properties p ON p.id = v.property_id WHERE p.tag_id = ?`
          )
          .all(opts.tagId) as { cardId: string; propertyId: string; value: string | null }[]
        const byCard = new Map<string, Record<string, unknown>>()
        for (const v of values) byCard.set(v.cardId, { ...byCard.get(v.cardId), [v.propertyId]: json<unknown>(v.value, null) })
        for (const c of cards) c.values = byCard.get(c.id) ?? {}
      }
      return cards
    },

    getCard(id) {
      const r = getCardRow(id)
      if (!r) return null
      const card = toCard(r)
      const backlinks = sql
        .prepare(
          `SELECT c.id AS cardId, c.title FROM backlinks b JOIN cards c ON c.id = b.source_card_id
           WHERE b.target_card_id = ? ORDER BY c.updated_at DESC`
        )
        .all(id) as CardDetail['backlinks']
      const whiteboards = sql
        .prepare(
          `SELECT DISTINCT w.id, w.name FROM whiteboard_objects o JOIN whiteboards w ON w.id = o.whiteboard_id
           WHERE o.kind = 'card' AND o.ref_id = ? AND w.deleted_at IS NULL`
        )
        .all(id) as CardDetail['whiteboards']
      const tags = tagsFor([id]).get(id) ?? []
      const properties = tags.flatMap((t) =>
        api.listProperties(t.id).map((property) => {
          const v = db
            .select()
            .from(s.cardPropertyValues)
            .where(and(eq(s.cardPropertyValues.cardId, id), eq(s.cardPropertyValues.propertyId, property.id)))
            .get()
          return { property, value: json<unknown>(v?.value, null) }
        })
      )
      return { ...card, tags, backlinks, whiteboards, properties }
    },

    createCard(input) {
      const content = input.content ?? (input.markdown ? markdownToDoc(input.markdown) : emptyDoc())
      const t = now()
      const row = {
        id: nanoid(),
        title: input.title?.trim() ?? '',
        content: JSON.stringify(content),
        contentText: docToText(content),
        createdAt: t,
        updatedAt: t
      }
      tx(() => {
        db.insert(s.cards).values(row).run()
        syncBacklinks(row.id, content)
        if (input.tagIds?.length) api.setCardTags(row.id, input.tagIds)
      })
      onChange('cards')
      return toCard({ ...row, color: null, icon: null, deletedAt: null })
    },

    updateCard(input) {
      const existing = requireCard(input.id)
      const patch: Partial<typeof s.cards.$inferInsert> = { updatedAt: now() }
      if (input.title !== undefined) patch.title = input.title
      if (input.color !== undefined) patch.color = input.color
      if (input.icon !== undefined) patch.icon = input.icon
      if (input.content !== undefined) {
        patch.content = JSON.stringify(input.content)
        patch.contentText = docToText(input.content)
      }
      tx(() => {
        db.update(s.cards).set(patch).where(eq(s.cards.id, input.id)).run()
        if (input.content) syncBacklinks(input.id, input.content)
      })
      onChange('cards')
      return { ...existing, ...requireCard(input.id) }
    },

    deleteCard(id) {
      tx(() => {
        sql.prepare(`DELETE FROM whiteboard_objects WHERE kind = 'card' AND ref_id = ?`).run(id)
        db.delete(s.cards).where(eq(s.cards.id, id)).run()
      })
      onChange('all')
    },

    // ---------- tags ----------
    listTags() {
      return db.select().from(s.tags).orderBy(s.tags.name).all().map(toTag)
    },
    createTag({ name, color }) {
      const clean = name.trim().replace(/^#/, '')
      const existing = sql.prepare('SELECT * FROM tags WHERE name = ? COLLATE NOCASE').get(clean) as
        | { id: string; name: string; color: string }
        | undefined
      if (existing) return { id: existing.id, name: existing.name, color: existing.color }
      const count = (sql.prepare('SELECT COUNT(*) AS n FROM tags').get() as { n: number }).n
      const tag = { id: nanoid(), name: clean, color: color ?? TAG_COLORS[(count + 1) % TAG_COLORS.length] }
      db.insert(s.tags).values({ ...tag, createdAt: now() }).run()
      onChange('tags')
      return tag
    },
    updateTag({ id, name, color }) {
      const patch: Partial<typeof s.tags.$inferInsert> = {}
      if (name !== undefined) patch.name = name
      if (color !== undefined) patch.color = color
      db.update(s.tags).set(patch).where(eq(s.tags.id, id)).run()
      onChange('tags')
      return toTag(db.select().from(s.tags).where(eq(s.tags.id, id)).get()!)
    },
    deleteTag(id) {
      db.delete(s.tags).where(eq(s.tags.id, id)).run()
      onChange('all')
    },
    setCardTags(cardId, tagIds) {
      tx(() => {
        db.delete(s.cardTags).where(eq(s.cardTags.cardId, cardId)).run()
        for (const tagId of new Set(tagIds)) db.insert(s.cardTags).values({ cardId, tagId }).run()
      })
      onChange('cards')
    },
    listProperties(tagId) {
      return db
        .select()
        .from(s.tagProperties)
        .where(eq(s.tagProperties.tagId, tagId))
        .orderBy(s.tagProperties.position)
        .all()
        .map(toProp)
    },
    createProperty({ tagId, name, type, options = [] }) {
      const pos = (sql.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tag_properties WHERE tag_id = ?').get(tagId) as { p: number }).p
      const row = { id: nanoid(), tagId, name, type, options: JSON.stringify(options), position: pos }
      db.insert(s.tagProperties).values(row).run()
      onChange('tags')
      return toProp(row)
    },
    updateProperty({ id, name, options }) {
      const patch: Partial<typeof s.tagProperties.$inferInsert> = {}
      if (name !== undefined) patch.name = name
      if (options !== undefined) patch.options = JSON.stringify(options)
      db.update(s.tagProperties).set(patch).where(eq(s.tagProperties.id, id)).run()
      onChange('tags')
      return toProp(db.select().from(s.tagProperties).where(eq(s.tagProperties.id, id)).get()!)
    },
    setPropertyValue(cardId, propertyId, value) {
      sql
        .prepare(
          `INSERT INTO card_property_values (card_id, property_id, value) VALUES (?, ?, ?)
           ON CONFLICT(card_id, property_id) DO UPDATE SET value = excluded.value`
        )
        .run(cardId, propertyId, JSON.stringify(value ?? null))
      onChange('cards')
    },

    // ---------- kanban ----------
    getKanban(tagId, propertyId) {
      const tagRow = db.select().from(s.tags).where(eq(s.tags.id, tagId)).get()
      if (!tagRow) return null
      const property = propertyId
        ? toProp(db.select().from(s.tagProperties).where(eq(s.tagProperties.id, propertyId)).get()!)
        : ensureStatusProperty(tagId)
      const rows = sql
        .prepare(
          `SELECT c.id, c.title, c.content_text AS contentText, c.color, c.icon, c.updated_at AS updatedAt, v.value, v.position
           FROM cards c JOIN card_tags ct ON ct.card_id = c.id AND ct.tag_id = ?
           LEFT JOIN card_property_values v ON v.card_id = c.id AND v.property_id = ?
           WHERE c.deleted_at IS NULL
           ORDER BY COALESCE(v.position, 0), c.updated_at DESC`
        )
        .all(tagId, property.id) as (CardSummaryRow & { value: string | null; position: number | null })[]
      const summaries = new Map(summarize(rows).map((c) => [c.id, c]))
      const byOption = new Map<string | null, CardSummary[]>()
      for (const r of rows) {
        const opt = json<string | null>(r.value, null)
        const key = property.options.some((o) => o.id === opt) ? opt : null
        const list = byOption.get(key) ?? []
        list.push(summaries.get(r.id)!)
        byOption.set(key, list)
      }
      const board: KanbanBoard = {
        tag: toTag(tagRow),
        property,
        columns: [
          { option: null, cards: byOption.get(null) ?? [] },
          ...property.options.map((option) => ({ option, cards: byOption.get(option.id) ?? [] }))
        ]
      }
      return board
    },

    moveKanbanItem({ cardId, propertyId, optionId, index }) {
      const siblings = (
        sql
          .prepare(
            `SELECT v.card_id AS id, v.position FROM card_property_values v
             WHERE v.property_id = ? AND v.value IS ? AND v.card_id != ? ORDER BY v.position`
          )
          .all(propertyId, JSON.stringify(optionId), cardId) as { id: string; position: number }[]
      )
      const i = Math.max(0, Math.min(index, siblings.length))
      const position = between(siblings[i - 1]?.position, siblings[i]?.position)
      sql
        .prepare(
          `INSERT INTO card_property_values (card_id, property_id, value, position) VALUES (?, ?, ?, ?)
           ON CONFLICT(card_id, property_id) DO UPDATE SET value = excluded.value, position = excluded.position`
        )
        .run(cardId, propertyId, JSON.stringify(optionId), position)
      onChange('cards')
    },

    // ---------- whiteboards ----------
    listWhiteboards() {
      return db
        .select()
        .from(s.whiteboards)
        .where(isNull(s.whiteboards.deletedAt))
        .orderBy(desc(s.whiteboards.updatedAt))
        .all()
        .map(toBoard)
    },

    getWhiteboard(id) {
      const row = db.select().from(s.whiteboards).where(eq(s.whiteboards.id, id)).get()
      if (!row || row.deletedAt) return null
      const breadcrumb: WhiteboardDetail['breadcrumb'] = []
      let cursor: typeof row | undefined = row
      const seen = new Set<string>()
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id)
        breadcrumb.unshift({ id: cursor.id, name: cursor.name })
        cursor = cursor.parentId
          ? db.select().from(s.whiteboards).where(eq(s.whiteboards.id, cursor.parentId)).get()
          : undefined
      }
      const objects = db.select().from(s.whiteboardObjects).where(eq(s.whiteboardObjects.whiteboardId, id)).all().map(toObject)
      const connections = db.select().from(s.connections).where(eq(s.connections.whiteboardId, id)).all().map(toConn)
      const cardIds = objects.filter((o) => o.kind === 'card' && o.refId).map((o) => o.refId!)
      const cardRows = cardIds.length
        ? db
            .select({ id: s.cards.id, title: s.cards.title, contentText: s.cards.contentText, color: s.cards.color, icon: s.cards.icon, updatedAt: s.cards.updatedAt })
            .from(s.cards)
            .where(inArray(s.cards.id, cardIds))
            .all()
        : []
      const cards = Object.fromEntries(summarize(cardRows).map((c) => [c.id, c]))
      const children = db.select().from(s.whiteboards).where(eq(s.whiteboards.parentId, id)).all().filter((w) => !w.deletedAt).map(toBoard)
      return { whiteboard: toBoard(row), breadcrumb, objects, connections, cards, children }
    },

    createWhiteboard({ name, parentId = null }) {
      const t = now()
      const row = { id: nanoid(), name, parentId, viewport: JSON.stringify({ x: 0, y: 0, zoom: 1 }), createdAt: t, updatedAt: t, deletedAt: null }
      db.insert(s.whiteboards).values(row).run()
      onChange('whiteboards')
      return toBoard(row)
    },

    updateWhiteboard({ id, name, viewport }) {
      const patch: Partial<typeof s.whiteboards.$inferInsert> = { updatedAt: now() }
      if (name !== undefined) patch.name = name
      if (viewport !== undefined) patch.viewport = JSON.stringify(viewport)
      db.update(s.whiteboards).set(patch).where(eq(s.whiteboards.id, id)).run()
      if (name !== undefined) onChange('whiteboards')
      return toBoard(db.select().from(s.whiteboards).where(eq(s.whiteboards.id, id)).get()!)
    },

    deleteWhiteboard(id) {
      tx(() => {
        sql.prepare(`DELETE FROM whiteboard_objects WHERE kind = 'whiteboard' AND ref_id = ?`).run(id)
        db.delete(s.whiteboards).where(eq(s.whiteboards.id, id)).run()
      })
      onChange('whiteboards')
    },

    addObject(input) {
      const [w, h] = DEFAULT_SIZES[input.kind] ?? [240, 160]
      const z = (sql.prepare('SELECT COALESCE(MAX(z), 0) + 1 AS z FROM whiteboard_objects WHERE whiteboard_id = ?').get(input.whiteboardId) as { z: number }).z
      const row = {
        id: nanoid(),
        whiteboardId: input.whiteboardId,
        kind: input.kind,
        refId: input.refId ?? null,
        x: input.x,
        y: input.y,
        width: input.width ?? w,
        height: input.height ?? h,
        // sections live behind everything else
        z: input.kind === 'section' ? -z : z,
        color: input.color ?? null,
        data: JSON.stringify(input.data ?? {})
      }
      db.insert(s.whiteboardObjects).values(row).run()
      db.update(s.whiteboards).set({ updatedAt: now() }).where(eq(s.whiteboards.id, input.whiteboardId)).run()
      onChange('whiteboards')
      return toObject(row)
    },

    updateObjects(patches) {
      tx(() => {
        for (const { id, data, ...rest } of patches) {
          const patch: Partial<typeof s.whiteboardObjects.$inferInsert> = { ...rest }
          if (data !== undefined) patch.data = JSON.stringify(data)
          if (Object.keys(patch).length) db.update(s.whiteboardObjects).set(patch).where(eq(s.whiteboardObjects.id, id)).run()
        }
      })
    },

    removeObjects(ids) {
      if (!ids.length) return
      db.delete(s.whiteboardObjects).where(inArray(s.whiteboardObjects.id, ids)).run()
      onChange('whiteboards')
    },

    restoreObjects(objects, conns) {
      tx(() => {
        for (const o of objects)
          db.insert(s.whiteboardObjects).values({ ...o, data: JSON.stringify(o.data) }).onConflictDoNothing().run()
        for (const c of conns) {
          const ok = sql.prepare('SELECT COUNT(*) AS n FROM whiteboard_objects WHERE id IN (?, ?)').get(c.sourceId, c.targetId) as { n: number }
          if (ok.n === 2) db.insert(s.connections).values({ ...c, data: JSON.stringify(c.data) }).onConflictDoNothing().run()
        }
      })
      onChange('whiteboards')
    },

    addConnection({ whiteboardId, sourceId, targetId, label = '' }) {
      const row = { id: nanoid(), whiteboardId, sourceId, targetId, label, data: '{}' }
      db.insert(s.connections).values(row).run()
      onChange('whiteboards')
      return toConn(row)
    },

    updateConnection({ id, label, data }) {
      const patch: Partial<typeof s.connections.$inferInsert> = {}
      if (label !== undefined) patch.label = label
      if (data !== undefined) patch.data = JSON.stringify(data)
      db.update(s.connections).set(patch).where(eq(s.connections.id, id)).run()
    },

    removeConnections(ids) {
      if (!ids.length) return
      db.delete(s.connections).where(inArray(s.connections.id, ids)).run()
      onChange('whiteboards')
    },

    organizeBoard({ whiteboardId, groups, removeExistingSections = true }) {
      const wb = api.getWhiteboard(whiteboardId)
      if (!wb) throw new Error(`Whiteboard not found: ${whiteboardId}`)
      const result = tx(() => {
        if (removeExistingSections) {
          const sectionIds = wb.objects.filter((o) => o.kind === 'section').map((o) => o.id)
          if (sectionIds.length) db.delete(s.whiteboardObjects).where(inArray(s.whiteboardObjects.id, sectionIds)).run()
        }
        const pool = new Map(wb.objects.filter((o) => o.kind !== 'section').map((o) => [o.id, o]))
        const used = new Set<string>()
        const groupSized = groups.map((g, i) => {
          const objects = g.objectIds.map((id) => pool.get(id)).filter((o): o is WhiteboardObject => !!o)
          objects.forEach((o) => used.add(o.id))
          return {
            title: g.title,
            color: g.color ?? TAG_COLORS[(i + 1) % TAG_COLORS.length],
            objects: objects.map((o) => ({ id: o.id, width: o.width, height: o.height }))
          }
        })
        const unsortedObjects = [...pool.values()].filter((o) => !used.has(o.id)).map((o) => ({ id: o.id, width: o.width, height: o.height }))
        const layout = layoutGroups(groupSized, unsortedObjects)

        const move = (id: string, x: number, y: number) => db.update(s.whiteboardObjects).set({ x, y }).where(eq(s.whiteboardObjects.id, id)).run()
        for (const sec of layout.sections) for (const o of sec.objects) move(o.id, o.x, o.y)
        for (const o of layout.unsorted) move(o.id, o.x, o.y)

        let z = (sql.prepare('SELECT COALESCE(MIN(z), 0) - 1 AS z FROM whiteboard_objects WHERE whiteboard_id = ?').get(whiteboardId) as { z: number }).z
        const sections = layout.sections.map((sec) => {
          const id = nanoid()
          db.insert(s.whiteboardObjects)
            .values({
              id,
              whiteboardId,
              kind: 'section',
              refId: null,
              x: sec.x,
              y: sec.y,
              width: sec.width,
              height: sec.height,
              z: z--,
              color: sec.color,
              data: JSON.stringify({ title: sec.title })
            })
            .run()
          return { id, title: sec.title, objectCount: sec.objects.length }
        })
        db.update(s.whiteboards).set({ updatedAt: now() }).where(eq(s.whiteboards.id, whiteboardId)).run()
        return { sections, unsorted: layout.unsorted.length }
      })
      onChange('whiteboards')
      return result
    },

    // ---------- journal ----------
    getJournal(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`)
      const entry = db.select().from(s.journalEntries).where(eq(s.journalEntries.date, date)).get()
      if (entry) {
        const r = getCardRow(entry.cardId)
        if (r) return { date, card: toCard(r) }
      }
      const card = tx(() => {
        const c = api.createCard({ title: date })
        db.insert(s.journalEntries).values({ date, cardId: c.id }).onConflictDoUpdate({ target: s.journalEntries.date, set: { cardId: c.id } }).run()
        return c
      })
      onChange('journal')
      return { date, card }
    },

    listJournal(limit = 30) {
      const rows = sql
        .prepare(`SELECT j.date, c.* FROM journal_entries j JOIN cards c ON c.id = j.card_id ORDER BY j.date DESC LIMIT ?`)
        .all(limit) as (RawCard & { date: string })[]
      return rows.map((r): JournalDay => ({ date: r.date, card: toCard(fromRaw(r)) }))
    },

    // ---------- tasks ----------
    listTasks(opts = {}) {
      const status = opts.status ?? 'all'
      const rows = sql
        .prepare(
          `SELECT c.id, c.title, c.content, c.updated_at AS updatedAt, j.date AS journalDate
           FROM cards c LEFT JOIN journal_entries j ON j.card_id = c.id
           WHERE c.deleted_at IS NULL AND c.content LIKE '%taskItem%'`
        )
        .all() as { id: string; title: string; content: string; updatedAt: number; journalDate: string | null }[]
      const out: Task[] = []
      for (const r of rows) {
        const doc = json<DocJSON>(r.content, emptyDoc())
        for (const t of collectTasks(doc)) {
          if (status === 'open' && t.checked) continue
          if (status === 'done' && !t.checked) continue
          out.push({
            cardId: r.id,
            cardTitle: r.title,
            isJournal: !!r.journalDate,
            journalDate: r.journalDate,
            index: t.index,
            text: t.text,
            checked: t.checked,
            updatedAt: r.updatedAt
          })
        }
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt)
    },

    setTaskChecked(cardId, index, checked) {
      const card = requireCard(cardId)
      api.updateCard({ id: cardId, content: applyTaskChecked(card.content, index, checked) })
    },

    // ---------- search ----------
    search(query, limit = 20) {
      const q = query.trim()
      if (!q) {
        return summarize(
          sql
            .prepare(`SELECT id, title, content_text AS contentText, color, icon, updated_at AS updatedAt FROM cards WHERE deleted_at IS NULL AND NOT (content_text = '' AND id IN (SELECT card_id FROM journal_entries)) ORDER BY updated_at DESC LIMIT ?`)
            .all(limit) as CardSummaryRow[]
        ).map((c): SearchHit => ({ id: c.id, title: c.title, snippet: c.excerpt.slice(0, 120), kind: 'card' }))
      }
      const fts = q
        .split(/\s+/)
        .map((t) => t.replace(/"/g, ''))
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(' ')
      const boards = sql
        .prepare(`SELECT id, name AS title FROM whiteboards WHERE deleted_at IS NULL AND name LIKE ? ORDER BY updated_at DESC LIMIT 5`)
        .all(`%${q}%`) as { id: string; title: string }[]
      let cards: SearchHit[] = []
      if (fts) {
        cards = (
          sql
            .prepare(
              `SELECT c.id, c.title, snippet(cards_fts, 1, '', '', '…', 16) AS snippet
               FROM cards_fts JOIN cards c ON c.rowid = cards_fts.rowid
               WHERE cards_fts MATCH ? AND c.deleted_at IS NULL
               ORDER BY bm25(cards_fts, 5.0, 1.0) LIMIT ?`
            )
            .all(fts, limit) as { id: string; title: string; snippet: string }[]
        ).map((r) => ({ ...r, kind: 'card' as const }))
      }
      return [...boards.map((b) => ({ ...b, snippet: 'Whiteboard', kind: 'whiteboard' as const })), ...cards]
    },

    // ---------- files ----------
    registerFile(input) {
      const row = { id: nanoid(), createdAt: now(), ...input }
      db.insert(s.files).values(row).run()
      return row
    },
    getFile(id) {
      return db.select().from(s.files).where(eq(s.files.id, id)).get() ?? null
    }
  }

  return api
}

interface CardSummaryRow {
  id: string
  title: string
  contentText: string
  color?: string | null
  icon?: string | null
  updatedAt: number
}
interface RawCard {
  id: string
  title: string
  content: string
  content_text: string
  color: string | null
  icon: string | null
  created_at: number
  updated_at: number
  deleted_at: number | null
}
const fromRaw = (r: RawCard): typeof s.cards.$inferSelect => ({
  id: r.id,
  title: r.title,
  content: r.content,
  contentText: r.content_text,
  color: r.color,
  icon: r.icon,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at
})
