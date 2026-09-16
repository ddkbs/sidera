import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { docToMarkdown, linkWikiRefs, markdownToDoc } from '@shared/doc'
import { todayISO } from '@shared/util'
import type { Services } from '../services'

const ok = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})

/** Builds an MCP server exposing CanvasCL's knowledge base. Every tool delegates to services. */
export type ToolCallListener = (tool: string, args: Record<string, unknown>) => void

export function createMcpServer(api: Services, version: string, onCall?: ToolCallListener): McpServer {
  /** Markdown → doc with [[Title]] resolved to card links (creates backlinks). */
  const toDoc = (markdown: string) =>
    linkWikiRefs(markdownToDoc(markdown), (title) => {
      const hit = api.search(title, 10).find((h) => h.kind === 'card' && h.title.toLowerCase() === title.toLowerCase())
      return hit?.id ?? null
    })

  const server = new McpServer(
    { name: 'canvascl', version },
    {
      instructions:
        'CanvasCL is a visual knowledge base. Cards hold Markdown-like notes, whiteboards arrange cards spatially, ' +
        'tags group cards and power kanban boards, and the journal has one card per day. ' +
        'Search before creating to avoid duplicate cards. Link other cards by writing [[Exact card title]] in Markdown — it becomes a real link with a backlink.'
    }
  )

  if (onCall) {
    // Report every tool invocation (for the in-app activity feed)
    const register = server.registerTool.bind(server) as (...a: unknown[]) => unknown
    ;(server as unknown as { registerTool: (...a: unknown[]) => unknown }).registerTool = (name, config, cb) =>
      register(name, config, (args: Record<string, unknown>, extra: unknown) => {
        onCall(name as string, args ?? {})
        return (cb as (a: unknown, e: unknown) => unknown)(args, extra)
      })
  }

  server.registerTool(
    'search_cards',
    {
      description: 'Full-text search over cards (title + content) and whiteboard names. Empty query returns recent cards.',
      inputSchema: { query: z.string(), limit: z.number().int().min(1).max(100).optional() },
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit }) => ok(api.search(query, limit ?? 20))
  )

  server.registerTool(
    'get_card',
    {
      description: 'Read a card as Markdown including tags, properties, backlinks and the whiteboards it appears on.',
      inputSchema: { card_id: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ card_id }) => {
      const card = api.getCard(card_id)
      if (!card) return { ...ok(`Card ${card_id} not found`), isError: true }
      const { content, contentText: _t, ...rest } = card
      return ok({ ...rest, markdown: docToMarkdown(content) })
    }
  )

  server.registerTool(
    'create_card',
    {
      description: 'Create a new card from Markdown. Optionally tag it (tags are created if missing).',
      inputSchema: { title: z.string(), markdown: z.string().default(''), tags: z.array(z.string()).optional() }
    },
    async ({ title, markdown, tags }) => {
      const tagIds = (tags ?? []).map((name) => api.createTag({ name }).id)
      const card = api.createCard({ title, content: toDoc(markdown), tagIds })
      return ok({ id: card.id, title: card.title })
    }
  )

  server.registerTool(
    'update_card',
    {
      description: 'Update a card title and/or replace its content with Markdown (mode=replace) or append Markdown (mode=append).',
      inputSchema: {
        card_id: z.string(),
        title: z.string().optional(),
        markdown: z.string().optional(),
        mode: z.enum(['replace', 'append']).default('append')
      }
    },
    async ({ card_id, title, markdown, mode }) => {
      const card = api.getCard(card_id)
      if (!card) return { ...ok(`Card ${card_id} not found`), isError: true }
      let content
      if (markdown !== undefined) {
        const next = toDoc(markdown)
        content = mode === 'replace' ? next : { ...card.content, content: [...(card.content.content ?? []), ...(next.content ?? [])] }
      }
      const updated = api.updateCard({ id: card_id, title, content })
      return ok({ id: updated.id, title: updated.title })
    }
  )

  server.registerTool(
    'list_tags',
    { description: 'List all tags.', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ok(api.listTags())
  )

  server.registerTool(
    'tag_card',
    {
      description: 'Add tags (by name, created if missing) to a card. Existing tags are kept.',
      inputSchema: { card_id: z.string(), tags: z.array(z.string()).min(1) }
    },
    async ({ card_id, tags }) => {
      const card = api.getCard(card_id)
      if (!card) return { ...ok(`Card ${card_id} not found`), isError: true }
      const ids = [...card.tags.map((t) => t.id), ...tags.map((name) => api.createTag({ name }).id)]
      api.setCardTags(card_id, ids)
      return ok('Tagged')
    }
  )

  const findTag = (tag: string) => api.listTags().find((x) => x.id === tag || x.name.toLowerCase() === tag.replace(/^#/, '').toLowerCase())

  server.registerTool(
    'list_cards',
    {
      description: 'List cards, optionally only those with a tag. With a tag, property values are included by property name.',
      inputSchema: { tag: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) },
      annotations: { readOnlyHint: true }
    },
    async ({ tag, limit }) => {
      const t = tag ? findTag(tag) : undefined
      if (tag && !t) return { ...ok(`Tag ${tag} not found`), isError: true }
      const props = t ? api.listProperties(t.id) : []
      return ok(
        api.listCards({ tagId: t?.id, limit }).map((c) => ({
          id: c.id,
          title: c.title,
          tags: c.tags.map((x) => x.name),
          ...(t && {
            properties: Object.fromEntries(
              props.map((p) => {
                const v = c.values?.[p.id] ?? null
                return [p.name, p.type === 'select' ? (p.options.find((o) => o.id === v)?.name ?? null) : v]
              })
            )
          })
        }))
      )
    }
  )

  server.registerTool(
    'create_property',
    {
      description: 'Add a property (database column) to a tag. For type=select pass option names.',
      inputSchema: {
        tag: z.string(),
        name: z.string(),
        type: z.enum(['select', 'text', 'number', 'date', 'checkbox']),
        options: z.array(z.string()).optional()
      }
    },
    async ({ tag, name, type, options }) => {
      const t = findTag(tag) ?? api.createTag({ name: tag })
      const colors = ['gray', 'blue', 'green', 'orange', 'purple', 'pink', 'red', 'teal', 'yellow']
      const prop = api.createProperty({
        tagId: t.id,
        name,
        type,
        options: (options ?? []).map((n, i) => ({ id: Math.random().toString(36).slice(2, 10), name: n, color: colors[i % colors.length] }))
      })
      return ok({ property_id: prop.id })
    }
  )

  server.registerTool(
    'set_card_property',
    {
      description: 'Set a property value on a card by property name (select values by option name). The card must have the tag.',
      inputSchema: { card_id: z.string(), tag: z.string(), property: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }
    },
    async ({ card_id, tag, property, value }) => {
      const t = findTag(tag)
      if (!t) return { ...ok(`Tag ${tag} not found`), isError: true }
      const p = api.listProperties(t.id).find((x) => x.name.toLowerCase() === property.toLowerCase() || x.id === property)
      if (!p) return { ...ok(`Property ${property} not found on #${t.name}`), isError: true }
      let v: unknown = value
      if (p.type === 'select' && value !== null) {
        const opt = p.options.find((o) => o.name.toLowerCase() === String(value).toLowerCase() || o.id === value)
        if (!opt) return { ...ok(`Option ${value} not found. Options: ${p.options.map((o) => o.name).join(', ')}`), isError: true }
        v = opt.id
      }
      api.setPropertyValue(card_id, p.id, v)
      return ok('Updated')
    }
  )

  server.registerTool(
    'list_whiteboards',
    { description: 'List all whiteboards with their parent ids (nesting).', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ok(api.listWhiteboards().map(({ id, name, parentId }) => ({ id, name, parentId })))
  )

  server.registerTool(
    'get_whiteboard',
    {
      description: 'Get a whiteboard with its objects (cards, text, sections, nested boards) and connections.',
      inputSchema: { whiteboard_id: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ whiteboard_id }) => {
      const wb = api.getWhiteboard(whiteboard_id)
      if (!wb) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      return ok({
        ...wb,
        objects: wb.objects.map((o) => ({ ...o, title: o.kind === 'card' && o.refId ? wb.cards[o.refId]?.title : undefined })),
        cards: undefined
      })
    }
  )

  server.registerTool(
    'create_whiteboard',
    {
      description: 'Create a whiteboard. If parent_id is given it is nested and placed on the parent board.',
      inputSchema: { name: z.string(), parent_id: z.string().optional() }
    },
    async ({ name, parent_id }) => {
      const wb = api.createWhiteboard({ name, parentId: parent_id ?? null })
      if (parent_id) api.addObject({ whiteboardId: parent_id, kind: 'whiteboard', refId: wb.id, ...freeSpot(api, parent_id) })
      return ok({ id: wb.id, name: wb.name })
    }
  )

  server.registerTool(
    'add_card_to_whiteboard',
    {
      description: 'Place an existing card on a whiteboard. Without x/y it is placed right of existing content.',
      inputSchema: {
        card_id: z.string(),
        whiteboard_id: z.string(),
        x: z.number().optional(),
        y: z.number().optional()
      }
    },
    async ({ card_id, whiteboard_id, x, y }) => {
      if (!api.getCard(card_id)) return { ...ok(`Card ${card_id} not found`), isError: true }
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const obj = api.addObject({ whiteboardId: whiteboard_id, kind: 'card', refId: card_id, ...pos })
      return ok({ object_id: obj.id })
    }
  )

  server.registerTool(
    'add_section',
    {
      description: 'Add a colored section (group frame) to a whiteboard.',
      inputSchema: {
        whiteboard_id: z.string(),
        title: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number().default(640),
        height: z.number().default(420),
        color: z.enum(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']).default('blue')
      }
    },
    async ({ whiteboard_id, title, color, ...rect }) =>
      ok({ object_id: api.addObject({ whiteboardId: whiteboard_id, kind: 'section', color, data: { title }, ...rect }).id })
  )

  server.registerTool(
    'connect_objects',
    {
      description: 'Draw an arrow between two objects on the same whiteboard (object ids from get_whiteboard).',
      inputSchema: { whiteboard_id: z.string(), source_object_id: z.string(), target_object_id: z.string(), label: z.string().optional() }
    },
    async ({ whiteboard_id, source_object_id, target_object_id, label }) =>
      ok({ connection_id: api.addConnection({ whiteboardId: whiteboard_id, sourceId: source_object_id, targetId: target_object_id, label }).id })
  )

  server.registerTool(
    'get_kanban',
    {
      description: 'Kanban board for a tag, grouped by its first select property (a Status property is created if missing).',
      inputSchema: { tag: z.string().describe('tag name or id') },
      annotations: { readOnlyHint: true }
    },
    async ({ tag }) => {
      const t = api.listTags().find((x) => x.id === tag || x.name.toLowerCase() === tag.toLowerCase())
      if (!t) return { ...ok(`Tag ${tag} not found`), isError: true }
      const board = api.getKanban(t.id)!
      return ok({
        tag: board.tag.name,
        property_id: board.property.id,
        columns: board.columns.map((c) => ({
          option_id: c.option?.id ?? null,
          name: c.option?.name ?? 'No status',
          cards: c.cards.map(({ id, title }) => ({ id, title }))
        }))
      })
    }
  )

  server.registerTool(
    'move_kanban_item',
    {
      description: 'Move a card to a kanban column (option_id from get_kanban, null = no value) at an index.',
      inputSchema: {
        card_id: z.string(),
        property_id: z.string(),
        option_id: z.string().nullable(),
        index: z.number().int().min(0).default(0)
      }
    },
    async ({ card_id, property_id, option_id, index }) => {
      api.moveKanbanItem({ cardId: card_id, propertyId: property_id, optionId: option_id, index })
      return ok('Moved')
    }
  )

  server.registerTool(
    'get_journal',
    {
      description: 'Read the journal card for a date (YYYY-MM-DD, default today) as Markdown.',
      inputSchema: { date: z.string().optional() },
      annotations: { readOnlyHint: true }
    },
    async ({ date }) => {
      const day = api.getJournal(date ?? todayISO())
      return ok({ date: day.date, card_id: day.card.id, markdown: docToMarkdown(day.card.content) })
    }
  )

  server.registerTool(
    'append_to_journal',
    {
      description: 'Append Markdown to the journal of a date (default today).',
      inputSchema: { markdown: z.string(), date: z.string().optional() }
    },
    async ({ markdown, date }) => {
      const day = api.getJournal(date ?? todayISO())
      const next = toDoc(markdown)
      api.updateCard({ id: day.card.id, content: { ...day.card.content, content: [...(day.card.content.content ?? []), ...(next.content ?? [])] } })
      return ok({ card_id: day.card.id })
    }
  )

  return server
}

function freeSpot(api: Services, whiteboardId: string): { x: number; y: number } {
  const wb = api.getWhiteboard(whiteboardId)
  if (!wb || !wb.objects.length) return { x: 0, y: 0 }
  const maxX = Math.max(...wb.objects.map((o) => o.x + o.width))
  const minY = Math.min(...wb.objects.map((o) => o.y))
  return { x: maxX + 60, y: minY }
}
