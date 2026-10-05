import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { docToMarkdown, linkWikiRefs, markdownToDoc } from '@shared/doc'
import { withSourceHeader } from '@shared/html'
import { CHART_DEFS, defaultChart, SHAPE_COLUMNS, vennRows, type ChartData, type ChartOptions, type ChartType } from '@shared/charts'
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@shared/types'
import { rowsFromMatrix, tableFromMatrix, tableToMatrix, TABLE_LIMITS, type TableData } from '@shared/tables'
import { APP_NAME } from '@shared/brand'
import type { Services } from '../services'
import { downloadImage, fetchPageForClip } from '../web'
import { SHAPE_KINDS, type ShapeKind } from '@shared/shapes'
import type { FileRecord, WhiteboardObject } from '@shared/types'
import { nanoid } from 'nanoid'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'

const ok = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})

/** Compact description of a sketch object's data (element / image counts instead of the raw scene). */
function sketchSummary(data: Record<string, unknown>): Record<string, unknown> {
  const elements = Array.isArray(data.elements) ? (data.elements as { type?: unknown; isDeleted?: unknown }[]).filter((e) => e && !e.isDeleted) : []
  return {
    elements: elements.length,
    images: elements.filter((e) => e.type === 'image').length,
    ...(data.frameless ? { frameless: true } : {}),
    ...(typeof data.rotation === 'number' ? { rotation: data.rotation } : {})
  }
}

const PALETTE = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const
const paletteColor = z.enum(PALETTE)
/** Ink/shape colours: a palette name, "black" (default ink) or a #hex colour. */
const inkColorSchema = z.string().regex(/^(black|gray|red|orange|yellow|green|teal|blue|purple|pink|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})$/, 'palette name, black or #hex')
const fail = (message: string) => ({ ...ok(message), isError: true })
const errorText = (e: unknown) => fail(String(e instanceof Error ? e.message : e))

/** Builds an MCP server exposing Sidera's knowledge base. Every tool delegates to services. */
export type ToolCallListener = (tool: string, args: Record<string, unknown>) => void

export interface McpServerOptions {
  /**
   * May `add_file` import by local `path`? External MCP clients (Claude Desktop/Code, stdio) act for the user on their
   * own machine, so yes; the in-app chat reads web search results and imported text, so a prompt injection could
   * otherwise pull arbitrary local files onto a board — it passes false.
   */
  localPaths?: boolean
}

export function createMcpServer(api: Services, version: string, onCall?: ToolCallListener, options: McpServerOptions = {}): McpServer {
  const { localPaths = true } = options
  /** Markdown → doc with [[Title]] resolved to card links (creates backlinks). */
  const toDoc = (markdown: string) =>
    linkWikiRefs(markdownToDoc(markdown), (title) => {
      const hit = api.search(title, 10).find((h) => h.kind === 'card' && h.title.toLowerCase() === title.toLowerCase())
      return hit?.id ?? null
    })

  const server = new McpServer(
    { name: 'sidera', version },
    {
      instructions:
        `${APP_NAME} is a local-first visual notes app. Whiteboards are the main surface: text boxes (the one text element — ` +
        'plain or framed, any size and font size), tables, charts (also linked to a table), Mermaid diagrams, mindmaps, sections, ' +
        'shapes and pen ink, images/files, link previews, cards and nested whiteboards, joined by labelled connectors. ' +
        'Cards hold Markdown-like notes in a library; tags group cards and power kanban boards and tasks. ' +
        'Read a board with get_whiteboard (object ids, positions in board px, kinds and data) before editing it; ' +
        'add_* tools place new objects (without x/y right of existing content); update_objects moves/resizes/rotates/recolours/restacks; ' +
        'delete_objects removes objects and connectors; duplicate_objects copies them. ' +
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
      description:
        'Full-text search over cards (title + content), text blocks written on whiteboards, and whiteboard names. ' +
        'Hits carry card_kind "card" or "block". `kind` narrows card hits. Empty query returns recent cards.',
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        kind: z.enum(['card', 'block', 'all']).optional()
      },
      annotations: { readOnlyHint: true }
    },
    async ({ query, limit, kind }) =>
      ok(api.search(query, limit ?? 20, kind ? { kind } : undefined).map(({ cardKind, ...h }) => (cardKind ? { ...h, card_kind: cardKind } : h)))
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
      description:
        'Update a card: title, content as Markdown (mode=replace or append), color (palette name) and icon (an emoji like "🚀"; null removes). ' +
        'For text boxes on whiteboards use update_text_block (by object id).',
      inputSchema: {
        card_id: z.string(),
        title: z.string().optional(),
        markdown: z.string().optional(),
        mode: z.enum(['replace', 'append']).default('append'),
        color: paletteColor.nullable().optional(),
        icon: z.string().max(16).nullable().optional()
      }
    },
    async ({ card_id, title, markdown, mode, color, icon }) => {
      const card = api.getCard(card_id)
      if (!card) return { ...ok(`Card ${card_id} not found`), isError: true }
      let content
      if (markdown !== undefined) {
        const next = toDoc(markdown)
        content = mode === 'replace' ? next : { ...card.content, content: [...(card.content.content ?? []), ...(next.content ?? [])] }
      }
      const updated = api.updateCard({ id: card_id, title, content, color, icon })
      return ok({ id: updated.id, title: updated.title })
    }
  )

  server.registerTool(
    'clip_url',
    {
      description: 'Fetch a web page and save its readable content as a new card (Markdown), tagged with the given tags.',
      inputSchema: { url: z.string(), tags: z.array(z.string()).optional() }
    },
    async ({ url, tags }) => {
      const { title, markdown } = await fetchPageForClip(url)
      const tagIds = (tags ?? []).map((name) => api.createTag({ name }).id)
      const card = api.createCard({ title, markdown: withSourceHeader(url, markdown), tagIds })
      return ok({ id: card.id, title: card.title })
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
      description:
        'List cards, optionally only those with a tag. With a tag, property values are included by property name. ' +
        'Text blocks (notes written directly on whiteboards) are left out unless kind is "block" or "all" (with a tag, all kinds are listed).',
      inputSchema: {
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        kind: z.enum(['card', 'block', 'all']).optional()
      },
      annotations: { readOnlyHint: true }
    },
    async ({ tag, limit, kind }) => {
      const t = tag ? findTag(tag) : undefined
      if (tag && !t) return { ...ok(`Tag ${tag} not found`), isError: true }
      const props = t ? api.listProperties(t.id) : []
      return ok(
        api.listCards({ tagId: t?.id, limit, kind }).map((c) => ({
          id: c.id,
          title: c.title,
          ...(c.kind === 'block' ? { kind: 'block' } : {}),
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
    {
      description: 'List all whiteboards with their parent ids (nesting) and sidebar folder id.',
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    async () => ok(api.listWhiteboards().map(({ id, name, parentId, folderId }) => ({ id, name, parentId, folderId })))
  )

  server.registerTool(
    'list_folders',
    { description: 'List all sidebar folders (used to organize whiteboards), with their parent ids (nesting).', inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => ok(api.listFolders())
  )

  server.registerTool(
    'create_folder',
    {
      description: 'Create a sidebar folder to organize whiteboards. If parent_id is given it is nested inside that folder.',
      inputSchema: { name: z.string(), parent_id: z.string().optional() }
    },
    async ({ name, parent_id }) => ok(api.createFolder({ name, parentId: parent_id ?? null }))
  )

  server.registerTool(
    'move_whiteboard_to_folder',
    {
      description: 'Move a whiteboard into a sidebar folder (folder_id from list_folders), or to the top level when folder_id is omitted/null.',
      inputSchema: { whiteboard_id: z.string(), folder_id: z.string().nullable().optional() }
    },
    async ({ whiteboard_id, folder_id }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      api.moveWhiteboardToFolder(whiteboard_id, folder_id ?? null)
      return ok('Moved')
    }
  )

  /**
   * Agent-friendly view of an object: sketches summarised (their scenes can hold megabytes of photos), tables as
   * columns/rows, cards and text boxes with title + colour (text boxes also with their Markdown, capped at `maxText`).
   */
  const describeObject = (o: WhiteboardObject, maxText = 1500): Record<string, unknown> => {
    const base: Record<string, unknown> = { ...o }
    if (o.kind === 'sketch') base.data = sketchSummary(o.data)
    if (o.kind === 'table') base.data = { ...tableToMatrix(o.data as unknown as TableData), title: o.data.title }
    if (o.kind === 'card' && o.refId) {
      const card = api.getCard(o.refId)
      if (card) {
        base.card_id = card.id
        base.title = card.title
        base.card_kind = card.kind
        base.color = card.color
        if (card.kind === 'block') {
          const md = docToMarkdown(card.content)
          base.markdown = md.length > maxText ? md.slice(0, maxText) + '…' : md
        }
      }
    }
    return base
  }

  server.registerTool(
    'get_whiteboard',
    {
      description:
        'Get a whiteboard: its properties, objects and connections (connectors). Every object has id, kind, x/y/width/height (board px), z (stacking) and color; ' +
        'kind-specific details live in `data` (rotation in degrees; text boxes: style plain|framed, fontSize, minHeight + their markdown; sections: title; ' +
        'mermaid/mindmap: source; charts: chartType/columns/rows (source.tableId when linked to a table); tables: columns/rows; links: url; files: name/mime; ' +
        'sketches: element counts, frameless = shape or pen ink directly on the board). Card objects (kind "card") carry card_id, title and card_kind ("block" = text box).',
      inputSchema: { whiteboard_id: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ whiteboard_id }) => {
      const wb = api.getWhiteboard(whiteboard_id)
      if (!wb) return fail(`Whiteboard ${whiteboard_id} not found`)
      return ok({ ...wb, objects: wb.objects.map((o) => describeObject(o)), cards: undefined })
    }
  )

  server.registerTool(
    'get_object',
    {
      description: 'Read one whiteboard object in full (e.g. the complete Markdown of a text box, a whole table, chart or diagram source). Same shape as the objects of get_whiteboard.',
      inputSchema: { object_id: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ object_id }) => {
      const o = api.getObject(object_id)
      if (!o) return fail(`Object ${object_id} not found`)
      return ok(describeObject(o, Infinity))
    }
  )

  server.registerTool(
    'create_whiteboard',
    {
      description:
        'Create a whiteboard. If parent_id is given it is nested and placed on the parent board. ' +
        'folder_id (from list_folders) files it into a sidebar folder.',
      inputSchema: { name: z.string(), parent_id: z.string().optional(), folder_id: z.string().optional() }
    },
    async ({ name, parent_id, folder_id }) => {
      const wb = api.createWhiteboard({ name, parentId: parent_id ?? null, folderId: folder_id ?? null })
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
    'add_text_block',
    {
      description:
        'Write a text box directly on a whiteboard — the one text element on boards and the everyday way to take notes ' +
        '(titles, history, key facts, lists, ideas). Markdown supports headings (use "# Title" for a board title), lists, ' +
        'task lists, bold/italic, tables and [[Card title]] links. A text box is a lightweight card (searchable, linkable) ' +
        'that stays out of the card library. style "plain" = no frame (text directly on the board), "framed" = bordered box. ' +
        'width/height set the box size (the height grows with the text if needed); font_size (px, default 14.5) scales the text; ' +
        'color tints the text (and the frame); rotation in degrees. Without x/y it is placed right of existing content. ' +
        'Change it later with update_text_block.',
      inputSchema: {
        whiteboard_id: z.string(),
        markdown: z.string(),
        style: z.enum(['plain', 'framed']).default('plain'),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().min(40).max(1600).optional(),
        height: z.number().min(20).max(4000).optional(),
        font_size: z.number().min(6).max(160).optional(),
        color: paletteColor.optional(),
        rotation: z.number().optional()
      }
    },
    async ({ whiteboard_id, markdown, style, x, y, width, height, font_size, color, rotation }) => {
      if (!api.getWhiteboard(whiteboard_id)) return fail(`Whiteboard ${whiteboard_id} not found`)
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const { card, object } = api.addTextBlock({ whiteboardId: whiteboard_id, content: toDoc(markdown), style, width, height, fontSize: font_size, ...pos })
      if (color || rotation) api.editObjects([{ id: object.id, color, rotation }])
      return ok({ object_id: object.id, card_id: card.id, title: card.title })
    }
  )

  server.registerTool(
    'update_text_block',
    {
      description:
        'Change a text box (object id from get_whiteboard / add_text_block): its Markdown (mode replace or append), style (plain = no frame, framed = bordered box), ' +
        'font_size (px), width, min_height (the box never gets shorter than this; it still grows with its text) and text colour (null = default). ' +
        'Move, rotate or restack it with update_objects.',
      inputSchema: {
        object_id: z.string(),
        markdown: z.string().optional(),
        mode: z.enum(['replace', 'append']).default('replace'),
        style: z.enum(['plain', 'framed']).optional(),
        font_size: z.number().min(6).max(160).optional(),
        width: z.number().min(40).max(1600).optional(),
        min_height: z.number().min(0).max(4000).optional(),
        color: paletteColor.nullable().optional()
      }
    },
    async ({ object_id, markdown, mode, style, font_size, width, min_height, color }) => {
      const obj = api.getObject(object_id)
      const card = obj?.kind === 'card' && obj.refId ? api.getCard(obj.refId) : null
      if (!obj || card?.kind !== 'block') return fail(`Text box ${object_id} not found (regular cards are changed with update_card)`)
      if (markdown !== undefined) {
        const next = toDoc(markdown)
        const content = mode === 'replace' ? next : { ...card.content, content: [...(card.content.content ?? []), ...(next.content ?? [])] }
        api.updateCard({ id: card.id, content })
      }
      const data: Record<string, unknown> = {}
      if (style) data.style = style
      if (font_size !== undefined) data.fontSize = font_size
      if (min_height !== undefined) data.minHeight = min_height || null
      const lines = markdown !== undefined ? Math.max(1, api.getCard(card.id)!.contentText.split('\n').length) : 0
      // the app measures the real height; give the stored box a rough fit so other tools see a sensible size
      const fontScale = Number(font_size ?? obj.data.fontSize ?? 14.5) / 14.5
      const minH = Number(min_height ?? obj.data.minHeight ?? 0)
      const height = lines ? Math.max(minH, Math.min(40 + lines * 24 * fontScale, 4000)) : min_height !== undefined ? Math.max(min_height, obj.height) : undefined
      api.editObjects([{ id: object_id, width, height, color, data }])
      const after = api.getCard(card.id)!
      return ok({ object_id, card_id: card.id, title: after.title })
    }
  )

  server.registerTool(
    'add_section',
    {
      description:
        'Add a coloured section (titled frame that groups what lies on it) to a whiteboard. Pass object_ids to wrap those objects ' +
        '(like the Group action — position and size are computed), or x/y/width/height for an empty section. Sections sit behind other objects.',
      inputSchema: {
        whiteboard_id: z.string(),
        title: z.string(),
        object_ids: z.array(z.string()).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().default(640),
        height: z.number().default(420),
        color: paletteColor.default('blue')
      }
    },
    async ({ whiteboard_id, title, object_ids, color, x, y, width, height }) => {
      if (!api.getWhiteboard(whiteboard_id)) return fail(`Whiteboard ${whiteboard_id} not found`)
      try {
        if (object_ids?.length) return ok({ object_id: api.groupObjects({ whiteboardId: whiteboard_id, objectIds: object_ids, title, color }).id })
        const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
        return ok({ object_id: api.addObject({ whiteboardId: whiteboard_id, kind: 'section', color, data: { title }, ...pos, width, height }).id })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  server.registerTool(
    'organize_board',
    {
      description:
        'Reorganize a whiteboard into meaningful colored sections. Call get_whiteboard first to see every object and its id, ' +
        'then group the objects by topic into 3-7 groups with short titles, then call this tool with those groups (object ids ' +
        'must come from get_whiteboard). Objects left out of every group are gathered into an unsorted area below the sections. ' +
        'By default any sections already on the board are removed first.',
      inputSchema: {
        whiteboard_id: z.string(),
        groups: z
          .array(
            z.object({
              title: z.string(),
              color: paletteColor.optional(),
              object_ids: z.array(z.string()).min(1)
            })
          )
          .min(1),
        remove_existing_sections: z.boolean().default(true)
      }
    },
    async ({ whiteboard_id, groups, remove_existing_sections }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      const result = api.organizeBoard({
        whiteboardId: whiteboard_id,
        groups: groups.map((g) => ({ title: g.title, color: g.color, objectIds: g.object_ids })),
        removeExistingSections: remove_existing_sections
      })
      return ok(result)
    }
  )

  server.registerPrompt(
    'organize-board',
    {
      title: 'Organize a whiteboard',
      description: 'Read a whiteboard and reorganize its objects into meaningful, titled, colored sections.',
      argsSchema: { whiteboard: z.string().describe('Whiteboard name or id') }
    },
    ({ whiteboard }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Organize the whiteboard "${whiteboard}". Find it with list_whiteboards if you only have a name, then call get_whiteboard to read ` +
              'all of its objects and their ids. Group the objects by topic into 3-7 meaningful sections with short (1-3 word) titles — ' +
              'do not leave obviously related objects out of a group. Then call organize_board with those groups, using object ids exactly ' +
              'as returned by get_whiteboard. Finally, summarize what you did in a short list: each section title with its object count, ' +
              'and how many objects (if any) ended up unsorted.'
          }
        }
      ]
    })
  )

  // ---------- charts & diagrams ----------
  const chartTypes = Object.keys(CHART_DEFS) as [ChartType, ...ChartType[]]
  const shapeDocs = chartTypes
    .map((type) => {
      const def = CHART_DEFS[type]
      const cols = def.fixedColumns ? def.fixedColumns.join(' | ') : 'Label | Series 1 | Series 2 | … (you name the series columns)'
      return `- ${type} (${def.label}): columns ${cols}`
    })
    .join('\n')
  const cell = z.union([z.string(), z.number(), z.null()])
  const optionsSchema = z
    .object({
      legend: z.boolean().optional(),
      stacked: z.boolean().optional(),
      smooth: z.boolean().optional(),
      lineSeries: z.array(z.number().int().min(0)).optional().describe('combo: 0-based indexes of value columns drawn as lines'),
      xAxis: z.tuple([z.string(), z.string()]).optional().describe('matrix: [low label, high label]'),
      yAxis: z.tuple([z.string(), z.string()]).optional().describe('matrix: [low label, high label]'),
      quadrants: z.tuple([z.string(), z.string(), z.string(), z.string()]).optional().describe('matrix: [top-left, top-right, bottom-left, bottom-right]'),
      sets: z.union([z.literal(2), z.literal(3)]).optional().describe('venn: number of sets'),
      scheme: z.enum(['blue', 'green', 'orange', 'purple']).optional().describe('heatmap colour'),
      xAxisTitle: z.string().optional().describe('axis charts (column, bar, line, area, combo, scatter, bubble): title centred under the X axis; "" removes it'),
      yAxisTitle: z.string().optional().describe('axis charts: title rotated left of the Y axis; "" removes it'),
      hideGrid: z.boolean().optional().describe('axis charts: no grid lines'),
      hideAxisValues: z.boolean().optional().describe('axis charts: no numbers/category names on the axes (custom ticks still show) — for schematic curves'),
      yTicks: z
        .array(z.object({ value: z.number(), label: z.string() }))
        .optional()
        .describe('own labels on the value axis at given values instead of numbers, e.g. [{value:-50,label:"Investition"},{value:0,label:"Break-even"},{value:80,label:"Gewinn"}]'),
      xTicks: z.array(z.object({ value: z.string(), label: z.string() })).optional().describe('own labels on the X axis at given categories (first-column values)'),
      curve: z.enum(['linear', 'monotone', 'spline']).optional().describe('line/area/combo curve: linear = straight segments, monotone = smooth, spline = round Catmull-Rom through every point (J-curves, schematic curves). Overrides smooth'),
      hideArea: z.boolean().optional().describe('area: line only, no fill'),
      hideDots: z.boolean().optional().describe('line/combo: no point dots'),
      lineWidth: z.number().min(1).max(10).optional().describe('line/area/combo stroke width in px (default ~2)'),
      lineColor: z.string().max(40).optional().describe('CSS colour (e.g. "#e11d48") of the first series; "" = palette'),
      split: z
        .object({ value: z.number(), above: z.string().max(40), below: z.string().max(40) })
        .nullable()
        .optional()
        .describe('line/area/column (not stacked): colour the graph by Y value, e.g. {value:0, above:"#3b82f6", below:"#ef4444"} = everything under 0 red, above blue; null removes it'),
      markers: z
        .array(z.object({ x: z.string().describe('category (first-column value)'), y: z.number().optional().describe('defaults to the first series value there'), label: z.string() }))
        .optional()
        .describe('line/area/column: highlighted labelled points, e.g. [{x:"Jahr 3",label:"Break-even"}]')
    })
    .partial()

  // ---------- tables ----------
  const tableColumns = z
    .array(z.union([z.string(), z.object({ name: z.string(), type: z.enum(['text', 'number']).optional() })]))
    .max(TABLE_LIMITS.columns)
  const tableRows = z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(TABLE_LIMITS.rows)
  const describeTable = (id: string, t: TableData) => ({ object_id: id, columns: t.columns.map((c) => c.name), rows: t.rows.length })

  server.registerTool(
    'add_table',
    {
      description:
        'Add a table to a whiteboard (e.g. yearly revenue, key figures). `columns` are header names (or {name, type: "text"|"number"}), ' +
        '`rows` are arrays of cells in column order. Number columns are right-aligned and formatted; a chart can follow the table (add_chart with table_id).',
      inputSchema: {
        whiteboard_id: z.string(),
        columns: tableColumns,
        rows: tableRows.default([]),
        title: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional()
      }
    },
    async ({ whiteboard_id, columns, rows, title, x, y, width }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const table = tableFromMatrix(columns, rows, title)
      const obj = api.addObject({
        whiteboardId: whiteboard_id,
        kind: 'table',
        ...pos,
        width: width ?? Math.min(160 * Math.max(columns.length, 2), 900),
        height: 44 + 36 * (rows.length + 1),
        data: table as unknown as Record<string, unknown>
      })
      return ok(describeTable(obj.id, obj.data as unknown as TableData))
    }
  )

  server.registerTool(
    'update_table',
    {
      description:
        'Change a table (object id from get_whiteboard / add_table). `columns` + `rows` replace the whole table; `rows` alone replaces the rows and keeps the columns; ' +
        '`append_rows` adds rows at the end. Charts linked to the table update automatically.',
      inputSchema: {
        object_id: z.string(),
        title: z.string().optional(),
        columns: tableColumns.optional(),
        rows: tableRows.optional(),
        append_rows: tableRows.optional()
      }
    },
    async ({ object_id, title, columns, rows, append_rows }) => {
      const obj = api.getObject(object_id)
      if (!obj || obj.kind !== 'table') return { ...ok(`Table ${object_id} not found`), isError: true }
      const current = obj.data as unknown as TableData
      let next: TableData = { ...current }
      if (columns) next = { ...tableFromMatrix(columns, rows ?? tableToMatrix(current).rows), header: current.header }
      else if (rows) next = { ...current, rows: rowsFromMatrix(current.columns, rows) }
      if (append_rows) next = { ...next, rows: [...next.rows, ...rowsFromMatrix(next.columns, append_rows)] }
      if (title !== undefined) next.title = title
      const updated = api.updateTable(object_id, next)
      return ok(describeTable(object_id, updated.data as unknown as TableData))
    }
  )

  /** Build a valid chart table from agent input (fixed shapes keep their columns; cells become strings). */
  const buildChart = (base: ChartData, input: { chart_type?: ChartType; title?: string; columns?: string[]; rows?: (string | number | null)[][]; options?: ChartOptions }): ChartData => {
    const type = input.chart_type ?? base.chartType
    const typeChanged = type !== base.chartType
    const start = typeChanged && CHART_DEFS[type].shape !== CHART_DEFS[base.chartType].shape ? defaultChart(type) : { ...base, chartType: type }
    const fixed = CHART_DEFS[type].fixedColumns ?? SHAPE_COLUMNS[CHART_DEFS[type].shape]
    const columns = fixed ?? input.columns ?? start.columns
    let rows = input.rows ? input.rows.map((r) => columns.map((_, i) => (r[i] == null ? '' : String(r[i])))) : start.rows.map((r) => columns.map((_, i) => r[i] ?? ''))
    const options = { ...start.options, ...(input.options ?? {}) }
    if (type === 'venn') rows = vennRows(options.sets ?? 3, rows)
    return { chartType: type, title: input.title ?? start.title, columns, rows, options, ...(base.source ? { source: base.source } : {}) }
  }

  server.registerTool(
    'add_chart',
    {
      description:
        'Add a chart or structured diagram to a whiteboard. Every chart is a small table: `columns` (header) + `rows` (cells). ' +
        'Omit columns/rows to start from an example. Numbers may be given as numbers or strings. Table shapes per type:\n' +
        shapeDocs +
        '\nNotes: timeline dates use YYYY-MM-DD; matrix X/Y are 0–100; venn regions are A, B, C, A∩B, A∩C, B∩C, A∩B∩C (A/B/C rows hold the set names); sankey rows are flows From → To with a value.' +
        '\nWith table_id (a table object on the board) the chart is linked to that table: first text column = categories, number columns = series, and it updates whenever the table changes (column, bar, line, area, combo, radar, heatmap, pie, donut).',
      inputSchema: {
        whiteboard_id: z.string(),
        chart_type: z.enum(chartTypes),
        table_id: z.string().optional(),
        title: z.string().optional(),
        columns: z.array(z.string()).optional().describe('only for series charts (column, bar, line, area, combo, radar, heatmap)'),
        rows: z.array(z.array(cell)).optional(),
        options: optionsSchema.optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().optional(),
        height: z.number().optional()
      }
    },
    async ({ whiteboard_id, chart_type, table_id, title, columns, rows, options, x, y, width, height }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      if (table_id) {
        const table = api.getObject(table_id)
        if (!table || table.kind !== 'table' || table.whiteboardId !== whiteboard_id) return { ...ok(`Table ${table_id} not found on this whiteboard`), isError: true }
        let obj = api.chartFromTable({ tableId: table_id, chartType: chart_type })
        const patch: Record<string, unknown> = {}
        if (title !== undefined) patch.title = title
        if (options) patch.options = { ...(obj.data.options as object), ...options }
        const rect = { ...(x !== undefined && y !== undefined ? { x, y } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}) }
        if (Object.keys(patch).length || Object.keys(rect).length) {
          api.updateObjects([{ id: obj.id, ...rect, ...(Object.keys(patch).length ? { data: { ...obj.data, ...patch } } : {}) }])
          obj = api.getObject(obj.id)!
        }
        const chart = obj.data as unknown as ChartData
        return ok({ object_id: obj.id, chart_type: chart.chartType, columns: chart.columns, rows: chart.rows.length, linked_table_id: table_id })
      }
      const chart = buildChart(defaultChart(chart_type), { chart_type, title, columns, rows, options })
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const obj = api.addObject({ whiteboardId: whiteboard_id, kind: 'chart', ...pos, width, height, data: chart as unknown as Record<string, unknown> })
      return ok({ object_id: obj.id, chart_type: chart.chartType, columns: chart.columns, rows: chart.rows.length })
    }
  )

  server.registerTool(
    'update_chart',
    {
      description:
        'Change an existing chart (object id from get_whiteboard / add_chart): title, chart_type, columns, rows (replaces the whole table) and/or options (merged). ' +
        'Switching between types with the same table shape keeps the data (e.g. column ↔ line ↔ area ↔ combo ↔ radar ↔ heatmap, pie ↔ donut, scatter ↔ bubble). ' +
        'A chart linked to a table keeps following it; passing columns/rows or unlink=true detaches it.',
      inputSchema: {
        object_id: z.string(),
        chart_type: z.enum(chartTypes).optional(),
        title: z.string().optional(),
        columns: z.array(z.string()).optional(),
        rows: z.array(z.array(cell)).optional(),
        options: optionsSchema.optional(),
        unlink: z.boolean().optional()
      }
    },
    async ({ object_id, chart_type, title, columns, rows, options, unlink }) => {
      const obj = api.getObject(object_id)
      if (!obj || obj.kind !== 'chart') return { ...ok(`Chart ${object_id} not found`), isError: true }
      const current = obj.data as unknown as ChartData
      const base: ChartData = current.columns && current.rows ? { ...current, options: current.options ?? {} } : defaultChart(current.chartType ?? 'column')
      if (unlink || columns || rows) delete base.source
      const chart = buildChart(base, { chart_type, title, columns, rows, options })
      api.updateObjects([{ id: object_id, data: chart as unknown as Record<string, unknown> }])
      api.notify('whiteboards')
      return ok({ object_id, chart_type: chart.chartType, rows: chart.rows.length })
    }
  )

  server.registerTool(
    'add_mindmap',
    {
      description:
        'Add a mindmap to a whiteboard from an indented outline. First line = central topic, children indented by two spaces with "- ", e.g. "Launch\\n  - Marketing\\n    - Blog post\\n  - Product".',
      inputSchema: { whiteboard_id: z.string(), outline: z.string(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional() }
    },
    async ({ whiteboard_id, outline, x, y, width, height }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const obj = api.addObject({ whiteboardId: whiteboard_id, kind: 'mindmap', ...pos, width, height, data: { source: outline.trim() } })
      return ok({ object_id: obj.id })
    }
  )

  server.registerTool(
    'add_flowchart',
    {
      description: 'Add a Mermaid diagram (flowchart, sequence, gantt, …) to a whiteboard. Pass valid Mermaid source, e.g. "graph TD\\n  A[Idea] --> B[Plan]".',
      inputSchema: { whiteboard_id: z.string(), mermaid: z.string(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional() }
    },
    async ({ whiteboard_id, mermaid, x, y, width, height }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const obj = api.addObject({ whiteboardId: whiteboard_id, kind: 'mermaid', ...pos, width, height, data: { source: mermaid.trim() } })
      return ok({ object_id: obj.id })
    }
  )

  server.registerTool(
    'update_diagram',
    {
      description: 'Replace the source of an existing mindmap (indented outline) or Mermaid diagram (object id from get_whiteboard).',
      inputSchema: { object_id: z.string(), source: z.string() }
    },
    async ({ object_id, source }) => {
      const obj = api.getObject(object_id)
      if (!obj || (obj.kind !== 'mindmap' && obj.kind !== 'mermaid')) return { ...ok(`Mindmap or Mermaid diagram ${object_id} not found`), isError: true }
      api.updateObjects([{ id: object_id, data: { ...obj.data, source: source.trim() } }])
      api.notify('whiteboards')
      return ok({ object_id, kind: obj.kind })
    }
  )

  const lineStyle = z.enum(['solid', 'dashed'])
  const arrowEnds = z.enum(['none', 'end', 'both']).describe('none = plain line, end = arrow at the target, both = arrows at both ends')

  server.registerTool(
    'connect_objects',
    {
      description:
        'Draw a connector (arrow) between two objects on the same whiteboard (object ids from get_whiteboard), optionally with a label, ' +
        'colour, line style (solid/dashed) and arrow heads (default: arrow at the target). Change it with update_connection, remove it with delete_objects.',
      inputSchema: {
        whiteboard_id: z.string(),
        source_object_id: z.string(),
        target_object_id: z.string(),
        label: z.string().optional(),
        color: paletteColor.optional(),
        line_style: lineStyle.optional(),
        arrows: arrowEnds.optional()
      }
    },
    async ({ whiteboard_id, source_object_id, target_object_id, label, color, line_style, arrows }) => {
      for (const id of [source_object_id, target_object_id]) {
        if (api.getObject(id)?.whiteboardId !== whiteboard_id) return fail(`Object ${id} is not on whiteboard ${whiteboard_id}`)
      }
      const conn = api.addConnection({ whiteboardId: whiteboard_id, sourceId: source_object_id, targetId: target_object_id, label })
      if (color || line_style || arrows) api.updateConnection({ id: conn.id, color, lineStyle: line_style, arrows })
      return ok({ connection_id: conn.id })
    }
  )

  server.registerTool(
    'update_connection',
    {
      description: 'Change a connector (connection id from get_whiteboard / connect_objects): label (empty string removes it), colour (null = default), line style and arrow heads.',
      inputSchema: {
        connection_id: z.string(),
        label: z.string().optional(),
        color: paletteColor.nullable().optional(),
        line_style: lineStyle.optional(),
        arrows: arrowEnds.optional()
      }
    },
    async ({ connection_id, label, color, line_style, arrows }) => {
      api.updateConnection({ id: connection_id, label, color, lineStyle: line_style, arrows })
      return ok({ connection_id })
    }
  )

  // ---------- shapes, ink, links, files ----------
  server.registerTool(
    'add_shape',
    {
      description:
        'Add a shape to a whiteboard (like the Shapes insert menu): ' + SHAPE_KINDS.join(', ') + '. ' +
        'Shapes are native Excalidraw drawings placed directly on the board (lines and curves get draggable points in the app; double-click opens the editor). ' +
        'width/height stretch the shape (default ~120 px wide); stroke_color and fill_color (rectangle/ellipse/diamond) take a palette name, "black" or #hex; ' +
        'stroke_width in px (default 2); rotation in degrees. To put text in or next to a shape, add a text box on top of it (add_text_block).',
      inputSchema: {
        whiteboard_id: z.string(),
        shape: z.enum(SHAPE_KINDS as unknown as [ShapeKind, ...ShapeKind[]]),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().min(4).max(4000).optional(),
        height: z.number().min(4).max(4000).optional(),
        stroke_color: inkColorSchema.optional(),
        fill_color: inkColorSchema.optional(),
        stroke_width: z.number().min(0.5).max(40).optional(),
        rotation: z.number().optional()
      }
    },
    async ({ whiteboard_id, shape, x, y, width, height, stroke_color, fill_color, stroke_width, rotation }) => {
      if (!api.getWhiteboard(whiteboard_id)) return fail(`Whiteboard ${whiteboard_id} not found`)
      const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
      const obj = api.addShape({ whiteboardId: whiteboard_id, shape, ...pos, width, height, strokeColor: stroke_color, fillColor: fill_color, strokeWidth: stroke_width })
      if (rotation) api.editObjects([{ id: obj.id, rotation }])
      return ok({ object_id: obj.id, x: obj.x, y: obj.y, width: obj.width, height: obj.height })
    }
  )

  server.registerTool(
    'add_ink',
    {
      description:
        'Draw pen ink on a whiteboard (like pen mode): freehand strokes given as point lists in board coordinates (px), e.g. to underline, circle or ' +
        'annotate objects using their x/y/width/height from get_whiteboard. Each stroke: points [[x,y],…] (2+ points, densely sampled for curves), ' +
        'color (palette name, "black" or #hex), width (pen diameter px: 2.5 fine, 4.5 normal, 8 bold; highlighter ≈ 20 with opacity 0.35), opacity 0–1. ' +
        'All strokes of one call become one ink object.',
      inputSchema: {
        whiteboard_id: z.string(),
        strokes: z
          .array(
            z.object({
              points: z.array(z.tuple([z.number(), z.number()])).min(1).max(2000),
              color: inkColorSchema.optional(),
              width: z.number().min(0.5).max(60).optional(),
              opacity: z.number().min(0.05).max(1).optional()
            })
          )
          .min(1)
          .max(200)
      }
    },
    async ({ whiteboard_id, strokes }) => {
      try {
        const obj = api.addInk({ whiteboardId: whiteboard_id, strokes })
        return ok({ object_id: obj.id, x: obj.x, y: obj.y, width: obj.width, height: obj.height })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  server.registerTool(
    'add_link',
    {
      description: 'Add a web link preview (title, image and site name are fetched by the app) to a whiteboard. To save the page content as a card use clip_url instead.',
      inputSchema: { whiteboard_id: z.string(), url: z.string(), x: z.number().optional(), y: z.number().optional(), width: z.number().optional(), height: z.number().optional() }
    },
    async ({ whiteboard_id, url, x, y, width, height }) => {
      try {
        const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
        return ok({ object_id: api.addLink({ whiteboardId: whiteboard_id, url, ...pos, width, height }).id })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  server.registerTool(
    'add_file',
    {
      description:
        'Put an image or document on a whiteboard. Exactly one source: `path` (absolute local path; png, jpg, gif, webp, svg, pdf, md, txt), ' +
        '`url` (an http(s) image, downloaded once) or `data_base64` + `mime` (png, jpeg, gif, webp, bmp, heic, pdf, markdown, plain text). Max 25 MB. ' +
        'Images keep their aspect ratio (height follows width); PDFs open in the app viewer. rotation in degrees.',
      inputSchema: {
        whiteboard_id: z.string(),
        path: z.string().optional(),
        url: z.string().optional(),
        data_base64: z.string().optional(),
        mime: z.string().optional(),
        name: z.string().max(200).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().min(40).max(4000).optional(),
        height: z.number().min(40).max(4000).optional(),
        rotation: z.number().optional()
      }
    },
    async ({ whiteboard_id, path, url, data_base64, mime, name, x, y, width, height, rotation }) => {
      if (!api.getWhiteboard(whiteboard_id)) return fail(`Whiteboard ${whiteboard_id} not found`)
      if ([path, url, data_base64].filter((v) => v !== undefined).length !== 1) return fail('Pass exactly one of path, url or data_base64')
      try {
        let file: FileRecord
        if (path !== undefined) {
          if (!localPaths) return fail('Importing local files by path is not available in the in-app chat. Use url or data_base64, or drop the file onto the board.')
          const full = path.startsWith('~/') ? homedir() + path.slice(1) : path
          if (!isAbsolute(full)) return fail('path must be absolute')
          file = api.importFileFromPath(full)
        } else if (url !== undefined) {
          const img = await downloadImage(url)
          // remote SVGs are not imported (they are documents that may carry script)
          if (!img || img.mime === 'image/svg+xml') return fail(`Could not download an image from ${url}`)
          const base = name ?? (decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || 'image')
          const fileName = base.replace(/\.[a-z0-9]{1,5}$/i, '') + img.ext
          file = api.importFileBytes({ name: fileName, mime: img.mime, bytes: img.bytes })
        } else {
          if (!mime) return fail('mime is required with data_base64')
          file = api.importFileBytes({ name, mime, bytes: Buffer.from(data_base64!, 'base64') })
        }
        const pos = x !== undefined && y !== undefined ? { x, y } : freeSpot(api, whiteboard_id)
        const obj = api.addFileObject({ whiteboardId: whiteboard_id, fileId: file.id, ...pos, width, height })
        if (rotation) api.editObjects([{ id: obj.id, rotation }])
        return ok({ object_id: obj.id, file_id: file.id, name: file.name, mime: file.mime, size: file.size })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  // ---------- editing objects ----------
  server.registerTool(
    'update_objects',
    {
      description:
        'Move, resize, rotate, recolour or restack whiteboard objects (ids from get_whiteboard) — one entry per object, only the given fields change. ' +
        'x/y/width/height in board px; rotation in degrees (text boxes, images/files, shapes/ink); ' +
        'color: palette name or null — for cards and text boxes it tints the card, for shapes and ink it recolours the strokes, for sections the frame; ' +
        'order "front"/"back" restacks; title renames a section. Content is changed with the kind-specific tools ' +
        '(update_text_block, update_card, update_table, update_chart, update_diagram).',
      inputSchema: {
        objects: z
          .array(
            z.object({
              object_id: z.string(),
              x: z.number().optional(),
              y: z.number().optional(),
              width: z.number().min(10).optional(),
              height: z.number().min(10).optional(),
              rotation: z.number().optional(),
              color: paletteColor.nullable().optional(),
              order: z.enum(['front', 'back']).optional(),
              title: z.string().optional().describe('sections only')
            })
          )
          .min(1)
          .max(500)
      }
    },
    async ({ objects }) => {
      for (const o of objects) {
        if (o.title !== undefined && api.getObject(o.object_id)?.kind !== 'section') return fail(`title can only be set on sections (${o.object_id})`)
      }
      try {
        const updated = api.editObjects(objects.map(({ object_id, title, ...rest }) => ({ id: object_id, ...rest, ...(title !== undefined ? { data: { title } } : {}) })))
        return ok(updated.map((o) => ({ object_id: o.id, x: o.x, y: o.y, width: o.width, height: o.height, z: o.z })))
      } catch (e) {
        return errorText(e)
      }
    }
  )

  server.registerTool(
    'delete_objects',
    {
      description:
        'Remove objects and/or connectors from whiteboards (ids from get_whiteboard). Connectors attached to removed objects go with them. ' +
        'Text boxes are deleted with their placement (their card stays restorable for 30 days); regular cards only leave the board — use delete_card to delete a card itself.',
      inputSchema: { object_ids: z.array(z.string()).optional(), connection_ids: z.array(z.string()).optional() },
      annotations: { destructiveHint: true }
    },
    async ({ object_ids, connection_ids }) => {
      if (!object_ids?.length && !connection_ids?.length) return fail('Pass object_ids and/or connection_ids')
      const res = api.deleteObjects({ objectIds: object_ids, connectionIds: connection_ids })
      return ok({ deleted_objects: res.objects, deleted_connections: res.connections })
    }
  )

  server.registerTool(
    'duplicate_objects',
    {
      description:
        'Copy objects on their whiteboard, offset by dx/dy (default 40/40). Text boxes get their own copy of the text, regular cards are placed again (same card), ' +
        'connectors between copied objects are copied too. Returns the new object ids in input order.',
      inputSchema: { object_ids: z.array(z.string()).min(1).max(200), dx: z.number().default(40), dy: z.number().default(40) }
    },
    async ({ object_ids, dx, dy }) => {
      try {
        return ok({ object_ids: api.duplicateObjects(object_ids, { x: dx, y: dy }).map((o) => o.id) })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  // ---------- whiteboards, folders, cards ----------
  server.registerTool(
    'update_whiteboard',
    {
      description:
        'Rename a whiteboard and/or set its properties (free-form key/value metadata like "Author" → "Jane"; the list replaces all properties, [] clears them). ' +
        'Move it between sidebar folders with move_whiteboard_to_folder.',
      inputSchema: {
        whiteboard_id: z.string(),
        name: z.string().min(1).optional(),
        properties: z.array(z.object({ key: z.string(), value: z.string() })).optional()
      }
    },
    async ({ whiteboard_id, name, properties }) => {
      const wb = api.getWhiteboard(whiteboard_id)
      if (!wb) return fail(`Whiteboard ${whiteboard_id} not found`)
      if (name !== undefined) api.updateWhiteboard({ id: whiteboard_id, name })
      if (properties) {
        const existing = new Map(wb.whiteboard.properties.map((p) => [p.key, p.id]))
        api.updateWhiteboardProperties(
          whiteboard_id,
          properties.map((p) => ({ id: existing.get(p.key) ?? nanoid(), key: p.key, value: p.value }))
        )
      }
      const after = api.getWhiteboard(whiteboard_id)!.whiteboard
      return ok({ id: after.id, name: after.name, properties: after.properties.map(({ key, value }) => ({ key, value })) })
    }
  )

  server.registerTool(
    'duplicate_whiteboard',
    {
      description: 'Copy a whiteboard (name + " copy", all objects and connectors; nested whiteboards are not copied).',
      inputSchema: { whiteboard_id: z.string() }
    },
    async ({ whiteboard_id }) => {
      try {
        const wb = api.duplicateWhiteboard(whiteboard_id)
        return ok({ id: wb.id, name: wb.name })
      } catch (e) {
        return errorText(e)
      }
    }
  )

  server.registerTool(
    'delete_whiteboard',
    {
      description: 'Delete a whiteboard (moved out of sight; restorable in the app for 30 days). Its placements on other boards are hidden meanwhile.',
      inputSchema: { whiteboard_id: z.string() },
      annotations: { destructiveHint: true }
    },
    async ({ whiteboard_id }) => {
      if (!api.getWhiteboard(whiteboard_id)) return fail(`Whiteboard ${whiteboard_id} not found`)
      api.deleteWhiteboard(whiteboard_id)
      return ok('Deleted')
    }
  )

  server.registerTool(
    'update_folder',
    {
      description: 'Rename a sidebar folder and/or move it into another folder (parent_id from list_folders; null = top level).',
      inputSchema: { folder_id: z.string(), name: z.string().min(1).optional(), parent_id: z.string().nullable().optional() }
    },
    async ({ folder_id, name, parent_id }) => {
      if (!api.listFolders().some((f) => f.id === folder_id)) return fail(`Folder ${folder_id} not found`)
      try {
        if (name !== undefined) api.renameFolder(folder_id, name)
        if (parent_id !== undefined) api.moveFolder(folder_id, parent_id)
      } catch (e) {
        return errorText(e)
      }
      return ok(api.listFolders().find((f) => f.id === folder_id))
    }
  )

  server.registerTool(
    'delete_folder',
    {
      description: 'Delete a sidebar folder. Its whiteboards and subfolders are kept and move up one level.',
      inputSchema: { folder_id: z.string() },
      annotations: { destructiveHint: true }
    },
    async ({ folder_id }) => {
      if (!api.listFolders().some((f) => f.id === folder_id)) return fail(`Folder ${folder_id} not found`)
      api.deleteFolder(folder_id)
      return ok('Deleted')
    }
  )

  server.registerTool(
    'delete_card',
    {
      description: "Delete a card (or a text box's card) everywhere — its placements disappear from all whiteboards. Restorable in the app for 30 days.",
      inputSchema: { card_id: z.string() },
      annotations: { destructiveHint: true }
    },
    async ({ card_id }) => {
      if (!api.getCard(card_id)) return fail(`Card ${card_id} not found`)
      api.deleteCard(card_id)
      return ok('Deleted')
    }
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

  const taskOut = (t: Task) => ({
    card_id: t.cardId,
    card_title: t.cardTitle,
    task_id: t.taskId,
    index: t.index,
    text: t.text,
    checked: t.checked,
    status: t.status,
    priority: t.priority,
    assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
    due_date: t.dueDate,
    comment_count: t.commentCount
  })
  const taskError = (e: unknown) => ({ ...ok(String(e instanceof Error ? e.message : e)), isError: true })
  const statusEnum = z.enum(TASK_STATUSES)
  const priorityEnum = z.enum(TASK_PRIORITIES)
  const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')

  server.registerTool(
    'list_tasks',
    {
      description:
        "List to-do items (task list checkboxes) across all cards, with status, priority, assignee and due date. Filters combine. Assignee ids come from list_profiles; 'me' = the app's active profile, 'none' = unassigned.",
      inputSchema: {
        status: z.enum(['open', 'all', ...TASK_STATUSES]).default('open').describe("'open' = todo + in_progress"),
        assignee: z.string().optional().describe("profile id, 'me' or 'none'"),
        priority: priorityEnum.optional(),
        due: z.enum(['overdue', 'today', 'week']).optional().describe("'week' = today through the next 6 days")
      },
      annotations: { readOnlyHint: true }
    },
    async ({ status, assignee, priority, due }) => {
      const assigneeId = assignee === undefined ? undefined : assignee === 'none' ? null : assignee === 'me' ? api.getActiveProfile().id : assignee
      return ok(api.listTasks({ status, assigneeId, priority, due }).map(taskOut))
    }
  )

  server.registerTool(
    'add_task',
    {
      description:
        'Add a to-do (checkbox) to a card, or to the "Inbox" card (created on first use) when card_id is omitted. It appears in the Tasks view. Optionally set status, priority, assignee (profile id) and due date.',
      inputSchema: {
        text: z.string().min(1),
        card_id: z.string().optional(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        assignee_id: z.string().optional(),
        due_date: dueDate.optional()
      }
    },
    async ({ text, card_id, status, priority, assignee_id, due_date }) => {
      try {
        const task = api.addTask({ text, cardId: card_id, status, priority, assigneeId: assignee_id, dueDate: due_date })
        return ok({ card_id: task.cardId, task_id: task.taskId, index: task.index })
      } catch (e) {
        return taskError(e)
      }
    }
  )

  server.registerTool(
    'update_task',
    {
      description:
        "Change a to-do's status (todo / in_progress / done — done also ticks the checkbox in the card), priority, assignee (profile id, null to unassign), due date (YYYY-MM-DD, null to clear) or text. card_id + task_id from list_tasks.",
      inputSchema: {
        card_id: z.string(),
        task_id: z.string(),
        status: statusEnum.optional(),
        priority: priorityEnum.optional(),
        assignee_id: z.string().nullable().optional(),
        due_date: dueDate.nullable().optional(),
        text: z.string().min(1).optional()
      }
    },
    async ({ card_id, task_id, status, priority, assignee_id, due_date, text }) => {
      try {
        return ok(taskOut(api.updateTask({ cardId: card_id, taskId: task_id, status, priority, assigneeId: assignee_id, dueDate: due_date, text })))
      } catch (e) {
        return taskError(e)
      }
    }
  )

  server.registerTool(
    'complete_task',
    {
      description: 'Mark a to-do item done (status done, checkbox ticked) or reopen it (status todo). card_id + task_id (or index) from list_tasks.',
      inputSchema: {
        card_id: z.string(),
        task_id: z.string().optional(),
        index: z.number().int().min(0).optional(),
        checked: z.boolean().default(true)
      }
    },
    async ({ card_id, task_id, index, checked }) => {
      if (!api.getCard(card_id)) return { ...ok(`Card ${card_id} not found`), isError: true }
      try {
        const id = task_id ?? api.listTasks({ status: 'all' }).find((t) => t.cardId === card_id && t.index === index)?.taskId
        if (!id) return { ...ok('Pass task_id (or a valid index) from list_tasks'), isError: true }
        api.updateTask({ cardId: card_id, taskId: id, status: checked ? 'done' : 'todo' })
        return ok('Updated')
      } catch (e) {
        return taskError(e)
      }
    }
  )

  server.registerTool(
    'list_profiles',
    {
      description: "List the people (profiles) in this knowledge base, e.g. to assign tasks. `active` marks the profile using the app.",
      inputSchema: {},
      annotations: { readOnlyHint: true }
    },
    async () => {
      const active = api.getActiveProfile().id
      return ok(api.listProfiles().map((p) => ({ id: p.id, name: p.name, email: p.email, active: p.id === active })))
    }
  )

  server.registerTool(
    'list_task_comments',
    {
      description: "List the comment thread on a to-do item (card_id + task_id from list_tasks).",
      inputSchema: { card_id: z.string(), task_id: z.string() },
      annotations: { readOnlyHint: true }
    },
    async ({ card_id, task_id }) =>
      ok(
        api.listTaskComments(card_id, task_id).map((c) => ({
          id: c.id,
          body: c.body,
          author: c.author?.name ?? null,
          files: c.files.map((f) => f.name),
          created_at: c.createdAt,
          updated_at: c.updatedAt
        }))
      )
  )

  server.registerTool(
    'add_task_comment',
    {
      description:
        "Add a text comment to a to-do item (card_id + task_id from list_tasks). It is authored by the app's active profile. File uploads aren't supported over MCP.",
      inputSchema: { card_id: z.string(), task_id: z.string(), body: z.string().min(1) }
    },
    async ({ card_id, task_id, body }) => {
      if (!api.getCard(card_id)) return { ...ok(`Card ${card_id} not found`), isError: true }
      const comment = api.addTaskComment({ cardId: card_id, taskId: task_id, body })
      return ok({ id: comment.id, author: comment.author?.name ?? null })
    }
  )

  return server
}

export function freeSpot(api: Services, whiteboardId: string): { x: number; y: number } {
  const wb = api.getWhiteboard(whiteboardId)
  if (!wb || !wb.objects.length) return { x: 0, y: 0 }
  const maxX = Math.max(...wb.objects.map((o) => o.x + o.width))
  const minY = Math.min(...wb.objects.map((o) => o.y))
  return { x: maxX + 60, y: minY }
}
