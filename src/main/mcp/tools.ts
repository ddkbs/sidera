import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { docToMarkdown, linkWikiRefs, markdownToDoc } from '@shared/doc'
import { withSourceHeader } from '@shared/html'
import { CHART_DEFS, defaultChart, SHAPE_COLUMNS, vennRows, type ChartData, type ChartOptions, type ChartType } from '@shared/charts'
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@shared/types'
import { APP_NAME } from '@shared/brand'
import type { Services } from '../services'
import { fetchPageForClip } from '../web'

const ok = (value: unknown) => ({
  content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }]
})

/** Builds an MCP server exposing Sidera's knowledge base. Every tool delegates to services. */
export type ToolCallListener = (tool: string, args: Record<string, unknown>) => void

export function createMcpServer(api: Services, version: string, onCall?: ToolCallListener): McpServer {
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
        `${APP_NAME} is a visual knowledge base. Cards hold Markdown-like notes, whiteboards arrange cards spatially, ` +
        'and tags group cards and power kanban boards. ' +
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
      description:
        'Update a card: title, content as Markdown (mode=replace or append), color (palette name) and icon (an emoji like "🚀"; null removes).',
      inputSchema: {
        card_id: z.string(),
        title: z.string().optional(),
        markdown: z.string().optional(),
        mode: z.enum(['replace', 'append']).default('append'),
        color: z.enum(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']).nullable().optional(),
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
              color: z.enum(['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink']).optional(),
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
      scheme: z.enum(['blue', 'green', 'orange', 'purple']).optional().describe('heatmap colour')
    })
    .partial()

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
    return { chartType: type, title: input.title ?? start.title, columns, rows, options }
  }

  server.registerTool(
    'add_chart',
    {
      description:
        'Add a chart or structured diagram to a whiteboard. Every chart is a small table: `columns` (header) + `rows` (cells). ' +
        'Omit columns/rows to start from an example. Numbers may be given as numbers or strings. Table shapes per type:\n' +
        shapeDocs +
        '\nNotes: timeline dates use YYYY-MM-DD; matrix X/Y are 0–100; venn regions are A, B, C, A∩B, A∩C, B∩C, A∩B∩C (A/B/C rows hold the set names); sankey rows are flows From → To with a value.',
      inputSchema: {
        whiteboard_id: z.string(),
        chart_type: z.enum(chartTypes),
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
    async ({ whiteboard_id, chart_type, title, columns, rows, options, x, y, width, height }) => {
      if (!api.getWhiteboard(whiteboard_id)) return { ...ok(`Whiteboard ${whiteboard_id} not found`), isError: true }
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
        'Switching between types with the same table shape keeps the data (e.g. column ↔ line ↔ area ↔ combo ↔ radar ↔ heatmap, pie ↔ donut, scatter ↔ bubble).',
      inputSchema: {
        object_id: z.string(),
        chart_type: z.enum(chartTypes).optional(),
        title: z.string().optional(),
        columns: z.array(z.string()).optional(),
        rows: z.array(z.array(cell)).optional(),
        options: optionsSchema.optional()
      }
    },
    async ({ object_id, chart_type, title, columns, rows, options }) => {
      const obj = api.getObject(object_id)
      if (!obj || obj.kind !== 'chart') return { ...ok(`Chart ${object_id} not found`), isError: true }
      const current = obj.data as unknown as ChartData
      const base: ChartData = current.columns && current.rows ? { ...current, options: current.options ?? {} } : defaultChart(current.chartType ?? 'column')
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

function freeSpot(api: Services, whiteboardId: string): { x: number; y: number } {
  const wb = api.getWhiteboard(whiteboardId)
  if (!wb || !wb.objects.length) return { x: 0, y: 0 }
  const maxX = Math.max(...wb.objects.map((o) => o.x + o.width))
  const minY = Math.min(...wb.objects.map((o) => o.y))
  return { x: maxX + 60, y: minY }
}
