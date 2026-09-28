import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { userInfo } from 'node:os'
import { nanoid } from 'nanoid'
import type { CanvasApi, DbChangeScope } from '@shared/api'
import { docToText, emptyDoc, extractMentions, markdownToDoc } from '@shared/doc'
import { fileUrl } from '@shared/fileProtocol'
import { appendTask, collectTasks, ensureTaskIds, isIsoDate, isoDate, matchesDue, setTaskChecked as applyTaskChecked, setTaskText } from '@shared/tasks'
import type {
  Card,
  CardDetail,
  CardSummary,
  Connection,
  DocJSON,
  FileRecord,
  Folder,
  HighlightRect,
  PdfHighlight,
  Profile,
  ProfileRef,
  KanbanBoard,
  SearchHit,
  SelectOption,
  Tag,
  TagProperty,
  Task,
  TaskActivity,
  TaskActivityKind,
  TaskComment,
  TaskPriority,
  TaskStatus,
  Whiteboard,
  WhiteboardDetail,
  WhiteboardObject
} from '@shared/types'
import { TASK_PRIORITIES, TASK_STATUSES } from '@shared/types'
import type { CardKind, TextBlockStyle } from '@shared/types'
import { normalizeChart, type ChartData } from '@shared/charts'
import { normalizeTable, tableToChart, type TableData } from '@shared/tables'
import { between, now, TAG_COLORS } from '@shared/util'
import type { DB } from '../db/client'
import * as s from '../db/schema'
import { layoutGroups } from './organize'

type Electronish = 'importFiles' | 'importFileData' | 'getFileUrl' | 'openFile' | 'getMcpInfo' | 'exportMarkdown' | 'importMarkdown' | 'fetchLinkPreview' | 'clipUrl'
export type ServiceMethods = {
  [K in Exclude<keyof CanvasApi, Electronish>]: (
    ...args: Parameters<CanvasApi[K]>
  ) => Awaited<ReturnType<CanvasApi[K]>>
}
export type Services = ServiceMethods & {
  registerFile(input: Omit<FileRecord, 'id' | 'createdAt'>): FileRecord
  getFile(id: string): FileRecord | null
  getObject(id: string): WhiteboardObject | null
  /** Replace parts of a table object's data (validated); linked charts follow. */
  updateTable(id: string, patch: Partial<TableData>): WhiteboardObject
  /** Tell the UI that data changed outside of the renderer (e.g. MCP edits of object data). */
  notify(scope: DbChangeScope): void
  /** Hard-delete soft-deleted cards/whiteboards older than `olderThan` ms. */
  purgeDeleted(olderThan: number): void
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
  link: [320, 200],
  table: [420, 200]
}

/** Width of a new text block when none is given. */
export const TEXT_BLOCK_WIDTH = 360

/** Title of a text block: its first non-empty line (so search results, mentions and exports stay readable). */
export function blockTitle(doc: DocJSON): string {
  const line = docToText(doc).split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > 80 ? line.slice(0, 79).trimEnd() + '…' : line
}

const cardKind = (k: unknown): CardKind => (k === 'block' ? 'block' : 'card')

const json = <T>(v: string | null | undefined, fallback: T): T => {
  if (!v) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

/** Where the active profile id lives (settings.json in the app; in-memory in tests). */
export interface ActiveProfileStore {
  get(): string | null
  set(id: string): void
}

export function memoryProfileStore(initial: string | null = null): ActiveProfileStore {
  let id = initial
  return { get: () => id, set: (v) => void (id = v) }
}

/** Name for the first profile: the macOS account name, capitalised. */
export function defaultProfileName(): string {
  let name = ''
  try {
    name = userInfo().username
  } catch {
    /* ignore */
  }
  name = name.trim() || 'Me'
  return name.charAt(0).toUpperCase() + name.slice(1)
}


export function createServices(
  db: DB,
  onChange: (scope: DbChangeScope) => void = () => {},
  profileStore: ActiveProfileStore = memoryProfileStore()
): Services {
  const sql = db.$client
  const tx = <T>(fn: () => T): T => sql.transaction(fn)()

  // ---------- mappers ----------
  const toCard = (r: typeof s.cards.$inferSelect): Card => ({
    id: r.id,
    kind: cardKind(r.kind),
    title: r.title,
    content: json<DocJSON>(r.content, emptyDoc()),
    contentText: r.contentText,
    color: r.color,
    icon: r.icon,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
  const toTag = (r: typeof s.tags.$inferSelect): Tag => ({ id: r.id, name: r.name, color: r.color })
  const toHighlight = (r: typeof s.pdfHighlights.$inferSelect): PdfHighlight => ({
    id: r.id,
    fileId: r.fileId,
    page: r.page,
    color: r.color,
    text: r.text,
    note: r.note,
    rects: json<HighlightRect[]>(r.rects, []),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
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
    folderId: r.folderId,
    viewport: json(r.viewport, { x: 0, y: 0, zoom: 1 }),
    properties: json(r.properties, []),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
  const toFolder = (r: typeof s.folders.$inferSelect): Folder => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId,
    position: r.position,
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
    color: r.color ?? null,
    lineStyle: (r.lineStyle === 'dashed' ? 'dashed' : 'solid') as Connection['lineStyle'],
    arrows: (r.arrows === 'none' || r.arrows === 'both' ? r.arrows : 'end') as Connection['arrows'],
    data: json(r.data, {})
  })

  const toProfile = (r: typeof s.profiles.$inferSelect): Profile => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatarFileId: r.avatarFileId,
    avatarUrl: r.avatarFileId ? fileUrl(r.avatarFileId) : null,
    color: r.color,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  })
  const profileRow = (id: string | null | undefined) => (id ? db.select().from(s.profiles).where(eq(s.profiles.id, id)).get() : undefined)
  const authorRef = (id: string | null): ProfileRef | null => {
    const r = profileRow(id)
    if (!r) return null
    const p = toProfile(r)
    return { id: p.id, name: p.name, color: p.color, avatarUrl: p.avatarUrl }
  }

  /** Make sure a valid active profile exists: first start creates one from the macOS user and adopts old comments. */
  const ensureActiveProfile = (): Profile => {
    const current = profileRow(profileStore.get())
    if (current) return toProfile(current)
    const first = db.select().from(s.profiles).orderBy(s.profiles.createdAt).get()
    if (first) {
      profileStore.set(first.id)
      return toProfile(first)
    }
    const t = now()
    const row = { id: nanoid(), name: defaultProfileName(), email: null, avatarFileId: null, color: 'blue', createdAt: t, updatedAt: t }
    tx(() => {
      db.insert(s.profiles).values(row).run()
      db.update(s.taskComments).set({ authorId: row.id }).where(isNull(s.taskComments.authorId)).run()
    })
    profileStore.set(row.id)
    return toProfile(row)
  }
  ensureActiveProfile()

  const cleanEmail = (email: string | null | undefined): string | null | undefined => {
    if (email === undefined) return undefined
    const e = email?.trim() ?? ''
    if (!e) return null
    if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new Error(`Invalid email: ${e}`)
    return e
  }
  const cleanColor = (c: string | undefined): string | undefined => {
    if (c === undefined) return undefined
    if (!(TAG_COLORS as readonly string[]).includes(c)) throw new Error(`Unknown color: ${c}`)
    return c
  }
  const checkAvatar = (fileId: string | null | undefined): void => {
    if (!fileId) return
    const f = db.select().from(s.files).where(eq(s.files.id, fileId)).get()
    if (!f) throw new Error(`File not found: ${fileId}`)
    if (!f.mime.startsWith('image/')) throw new Error('Avatar must be an image')
  }

  const toTaskComment = (r: typeof s.taskComments.$inferSelect, files: FileRecord[]): TaskComment => ({
    id: r.id,
    cardId: r.cardId,
    taskId: r.taskId,
    body: r.body,
    author: authorRef(r.authorId),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    files
  })

  /** Only the author (the active profile) may edit or delete a comment. */
  const requireOwnComment = (id: string): void => {
    const row = db.select().from(s.taskComments).where(eq(s.taskComments.id, id)).get()
    if (!row) throw new Error(`Task comment not found: ${id}`)
    if (row.authorId !== ensureActiveProfile().id) throw new Error('You can only edit or delete your own comments')
  }

  const filesForComment = (commentId: string): FileRecord[] =>
    sql
      .prepare(
        `SELECT f.id, f.name, f.mime, f.path, f.size, f.created_at AS createdAt
         FROM task_comment_files cf JOIN files f ON f.id = cf.file_id WHERE cf.comment_id = ? ORDER BY f.created_at`
      )
      .all(commentId) as FileRecord[]

  // ---------- task metadata ----------
  type MetaRow = typeof s.taskMeta.$inferSelect
  /** Set while updateTask writes the checkbox itself, so the card-content sync doesn't log the status change twice. */
  let taskSyncSuppressed = false

  const metaRow = (cardId: string, taskId: string): MetaRow | undefined =>
    db.select().from(s.taskMeta).where(and(eq(s.taskMeta.cardId, cardId), eq(s.taskMeta.taskId, taskId))).get()

  /** Checkbox wins for done-ness; otherwise the stored status (a stale 'done' becomes 'todo'). */
  const effectiveStatus = (checked: boolean, meta: Pick<MetaRow, 'status'> | undefined): TaskStatus =>
    checked ? 'done' : meta && meta.status !== 'done' ? (meta.status as TaskStatus) : 'todo'

  const logActivity = (cardId: string, taskId: string, kind: TaskActivityKind, from: string | null, to: string | null): void => {
    db.insert(s.taskActivity)
      .values({ id: nanoid(), cardId, taskId, actorProfileId: ensureActiveProfile().id, kind, fromValue: from, toValue: to, createdAt: now() })
      .run()
  }

  /** Keep task_meta.status in sync with checkboxes edited in the card itself, and log flips as activity. */
  const syncTaskMeta = (cardId: string, before: DocJSON, after: DocJSON): void => {
    const next = collectTasks(after)
    if (!next.length) return
    const prev = new Map(collectTasks(before).map((t) => [t.taskId, t.checked]))
    for (const t of next) {
      const meta = metaRow(cardId, t.taskId)
      const was = prev.get(t.taskId)
      if (was !== undefined && was !== t.checked && !taskSyncSuppressed)
        logActivity(cardId, t.taskId, 'status', effectiveStatus(was, meta), t.checked ? 'done' : 'todo')
      if (meta && (meta.status === 'done') !== t.checked)
        db.update(s.taskMeta)
          .set({ status: t.checked ? 'done' : 'todo', updatedAt: now() })
          .where(and(eq(s.taskMeta.cardId, cardId), eq(s.taskMeta.taskId, t.taskId)))
          .run()
    }
  }

  /** Tasks of the given (non-deleted) cards, with metadata, counts and profile refs joined. */
  const buildTasks = (cardIds?: string[]): Task[] => {
    const where = cardIds ? `AND c.id IN (${cardIds.map(() => '?').join(',')})` : ''
    const rows = sql
      .prepare(
        `SELECT c.id, c.title, c.content, c.icon, c.color, c.updated_at AS updatedAt
         FROM cards c
         WHERE c.deleted_at IS NULL AND c.content LIKE '%taskItem%' ${where}`
      )
      .all(...(cardIds ?? [])) as { id: string; title: string; content: string; icon: string | null; color: string | null; updatedAt: number }[]
    if (!rows.length) return []
    const key = (cardId: string, taskId: string) => `${cardId}:${taskId}`
    const counts = (query: string) =>
      new Map((sql.prepare(query).all() as { cardId: string; taskId: string; n: number }[]).map((c) => [key(c.cardId, c.taskId), c.n]))
    const comments = counts(`SELECT card_id AS cardId, task_id AS taskId, COUNT(*) AS n FROM task_comments GROUP BY card_id, task_id`)
    const attachments = counts(
      `SELECT c.card_id AS cardId, c.task_id AS taskId, COUNT(*) AS n FROM task_comments c JOIN task_comment_files f ON f.comment_id = c.id GROUP BY c.card_id, c.task_id`
    )
    const metas = new Map(db.select().from(s.taskMeta).all().map((m) => [key(m.cardId, m.taskId), m]))
    const profiles = new Map(
      db
        .select()
        .from(s.profiles)
        .all()
        .map((r): [string, ProfileRef] => {
          const p = toProfile(r)
          return [p.id, { id: p.id, name: p.name, color: p.color, avatarUrl: p.avatarUrl }]
        })
    )
    const ref = (id: string | null | undefined): ProfileRef | null => (id ? (profiles.get(id) ?? null) : null)
    const out: Task[] = []
    for (const r of rows) {
      for (const t of collectTasks(json<DocJSON>(r.content, emptyDoc()))) {
        const k = key(r.id, t.taskId)
        const meta = metas.get(k)
        out.push({
          cardId: r.id,
          cardTitle: r.title,
          cardIcon: r.icon,
          cardColor: r.color,
          taskId: t.taskId,
          index: t.index,
          text: t.text,
          checked: t.checked,
          status: effectiveStatus(t.checked, meta),
          priority: (meta?.priority as TaskPriority | undefined) ?? 'none',
          assignee: ref(meta?.assigneeProfileId),
          dueDate: meta?.dueDate ?? null,
          createdBy: ref(meta?.createdByProfileId),
          createdAt: meta?.createdAt ?? null,
          updatedAt: Math.max(r.updatedAt, meta?.updatedAt ?? 0),
          commentCount: comments.get(k) ?? 0,
          attachmentCount: attachments.get(k) ?? 0
        })
      }
    }
    return out
  }

  const requireTask = (cardId: string, taskId: string): Task => {
    const task = buildTasks([cardId]).find((t) => t.taskId === taskId)
    if (!task) throw new Error(`Task not found: ${cardId}/${taskId}`)
    return task
  }

  const checkTaskFields = (input: { status?: string; priority?: string; assigneeId?: string | null; dueDate?: string | null }): void => {
    if (input.status !== undefined && !(TASK_STATUSES as readonly string[]).includes(input.status)) throw new Error(`Unknown status: ${input.status}`)
    if (input.priority !== undefined && !(TASK_PRIORITIES as readonly string[]).includes(input.priority))
      throw new Error(`Unknown priority: ${input.priority}`)
    if (input.assigneeId && !profileRow(input.assigneeId)) throw new Error(`Profile not found: ${input.assigneeId}`)
    if (input.dueDate && !isIsoDate(input.dueDate)) throw new Error(`Invalid due date (use YYYY-MM-DD): ${input.dueDate}`)
  }

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
      kind: cardKind(r.kind),
      title: r.title,
      excerpt: r.contentText.slice(0, 4000),
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

  /** Default target for `addTask` when no card is given: find a non-deleted card titled exactly "Inbox", else create one. */
  const getOrCreateInboxCard = (): Card => {
    const row = sql.prepare(`SELECT id FROM cards WHERE title = 'Inbox' AND deleted_at IS NULL LIMIT 1`).get() as { id: string } | undefined
    if (row) return requireCard(row.id)
    return api.createCard({ title: 'Inbox' })
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

  // ---------- tables & linked charts ----------
  /** Set by syncLinkedCharts when a chart's data actually changed (so the UI refetches). */
  let linkedChartsChanged = false

  /** A chart object's data with a table source: rows/columns re-derived from the table if it still exists. */
  const linkedChartData = (raw: Partial<ChartData>): Record<string, unknown> => {
    const chart = normalizeChart(raw)
    const table = chart.source ? api.getObject(chart.source.tableId) : null
    if (!table || table.kind !== 'table') return chart as unknown as Record<string, unknown>
    return { ...tableToChart(table.data as unknown as TableData, chart), source: chart.source } as unknown as Record<string, unknown>
  }

  /** Re-derive every chart that follows this table (MCP and UI edits alike). */
  const syncLinkedCharts = (tableId: string): void => {
    const table = api.getObject(tableId)
    if (!table) return
    const charts = sql
      .prepare(`SELECT id, data FROM whiteboard_objects WHERE kind = 'chart' AND whiteboard_id = ? AND json_extract(data, '$.source.tableId') = ?`)
      .all(table.whiteboardId, tableId) as { id: string; data: string }[]
    for (const c of charts) {
      const next = JSON.stringify(linkedChartData(json<Partial<ChartData>>(c.data, {})))
      if (next === c.data) continue
      db.update(s.whiteboardObjects).set({ data: next }).where(eq(s.whiteboardObjects.id, c.id)).run()
      linkedChartsChanged = true
    }
  }

  const api: Services = {
    // ---------- cards ----------
    listCards(opts = {}) {
      const limit = opts.limit ?? 500
      const offset = opts.offset ?? 0
      const kind = opts.kind ?? (opts.tagId ? 'all' : 'card')
      const kindWhere = kind === 'all' ? '' : `AND c.kind = '${cardKind(kind)}'`
      const rows = opts.tagId
        ? (sql
            .prepare(
              `SELECT c.id, c.kind, c.title, c.content_text AS contentText, c.color, c.icon, c.updated_at AS updatedAt FROM cards c
               JOIN card_tags ct ON ct.card_id = c.id
               WHERE ct.tag_id = ? AND c.deleted_at IS NULL ${kindWhere}
               ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`
            )
            .all(opts.tagId, limit, offset) as CardSummaryRow[])
        : (sql
            .prepare(
              `SELECT c.id, c.kind, c.title, c.content_text AS contentText, c.color, c.icon, c.updated_at AS updatedAt FROM cards c
               WHERE c.deleted_at IS NULL ${kindWhere}
               ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`
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
      if (!r || r.deletedAt) return null
      const card = toCard(r)
      const backlinks = sql
        .prepare(
          `SELECT c.id AS cardId, c.title FROM backlinks b JOIN cards c ON c.id = b.source_card_id
           WHERE b.target_card_id = ? AND c.deleted_at IS NULL ORDER BY c.updated_at DESC`
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
      const content = ensureTaskIds(input.content ?? (input.markdown ? markdownToDoc(input.markdown) : emptyDoc()))
      const t = now()
      const kind = cardKind(input.kind)
      const row = {
        id: nanoid(),
        kind,
        title: input.title?.trim() || (kind === 'block' ? blockTitle(content) : ''),
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
      if (input.kind !== undefined) patch.kind = cardKind(input.kind)
      const content = input.content !== undefined ? ensureTaskIds(input.content) : undefined
      if (content !== undefined) {
        patch.content = JSON.stringify(content)
        patch.contentText = docToText(content)
        // a text block's title follows its first line
        if (input.title === undefined && existing.kind === 'block' && input.kind !== 'card') patch.title = blockTitle(content)
      }
      tx(() => {
        db.update(s.cards).set(patch).where(eq(s.cards.id, input.id)).run()
        if (content) {
          syncBacklinks(input.id, content)
          syncTaskMeta(input.id, existing.content, content)
        }
      })
      onChange('cards')
      return { ...existing, ...requireCard(input.id) }
    },

    /** Soft delete: the card disappears everywhere but can be restored (undo) until it is purged. */
    deleteCard(id) {
      db.update(s.cards).set({ deletedAt: now() }).where(eq(s.cards.id, id)).run()
      onChange('all')
    },

    restoreCard(id) {
      db.update(s.cards).set({ deletedAt: null }).where(eq(s.cards.id, id)).run()
      onChange('all')
    },

    /** Find a non-deleted card titled exactly "Inbox", or create one. Idempotent. */
    getInboxCard() {
      return getOrCreateInboxCard()
    },

    addTextBlock({ whiteboardId, x, y, width, content, markdown, style }) {
      if (!db.select({ id: s.whiteboards.id }).from(s.whiteboards).where(eq(s.whiteboards.id, whiteboardId)).get())
        throw new Error(`Whiteboard not found: ${whiteboardId}`)
      const blockStyle: TextBlockStyle = style === 'framed' ? 'framed' : 'plain'
      return tx(() => {
        const card = api.createCard({ kind: 'block', content, markdown })
        const lines = Math.max(1, card.contentText.split('\n').length)
        const object = api.addObject({
          whiteboardId,
          kind: 'card',
          refId: card.id,
          x,
          y,
          width: width ?? TEXT_BLOCK_WIDTH,
          height: Math.min(40 + lines * 24, 600),
          data: { style: blockStyle }
        })
        return { card, object }
      })
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
      // hide objects pointing at soft-deleted cards / whiteboards (and their arrows)
      const hidden = new Set(
        (
          sql
            .prepare(
              `SELECT o.id FROM whiteboard_objects o
               LEFT JOIN cards c ON o.kind = 'card' AND c.id = o.ref_id
               LEFT JOIN whiteboards w ON o.kind = 'whiteboard' AND w.id = o.ref_id
               WHERE o.whiteboard_id = ? AND (c.deleted_at IS NOT NULL OR w.deleted_at IS NOT NULL)`
            )
            .all(id) as { id: string }[]
        ).map((r) => r.id)
      )
      const objects = db.select().from(s.whiteboardObjects).where(eq(s.whiteboardObjects.whiteboardId, id)).all().map(toObject).filter((o) => !hidden.has(o.id))
      const connections = db
        .select()
        .from(s.connections)
        .where(eq(s.connections.whiteboardId, id))
        .all()
        .map(toConn)
        .filter((c) => !hidden.has(c.sourceId) && !hidden.has(c.targetId))
      const cardIds = objects.filter((o) => o.kind === 'card' && o.refId).map((o) => o.refId!)
      const cardRows = cardIds.length
        ? db
            .select({ id: s.cards.id, kind: s.cards.kind, title: s.cards.title, contentText: s.cards.contentText, color: s.cards.color, icon: s.cards.icon, updatedAt: s.cards.updatedAt })
            .from(s.cards)
            .where(inArray(s.cards.id, cardIds))
            .all()
        : []
      const cards = Object.fromEntries(summarize(cardRows).map((c) => [c.id, c]))
      const children = db.select().from(s.whiteboards).where(eq(s.whiteboards.parentId, id)).all().filter((w) => !w.deletedAt).map(toBoard)
      return { whiteboard: toBoard(row), breadcrumb, objects, connections, cards, children }
    },

    createWhiteboard({ name, parentId = null, folderId = null }) {
      const t = now()
      const row = { id: nanoid(), name, parentId, folderId, viewport: JSON.stringify({ x: 0, y: 0, zoom: 1 }), properties: '[]', createdAt: t, updatedAt: t, deletedAt: null }
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

    updateWhiteboardProperties(whiteboardId, properties) {
      db.update(s.whiteboards)
        .set({ properties: JSON.stringify(properties), updatedAt: now() })
        .where(eq(s.whiteboards.id, whiteboardId))
        .run()
      onChange('whiteboards')
      return toBoard(db.select().from(s.whiteboards).where(eq(s.whiteboards.id, whiteboardId)).get()!)
    },

    /** Soft delete (restorable). Objects referencing it on other boards are hidden meanwhile. */
    deleteWhiteboard(id) {
      db.update(s.whiteboards).set({ deletedAt: now() }).where(eq(s.whiteboards.id, id)).run()
      onChange('whiteboards')
    },

    restoreWhiteboard(id) {
      db.update(s.whiteboards).set({ deletedAt: null }).where(eq(s.whiteboards.id, id)).run()
      onChange('whiteboards')
    },

    moveWhiteboardToFolder(whiteboardId, folderId) {
      db.update(s.whiteboards).set({ folderId, updatedAt: now() }).where(eq(s.whiteboards.id, whiteboardId)).run()
      onChange('whiteboards')
    },

    /** Shallow copy: name, objects and connections. Nested child whiteboards are not duplicated. */
    duplicateWhiteboard(id) {
      const row = db.select().from(s.whiteboards).where(eq(s.whiteboards.id, id)).get()
      if (!row || row.deletedAt) throw new Error('Whiteboard not found')
      const t = now()
      const newBoard = { ...row, id: nanoid(), name: `${row.name} copy`, createdAt: t, updatedAt: t, deletedAt: null }
      const objects = db.select().from(s.whiteboardObjects).where(eq(s.whiteboardObjects.whiteboardId, id)).all()
      const connections = db.select().from(s.connections).where(eq(s.connections.whiteboardId, id)).all()
      const idMap = new Map<string, string>()
      tx(() => {
        db.insert(s.whiteboards).values(newBoard).run()
        for (const o of objects) {
          const newId = nanoid()
          idMap.set(o.id, newId)
          db.insert(s.whiteboardObjects).values({ ...o, id: newId, whiteboardId: newBoard.id }).run()
        }
        for (const c of connections) {
          const sourceId = idMap.get(c.sourceId)
          const targetId = idMap.get(c.targetId)
          if (!sourceId || !targetId) continue
          db.insert(s.connections).values({ ...c, id: nanoid(), whiteboardId: newBoard.id, sourceId, targetId }).run()
        }
      })
      onChange('whiteboards')
      return toBoard(newBoard)
    },

    // ---------- folders ----------
    listFolders() {
      return db.select().from(s.folders).orderBy(s.folders.position, s.folders.name).all().map(toFolder)
    },

    createFolder({ name, parentId = null }) {
      const t = now()
      const pos = (
        sql.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM folders WHERE parent_id IS ?').get(parentId) as { p: number }
      ).p
      const row = { id: nanoid(), name: name.trim() || 'Untitled folder', parentId, position: pos, createdAt: t, updatedAt: t }
      db.insert(s.folders).values(row).run()
      onChange('whiteboards')
      return toFolder(row)
    },

    renameFolder(id, name) {
      db.update(s.folders).set({ name: name.trim() || 'Untitled folder', updatedAt: now() }).where(eq(s.folders.id, id)).run()
      onChange('whiteboards')
      return toFolder(db.select().from(s.folders).where(eq(s.folders.id, id)).get()!)
    },

    deleteFolder(id) {
      const row = db.select().from(s.folders).where(eq(s.folders.id, id)).get()
      const parentId = row?.parentId ?? null
      tx(() => {
        // promote children (whiteboards + subfolders) to the parent level, then drop the folder
        db.update(s.whiteboards).set({ folderId: parentId }).where(eq(s.whiteboards.folderId, id)).run()
        db.update(s.folders).set({ parentId }).where(eq(s.folders.parentId, id)).run()
        db.delete(s.folders).where(eq(s.folders.id, id)).run()
      })
      onChange('whiteboards')
    },

    moveFolder(id, parentId) {
      if (parentId !== null) {
        // prevent cycles: parentId can't be id itself or any of its descendants
        let cursor: string | null = parentId
        const seen = new Set<string>()
        while (cursor) {
          if (cursor === id) throw new Error('Cannot move a folder into its own descendant')
          if (seen.has(cursor)) break
          seen.add(cursor)
          const row: { parentId: string | null } | undefined = db.select().from(s.folders).where(eq(s.folders.id, cursor)).get()
          cursor = row?.parentId ?? null
        }
      }
      db.update(s.folders).set({ parentId, updatedAt: now() }).where(eq(s.folders.id, id)).run()
      onChange('whiteboards')
    },

    addObject(input) {
      if (input.kind === 'table') input = { ...input, data: normalizeTable(input.data) as unknown as Record<string, unknown> }
      if (input.kind === 'chart' && (input.data as Partial<ChartData> | undefined)?.source) input = { ...input, data: linkedChartData(input.data as Partial<ChartData>) }
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
      const tables: string[] = []
      linkedChartsChanged = false
      tx(() => {
        for (const { id, data, ...rest } of patches) {
          const patch: Partial<typeof s.whiteboardObjects.$inferInsert> = { ...rest }
          if (data !== undefined) {
            const kind = sql.prepare('SELECT kind FROM whiteboard_objects WHERE id = ?').pluck().get(id)
            let next: unknown = data
            if (kind === 'table') {
              next = normalizeTable(data)
              tables.push(id)
            } else if (kind === 'chart' && (data as Partial<ChartData>)?.source) next = linkedChartData(data as Partial<ChartData>)
            patch.data = JSON.stringify(next)
          }
          if (Object.keys(patch).length) db.update(s.whiteboardObjects).set(patch).where(eq(s.whiteboardObjects.id, id)).run()
        }
        for (const t of tables) syncLinkedCharts(t)
      })
      // renderer-driven edits don't refetch the board, except when charts had to follow a table
      if (linkedChartsChanged) onChange('whiteboards')
    },

    updateTable(id, patch) {
      const obj = api.getObject(id)
      if (!obj || obj.kind !== 'table') throw new Error(`Table not found: ${id}`)
      const data = normalizeTable({ ...obj.data, ...patch })
      api.updateObjects([{ id, data: data as unknown as Record<string, unknown> }])
      onChange('whiteboards')
      return api.getObject(id)!
    },

    chartFromTable({ tableId, chartType }) {
      const table = api.getObject(tableId)
      if (!table || table.kind !== 'table') throw new Error(`Table not found: ${tableId}`)
      const chart = tableToChart(table.data as unknown as TableData, { chartType: chartType ?? 'column' })
      return api.addObject({
        whiteboardId: table.whiteboardId,
        kind: 'chart',
        x: table.x + table.width + 60,
        y: table.y,
        data: { ...chart, source: { tableId } } as unknown as Record<string, unknown>
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
      const row = { id: nanoid(), whiteboardId, sourceId, targetId, label, color: null, lineStyle: 'solid', arrows: 'end', data: '{}' }
      db.insert(s.connections).values(row).run()
      onChange('whiteboards')
      return toConn(row)
    },

    updateConnection({ id, label, color, lineStyle, arrows, data }) {
      const patch: Partial<typeof s.connections.$inferInsert> = {}
      if (label !== undefined) patch.label = label
      if (color !== undefined) patch.color = color
      if (lineStyle !== undefined) patch.lineStyle = lineStyle
      if (arrows !== undefined) patch.arrows = arrows
      if (data !== undefined) patch.data = JSON.stringify(data)
      if (!Object.keys(patch).length) return
      db.update(s.connections).set(patch).where(eq(s.connections.id, id)).run()
      onChange('whiteboards')
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

    // ---------- tasks ----------
    listTasks(opts = {}) {
      const status = opts.status ?? 'all'
      const today = opts.today ?? isoDate()
      return buildTasks()
        .filter((t) => {
          if (status === 'open' ? t.status === 'done' : status !== 'all' && t.status !== status) return false
          if (opts.assigneeId !== undefined && (t.assignee?.id ?? null) !== opts.assigneeId) return false
          if (opts.priority !== undefined && t.priority !== opts.priority) return false
          if (opts.due && !matchesDue(t.dueDate, opts.due, today, t.status === 'done')) return false
          return true
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },

    setTaskChecked(cardId, index, checked) {
      const card = requireCard(cardId)
      api.updateCard({ id: cardId, content: applyTaskChecked(card.content, index, checked) })
    },

    addTask({ text, cardId, status, priority, assigneeId, dueDate }) {
      const clean = text.trim()
      if (!clean) throw new Error('Task text is empty')
      checkTaskFields({ status, priority, assigneeId, dueDate })
      const card = cardId ? requireCard(cardId) : getOrCreateInboxCard()
      const appended = appendTask(card.content, clean)
      const doc = status === 'done' ? applyTaskChecked(appended.doc, appended.index, true) : appended.doc
      const t = now()
      const taskId = tx(() => {
        const saved = api.updateCard({ id: card.id, content: doc })
        const id = collectTasks(saved.content)[appended.index]?.taskId ?? ''
        db.insert(s.taskMeta)
          .values({
            cardId: card.id,
            taskId: id,
            status: status ?? 'todo',
            priority: priority ?? 'none',
            assigneeProfileId: assigneeId ?? null,
            dueDate: dueDate ?? null,
            createdByProfileId: ensureActiveProfile().id,
            createdAt: t,
            updatedAt: t
          })
          .run()
        logActivity(card.id, id, 'created', null, null)
        return id
      })
      onChange('cards')
      return requireTask(card.id, taskId)
    },

    updateTask({ cardId, taskId, status, priority, assigneeId, dueDate, text }) {
      const card = requireCard(cardId)
      const item = collectTasks(card.content).find((t) => t.taskId === taskId)
      if (!item) throw new Error(`Task not found: ${cardId}/${taskId}`)
      checkTaskFields({ status, priority, assigneeId, dueDate })
      const cleanText = text?.replace(/\s+/g, ' ').trim()
      if (text !== undefined && !cleanText) throw new Error('Task text is empty')
      const before = requireTask(cardId, taskId)
      tx(() => {
        const t = now()
        if (!metaRow(cardId, taskId)) db.insert(s.taskMeta).values({ cardId, taskId, status: before.status, createdAt: t, updatedAt: t }).run()
        const patch: Partial<MetaRow> = {}
        if (status !== undefined && status !== before.status) {
          patch.status = status
          logActivity(cardId, taskId, 'status', before.status, status)
        }
        if (priority !== undefined && priority !== before.priority) {
          patch.priority = priority
          logActivity(cardId, taskId, 'priority', before.priority, priority)
        }
        if (assigneeId !== undefined && assigneeId !== (before.assignee?.id ?? null)) {
          patch.assigneeProfileId = assigneeId
          logActivity(cardId, taskId, 'assignee', before.assignee?.id ?? null, assigneeId)
        }
        if (dueDate !== undefined && dueDate !== before.dueDate) {
          patch.dueDate = dueDate
          logActivity(cardId, taskId, 'due', before.dueDate, dueDate)
        }
        let doc = card.content
        if (cleanText !== undefined && cleanText !== item.text) {
          doc = setTaskText(doc, item.index, cleanText)
          logActivity(cardId, taskId, 'title', item.text, cleanText)
        }
        if (patch.status !== undefined && (patch.status === 'done') !== item.checked) doc = applyTaskChecked(doc, item.index, patch.status === 'done')
        if (Object.keys(patch).length)
          db.update(s.taskMeta)
            .set({ ...patch, updatedAt: t })
            .where(and(eq(s.taskMeta.cardId, cardId), eq(s.taskMeta.taskId, taskId)))
            .run()
        if (doc !== card.content) {
          taskSyncSuppressed = true
          try {
            api.updateCard({ id: cardId, content: doc })
          } finally {
            taskSyncSuppressed = false
          }
        }
      })
      onChange('cards')
      return requireTask(cardId, taskId)
    },

    listTaskActivity(cardId, taskId) {
      return db
        .select()
        .from(s.taskActivity)
        .where(and(eq(s.taskActivity.cardId, cardId), eq(s.taskActivity.taskId, taskId)))
        .orderBy(s.taskActivity.createdAt)
        .all()
        .map(
          (r): TaskActivity => ({
            id: r.id,
            cardId: r.cardId,
            taskId: r.taskId,
            actor: authorRef(r.actorProfileId),
            kind: r.kind as TaskActivityKind,
            from: r.fromValue,
            to: r.toValue,
            createdAt: r.createdAt
          })
        )
    },

    // ---------- task comments ----------
    listTaskComments(cardId, taskId) {
      const rows = db
        .select()
        .from(s.taskComments)
        .where(and(eq(s.taskComments.cardId, cardId), eq(s.taskComments.taskId, taskId)))
        .orderBy(s.taskComments.createdAt)
        .all()
      return rows.map((r) => toTaskComment(r, filesForComment(r.id)))
    },

    addTaskComment({ cardId, taskId, body, fileIds = [] }) {
      const t = now()
      const authorId = ensureActiveProfile().id
      const row = { id: nanoid(), cardId, taskId, body: body ?? '', authorId, createdAt: t, updatedAt: t }
      tx(() => {
        db.insert(s.taskComments).values(row).run()
        for (const fileId of fileIds) db.insert(s.taskCommentFiles).values({ commentId: row.id, fileId }).run()
      })
      onChange('cards')
      return toTaskComment(row, filesForComment(row.id))
    },

    updateTaskComment({ id, body }) {
      requireOwnComment(id)
      db.update(s.taskComments).set({ body, updatedAt: now() }).where(eq(s.taskComments.id, id)).run()
      onChange('cards')
      const row = db.select().from(s.taskComments).where(eq(s.taskComments.id, id)).get()
      if (!row) throw new Error(`Task comment not found: ${id}`)
      return toTaskComment(row, filesForComment(id))
    },

    deleteTaskComment(id) {
      if (!db.select().from(s.taskComments).where(eq(s.taskComments.id, id)).get()) return
      requireOwnComment(id)
      db.delete(s.taskComments).where(eq(s.taskComments.id, id)).run()
      onChange('cards')
    },

    // ---------- profiles ----------
    listProfiles() {
      return db.select().from(s.profiles).orderBy(s.profiles.createdAt).all().map(toProfile)
    },

    createProfile({ name, email, color, avatarFileId }) {
      const n = name.trim()
      if (!n) throw new Error('Profile name is required')
      checkAvatar(avatarFileId)
      const t = now()
      const count = sql.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }
      const row = {
        id: nanoid(),
        name: n,
        email: cleanEmail(email) ?? null,
        avatarFileId: avatarFileId ?? null,
        color: cleanColor(color) ?? TAG_COLORS.filter((c) => c !== 'gray')[count.n % (TAG_COLORS.length - 1)],
        createdAt: t,
        updatedAt: t
      }
      db.insert(s.profiles).values(row).run()
      onChange('profiles')
      return toProfile(row)
    },

    updateProfile({ id, name, email, color, avatarFileId }) {
      if (!profileRow(id)) throw new Error(`Profile not found: ${id}`)
      const patch: Partial<typeof s.profiles.$inferInsert> = { updatedAt: now() }
      if (name !== undefined) {
        if (!name.trim()) throw new Error('Profile name is required')
        patch.name = name.trim()
      }
      if (email !== undefined) patch.email = cleanEmail(email)
      if (color !== undefined) patch.color = cleanColor(color)
      if (avatarFileId !== undefined) {
        checkAvatar(avatarFileId)
        patch.avatarFileId = avatarFileId
      }
      db.update(s.profiles).set(patch).where(eq(s.profiles.id, id)).run()
      onChange('profiles')
      return toProfile(profileRow(id)!)
    },

    deleteProfile(id) {
      if (!profileRow(id)) return
      if (ensureActiveProfile().id === id) throw new Error("Can't delete the active profile — switch to another profile first")
      const count = sql.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }
      if (count.n <= 1) throw new Error("Can't delete the last profile")
      db.delete(s.profiles).where(eq(s.profiles.id, id)).run()
      onChange('profiles')
    },

    getActiveProfile() {
      return ensureActiveProfile()
    },

    setActiveProfile(id) {
      const row = profileRow(id)
      if (!row) throw new Error(`Profile not found: ${id}`)
      profileStore.set(id)
      onChange('profiles')
      return toProfile(row)
    },

    // ---------- search ----------
    search(query, limit = 20, opts = {}) {
      const q = query.trim()
      const kind = opts.kind ?? (q ? 'all' : 'card')
      const kindWhere = kind === 'all' ? '' : `AND c.kind = '${cardKind(kind)}'`
      if (!q) {
        return summarize(
          sql
            .prepare(`SELECT c.id, c.kind, c.title, c.content_text AS contentText, c.color, c.icon, c.updated_at AS updatedAt FROM cards c WHERE c.deleted_at IS NULL ${kindWhere} ORDER BY c.updated_at DESC LIMIT ?`)
            .all(limit) as CardSummaryRow[]
        ).map((c): SearchHit => ({ id: c.id, title: c.title, snippet: c.excerpt.slice(0, 120), kind: 'card', cardKind: c.kind }))
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
              `SELECT c.id, c.kind AS cardKind, c.title, snippet(cards_fts, 1, '', '', '…', 16) AS snippet
               FROM cards_fts JOIN cards c ON c.rowid = cards_fts.rowid
               WHERE cards_fts MATCH ? AND c.deleted_at IS NULL ${kindWhere}
               ORDER BY bm25(cards_fts, 5.0, 1.0) LIMIT ?`
            )
            .all(fts, limit) as { id: string; cardKind: string; title: string; snippet: string }[]
        ).map((r) => ({ ...r, cardKind: cardKind(r.cardKind), kind: 'card' as const }))
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
    },

    // ---------- pdf highlights ----------
    listHighlights(fileId) {
      return db
        .select()
        .from(s.pdfHighlights)
        .where(eq(s.pdfHighlights.fileId, fileId))
        .all()
        .map(toHighlight)
        // page order, then top-to-bottom on the page
        .sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0))
    },
    createHighlight({ fileId, page, text, rects, color, note }) {
      if (!db.select().from(s.files).where(eq(s.files.id, fileId)).get()) throw new Error(`File not found: ${fileId}`)
      const at = now()
      const row = {
        id: nanoid(),
        fileId,
        page: Math.max(1, Math.round(page)),
        color: color ?? 'yellow',
        text,
        note: note ?? null,
        rects: JSON.stringify(rects ?? []),
        createdAt: at,
        updatedAt: at
      }
      db.insert(s.pdfHighlights).values(row).run()
      onChange('files')
      return toHighlight(row)
    },
    updateHighlight({ id, color, note }) {
      const row = db.select().from(s.pdfHighlights).where(eq(s.pdfHighlights.id, id)).get()
      if (!row) throw new Error(`Highlight not found: ${id}`)
      const next = { ...row, color: color ?? row.color, note: note === undefined ? row.note : note, updatedAt: now() }
      db.update(s.pdfHighlights).set(next).where(eq(s.pdfHighlights.id, id)).run()
      onChange('files')
      return toHighlight(next)
    },
    deleteHighlight(id) {
      db.delete(s.pdfHighlights).where(eq(s.pdfHighlights.id, id)).run()
      onChange('files')
    },
    purgeDeleted(olderThan) {
      const cutoff = now() - olderThan
      tx(() => {
        sql.prepare(`DELETE FROM whiteboard_objects WHERE kind = 'card' AND ref_id IN (SELECT id FROM cards WHERE deleted_at IS NOT NULL AND deleted_at < ?)`).run(cutoff)
        sql.prepare(`DELETE FROM cards WHERE deleted_at IS NOT NULL AND deleted_at < ?`).run(cutoff)
        sql.prepare(`DELETE FROM whiteboard_objects WHERE kind = 'whiteboard' AND ref_id IN (SELECT id FROM whiteboards WHERE deleted_at IS NOT NULL AND deleted_at < ?)`).run(cutoff)
        sql.prepare(`DELETE FROM whiteboards WHERE deleted_at IS NOT NULL AND deleted_at < ?`).run(cutoff)
      })
    },
    notify(scope) {
      onChange(scope)
    },
    getObject(id) {
      const row = db.select().from(s.whiteboardObjects).where(eq(s.whiteboardObjects.id, id)).get()
      return row ? toObject(row) : null
    }
  }

  return api
}

interface CardSummaryRow {
  id: string
  kind?: string
  title: string
  contentText: string
  color?: string | null
  icon?: string | null
  updatedAt: number
}
