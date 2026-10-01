import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../src/main/db/client'
import { createMcpServer } from '../src/main/mcp/tools'
import { createServices } from '../src/main/services'

async function connect() {
  const api = createServices(openDatabase(':memory:'))
  const server = createMcpServer(api, 'test')
  const client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args })
    const text = (res.content as { text: string }[])[0].text
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
  return { api, client, call }
}

describe('mcp', () => {
  it('reports tool calls to the activity listener', async () => {
    const api = createServices(openDatabase(':memory:'))
    const calls: string[] = []
    const server = createMcpServer(api, 'test', (tool) => calls.push(tool))
    const client = new Client({ name: 'test', version: '1' })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    await client.callTool({ name: 'list_tags', arguments: {} })
    expect(calls).toEqual(['list_tags'])
  })

  it('lists the MCP-first tool set', async () => {
    const { client } = await connect()
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['search_cards', 'create_card', 'add_card_to_whiteboard', 'move_kanban_item']))
  })

  it('summarises sketch objects instead of dumping scenes and embedded images', async () => {
    const { api, call } = await connect()
    const wb = await call('create_whiteboard', { name: 'Sketches' })
    const data = {
      elements: [{ type: 'freedraw' }, { type: 'image', fileId: 'f' }, { type: 'line', isDeleted: true }],
      files: { f: { dataURL: `data:image/png;base64,${'A'.repeat(1000)}` } },
      svg: '<svg/>'
    }
    await api.addObject({ whiteboardId: wb.id, kind: 'sketch', x: 0, y: 0, data })
    const got = await call('get_whiteboard', { whiteboard_id: wb.id })
    expect(got.objects[0].data).toEqual({ elements: 2, images: 1 })
  })

  it('creates, searches, places and moves cards', async () => {
    const { call } = await connect()
    const card = await call('create_card', { title: 'Ship MCP', markdown: 'Expose **tools**', tags: ['Roadmap'] })
    const hits = await call('search_cards', { query: 'tools' })
    expect(hits[0].id).toBe(card.id)
    const wb = await call('create_whiteboard', { name: 'Plan' })
    const placed = await call('add_card_to_whiteboard', { card_id: card.id, whiteboard_id: wb.id })
    expect(placed.object_id).toBeTruthy()
    const board = await call('get_kanban', { tag: 'roadmap' })
    const done = board.columns.find((c: { name: string }) => c.name === 'Done')
    await call('move_kanban_item', { card_id: card.id, property_id: board.property_id, option_id: done.option_id })
    const after = await call('get_kanban', { tag: 'Roadmap' })
    expect(after.columns.find((c: { name: string }) => c.name === 'Done').cards[0].id).toBe(card.id)
    const md = await call('get_card', { card_id: card.id })
    expect(md.markdown).toBe('Expose **tools**')
    await call('create_property', { tag: 'Roadmap', name: 'Priority', type: 'select', options: ['Low', 'High'] })
    await call('set_card_property', { card_id: card.id, tag: 'roadmap', property: 'priority', value: 'High' })
    const listed = await call('list_cards', { tag: 'Roadmap' })
    expect(listed[0].properties).toMatchObject({ Status: 'Done', Priority: 'High' })
    await call('update_card', { card_id: card.id, color: 'green', icon: '✅' })
    expect((await call('get_card', { card_id: card.id })).icon).toBe('✅')
    const linked = await call('create_card', { title: 'Follow-up', markdown: 'See [[Ship MCP]] and [[Nope]]' })
    const shipped = await call('get_card', { card_id: card.id })
    expect(shipped.backlinks).toEqual([{ cardId: linked.id, title: 'Follow-up' }])
    expect((await call('get_card', { card_id: linked.id })).markdown).toBe('See [[Ship MCP]] and [[Nope]]')
  })

  it('lists and completes tasks', async () => {
    const { call } = await connect()
    const card = await call('create_card', { title: 'Todos', markdown: '- [ ] one\n- [ ] two' })
    const open = await call('list_tasks', { status: 'open' })
    const base = { card_id: card.id, card_title: 'Todos', task_id: expect.any(String), checked: false, status: 'todo', priority: 'none', assignee: null, due_date: null, comment_count: 0 }
    expect(open).toEqual([
      { ...base, index: 0, text: 'one' },
      { ...base, index: 1, text: 'two' }
    ])
    expect(open[0].task_id).not.toBe(open[1].task_id)
    const added = await call('add_task', { text: 'three', card_id: card.id })
    expect(added.index).toBe(2)
    const inboxTask = await call('add_task', { text: 'inbox todo' })
    expect(inboxTask.card_id).not.toBe(card.id)
    await call('complete_task', { card_id: card.id, index: 2 })
    await call('complete_task', { card_id: card.id, index: 1 })
    await call('complete_task', { card_id: card.id, index: 0 })
    expect((await call('list_tasks', { status: 'open' })).map((t: { text: string }) => t.text)).toEqual(['inbox todo'])
    expect((await call('list_tasks', { status: 'done' })).map((t: { text: string }) => t.text).sort()).toEqual(['one', 'three', 'two'])
  })

  it('updates task properties and filters by them', async () => {
    const { api, client, call } = await connect()
    const me = api.getActiveProfile()
    const other = api.createProfile({ name: 'Ada Lovelace' })
    expect((await call('list_profiles', {})).map((p: { name: string; active: boolean }) => [p.name, p.active])).toEqual([
      [me.name, true],
      ['Ada Lovelace', false]
    ])
    const a = await call('add_task', { text: 'Write spec', priority: 'high', assignee_id: me.id, due_date: '2020-01-01' })
    const b = await call('add_task', { text: 'Review', status: 'in_progress', assignee_id: other.id })
    expect((await call('list_tasks', { assignee: 'me' })).map((t: { text: string }) => t.text)).toEqual(['Write spec'])
    expect((await call('list_tasks', { status: 'in_progress' })).map((t: { text: string }) => t.text)).toEqual(['Review'])
    expect((await call('list_tasks', { due: 'overdue' })).map((t: { text: string }) => t.text)).toEqual(['Write spec'])
    const updated = await call('update_task', { card_id: b.card_id, task_id: b.task_id, priority: 'urgent', assignee_id: null, due_date: '2030-05-01' })
    expect(updated).toMatchObject({ priority: 'urgent', assignee: null, due_date: '2030-05-01', status: 'in_progress' })
    expect((await call('list_tasks', { assignee: 'none' })).map((t: { text: string }) => t.text)).toEqual(['Review'])
    await call('complete_task', { card_id: a.card_id, task_id: a.task_id })
    const [done] = await call('list_tasks', { status: 'done' })
    expect(done).toMatchObject({ text: 'Write spec', status: 'done', checked: true })
    const bad = (await client.callTool({ name: 'update_task', arguments: { card_id: a.card_id, task_id: 'nope', status: 'done' } })).isError
    expect(bad).toBe(true)
  })

  it('adds and lists comments on a task via list_task_comments / add_task_comment', async () => {
    const { api, call } = await connect()
    const card = await call('create_card', { title: 'Todos', markdown: '- [ ] one' })
    const [task] = await call('list_tasks', { status: 'open' })
    expect(await call('list_task_comments', { card_id: card.id, task_id: task.task_id })).toEqual([])
    await call('add_task_comment', { card_id: card.id, task_id: task.task_id, body: 'Looks good' })
    const comments = await call('list_task_comments', { card_id: card.id, task_id: task.task_id })
    expect(comments).toHaveLength(1)
    expect(comments[0].body).toBe('Looks good')
    expect(comments[0].author).toBe(api.getActiveProfile().name)
    const [after] = await call('list_tasks', { status: 'open' })
    expect(after.comment_count).toBe(1)
  })

  it('organizes a whiteboard into sections via the organize_board tool', async () => {
    const { api, call } = await connect()
    const wb = await call('create_whiteboard', { name: 'Board' })
    const cardA = await call('create_card', { title: 'A' })
    const cardB = await call('create_card', { title: 'B' })
    const cardC = await call('create_card', { title: 'C' })
    const objA = await call('add_card_to_whiteboard', { card_id: cardA.id, whiteboard_id: wb.id, x: 0, y: 0 })
    const objB = await call('add_card_to_whiteboard', { card_id: cardB.id, whiteboard_id: wb.id, x: 400, y: 0 })
    await call('add_card_to_whiteboard', { card_id: cardC.id, whiteboard_id: wb.id, x: 800, y: 0 })

    const result = await call('organize_board', {
      whiteboard_id: wb.id,
      groups: [{ title: 'Topic', color: 'blue', object_ids: [objA.object_id, objB.object_id] }]
    })
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]).toMatchObject({ title: 'Topic', objectCount: 2 })
    expect(result.unsorted).toBe(1)

    const board = api.getWhiteboard(wb.id)!
    expect(board.objects.filter((o) => o.kind === 'section')).toHaveLength(1)
  })

  it('lists the organize-board prompt', async () => {
    const { client } = await connect()
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name)
    expect(prompts).toContain('organize-board')
    const res = await client.getPrompt({ name: 'organize-board', arguments: { whiteboard: 'Roadmap' } })
    expect(res.messages[0].content).toMatchObject({ type: 'text' })
    expect((res.messages[0].content as { text: string }).text).toContain('organize_board')
  })
})

describe('mcp charts & diagrams', () => {
  it('adds and updates charts with agent-provided tables', async () => {
    const { api, call } = await connect()
    const wb = await call('create_whiteboard', { name: 'KPIs' })
    const added = await call('add_chart', {
      whiteboard_id: wb.id,
      chart_type: 'column',
      title: 'Signups',
      columns: ['Month', 'Web', 'iOS'],
      rows: [['Jan', 120, 40], ['Feb', 150, null]]
    })
    expect(added).toMatchObject({ chart_type: 'column', columns: ['Month', 'Web', 'iOS'], rows: 2 })
    let obj = api.getObject(added.object_id)!
    expect(obj.kind).toBe('chart')
    expect(obj.data).toMatchObject({ title: 'Signups', rows: [['Jan', '120', '40'], ['Feb', '150', '']] })

    // same table shape → data is kept when switching type, options merge
    await call('update_chart', { object_id: added.object_id, chart_type: 'line', options: { smooth: true } })
    obj = api.getObject(added.object_id)!
    expect(obj.data).toMatchObject({ chartType: 'line', rows: [['Jan', '120', '40'], ['Feb', '150', '']] })
    expect((obj.data as { options: { smooth: boolean } }).options.smooth).toBe(true)

    // fixed-shape types ignore custom columns; venn rows are normalised to regions
    const venn = await call('add_chart', { whiteboard_id: wb.id, chart_type: 'venn', rows: [['A', 'Design'], ['B', 'Code']], options: { sets: 2 } })
    expect(api.getObject(venn.object_id)!.data).toMatchObject({ columns: ['Region', 'Text'], rows: [['A', 'Design'], ['B', 'Code'], ['A∩B', '']] })

    const missing = await call('update_chart', { object_id: 'nope', title: 'x' })
    expect(String(missing)).toContain('not found')
  })

  it('adds and edits mindmaps and flowcharts', async () => {
    const { api, call } = await connect()
    const wb = await call('create_whiteboard', { name: 'Plan' })
    const mm = await call('add_mindmap', { whiteboard_id: wb.id, outline: 'Launch\n  - Marketing\n  - Product' })
    const fc = await call('add_flowchart', { whiteboard_id: wb.id, mermaid: 'graph TD\n  A --> B' })
    await call('update_diagram', { object_id: mm.object_id, source: 'Launch\n  - Sales' })
    expect(api.getObject(mm.object_id)).toMatchObject({ kind: 'mindmap', data: { source: 'Launch\n  - Sales' } })
    expect(api.getObject(fc.object_id)).toMatchObject({ kind: 'mermaid', data: { source: 'graph TD\n  A --> B' } })
    const board = api.getWhiteboard(wb.id)!
    // auto-placed side by side, not overlapping
    const [a, b] = board.objects
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width)
  })
})

describe('mcp folders', () => {
  it('creates folders and files whiteboards into them', async () => {
    const { api, call } = await connect()
    const folder = await call('create_folder', { name: 'XY GmbH' })
    expect(folder.name).toBe('XY GmbH')
    const sub = await call('create_folder', { name: 'Q1', parent_id: folder.id })
    expect(sub.parentId).toBe(folder.id)

    const wb = await call('create_whiteboard', { name: 'Kickoff', folder_id: folder.id })
    const listed = await call('list_whiteboards')
    expect(listed.find((w: { id: string }) => w.id === wb.id)).toMatchObject({ folderId: folder.id })

    await call('move_whiteboard_to_folder', { whiteboard_id: wb.id, folder_id: null })
    const after = await call('list_whiteboards')
    expect(after.find((w: { id: string }) => w.id === wb.id)).toMatchObject({ folderId: null })

    const folders = await call('list_folders')
    expect(folders.map((f: { id: string }) => f.id)).toEqual(expect.arrayContaining([folder.id, sub.id]))

    expect(api.listFolders()).toHaveLength(2)
  })

  it('errors when moving a whiteboard that does not exist', async () => {
    const { call } = await connect()
    const folder = await call('create_folder', { name: 'X' })
    const res = await call('move_whiteboard_to_folder', { whiteboard_id: 'nope', folder_id: folder.id })
    expect(String(res)).toContain('not found')
  })
})

describe('mcp http transport', () => {
  it('serves tools over stateless streamable HTTP', async () => {
    const { startHttpMcp } = await import('../src/main/mcp/server')
    const api = createServices(openDatabase(':memory:'))
    const started = await startHttpMcp(api, 'test', undefined, 0)
    expect(started).not.toBeNull()
    const addr = started!.server.address() as { port: number }
    const post = (body: unknown) =>
      fetch(`http://127.0.0.1:${addr.port}/mcp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify(body)
      })
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_card', arguments: { title: 'Via HTTP', markdown: 'x' } } })
    const text = await res.text()
    expect(res.status, text).toBe(200)
    expect(api.search('via http')).toHaveLength(1)
    started!.server.close()
  })

  it('rejects DNS-rebinding hosts, foreign origins and oversized bodies', async () => {
    const { request } = await import('node:http')
    const { startHttpMcp } = await import('../src/main/mcp/server')
    const api = createServices(openDatabase(':memory:'))
    const started = await startHttpMcp(api, 'test', undefined, 0)
    const port = (started!.server.address() as { port: number }).port
    const send = (headers: Record<string, string>, body: string | null = '{}') =>
      new Promise<number>((resolve) => {
        const req = request({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
          res.resume()
          resolve(res.statusCode!)
          req.destroy()
        })
        req.on('error', () => resolve(-1))
        if (body === null) req.flushHeaders()
        else req.end(body)
      })
    expect(await send({ host: 'evil.example.com' })).toBe(403)
    expect(await send({ host: `127.0.0.1:${port}`, origin: 'https://evil.example.com' })).toBe(403)
    expect(await send({ host: `127.0.0.1:${port}`, origin: 'null' })).toBe(403)
    // declared oversized body is refused before it is read
    expect(await send({ host: `127.0.0.1:${port}`, 'content-length': String(11 * 1024 * 1024) }, null)).toBe(413)
    started!.server.close()
  })
})

describe('mcp text blocks & tables', () => {
  it('adds text blocks that stay out of list_cards but are found by search', async () => {
    const { call } = await connect()
    const wb = await call('create_whiteboard', { name: 'Tech Startups' })
    const block = await call('add_text_block', { whiteboard_id: wb.id, markdown: '## SpaceX\n- Founded: 2002\n- HQ: Hawthorne', style: 'framed' })
    expect(block).toMatchObject({ title: 'SpaceX' })
    await call('create_card', { title: 'Regular card' })
    expect((await call('list_cards', {})).map((c: { title: string }) => c.title)).toEqual(['Regular card'])
    expect((await call('list_cards', { kind: 'block' }))[0]).toMatchObject({ id: block.card_id, kind: 'block' })
    const hits = await call('search_cards', { query: 'Hawthorne' })
    expect(hits[0]).toMatchObject({ id: block.card_id, card_kind: 'block' })
    const board = await call('get_whiteboard', { whiteboard_id: wb.id })
    expect(board.objects[0]).toMatchObject({ id: block.object_id, kind: 'card', card_kind: 'block', data: { style: 'framed' } })
    // blocks remain regular cards for the card tools
    expect((await call('get_card', { card_id: block.card_id })).markdown).toContain('Hawthorne')
  })

  it('adds and updates tables and keeps linked charts in sync', async () => {
    const { api, call, client } = await connect()
    const wb = await call('create_whiteboard', { name: 'Numbers' })
    const table = await call('add_table', {
      whiteboard_id: wb.id,
      title: 'Revenue ($bn)',
      columns: ['Year', { name: 'Revenue', type: 'number' }],
      rows: [['2022', 4.6], ['2023', '8.7']]
    })
    expect(table).toMatchObject({ columns: ['Year', 'Revenue'], rows: 2 })
    const chart = await call('add_chart', { whiteboard_id: wb.id, chart_type: 'column', table_id: table.object_id })
    expect(chart).toMatchObject({ columns: ['Year', 'Revenue'], rows: 2, linked_table_id: table.object_id })

    await call('update_table', { object_id: table.object_id, append_rows: [['2024', 13.1]] })
    expect(api.getObject(chart.object_id)!.data.rows).toEqual([['2022', '4.6'], ['2023', '8.7'], ['2024', '13.1']])

    const board = await call('get_whiteboard', { whiteboard_id: wb.id })
    const t = board.objects.find((o: { id: string }) => o.id === table.object_id)
    expect(t.data).toEqual({ title: 'Revenue ($bn)', columns: ['Year', 'Revenue'], rows: [['2022', 4.6], ['2023', 8.7], ['2024', 13.1]] })

    // replacing rows keeps the columns; unlinking stops following
    await call('update_table', { object_id: table.object_id, rows: [['2025', 15]] })
    expect(api.getObject(chart.object_id)!.data.rows).toEqual([['2025', '15']])
    await call('update_chart', { object_id: chart.object_id, unlink: true })
    await call('update_table', { object_id: table.object_id, rows: [] })
    expect(api.getObject(chart.object_id)!.data.rows).toEqual([['2025', '15']])
    expect(api.getObject(chart.object_id)!.data.source).toBeUndefined()

    const bad = await client.callTool({ name: 'update_table', arguments: { object_id: 'nope' } })
    expect(bad.isError).toBe(true)
  })
})

describe('mcp whiteboard editing', () => {
  it('builds and edits a board with shapes, ink, text boxes, links and connectors', async () => {
    const { api, client, call } = await connect()
    const wb = await call('create_whiteboard', { name: 'Edit me' })
    const text = await call('add_text_block', { whiteboard_id: wb.id, markdown: '# Plan\nShip it', style: 'framed', font_size: 20, color: 'blue', x: 0, y: 0 })
    const shape = await call('add_shape', { whiteboard_id: wb.id, shape: 'diamond', x: 400, y: 0, width: 200, height: 100, fill_color: 'yellow', rotation: 45 })
    const ink = await call('add_ink', { whiteboard_id: wb.id, strokes: [{ points: [[0, 120], [200, 125]], color: 'red', width: 4.5 }] })
    const link = await call('add_link', { whiteboard_id: wb.id, url: 'https://example.com/a' })
    const conn = await call('connect_objects', { whiteboard_id: wb.id, source_object_id: text.object_id, target_object_id: shape.object_id, label: 'next', line_style: 'dashed' })
    await call('update_connection', { connection_id: conn.connection_id, arrows: 'both', color: 'red' })

    let board = await call('get_whiteboard', { whiteboard_id: wb.id })
    const byId = (id: string) => board.objects.find((o: { id: string }) => o.id === id)
    expect(byId(text.object_id)).toMatchObject({ card_kind: 'block', color: 'blue', markdown: '# Plan\n\nShip it', data: { style: 'framed', fontSize: 20 } })
    expect(byId(shape.object_id)).toMatchObject({ width: 200, height: 100, data: { elements: 1, frameless: true, rotation: 45 } })
    expect(byId(ink.object_id).kind).toBe('sketch')
    expect(byId(link.object_id).data.url).toBe('https://example.com/a')
    expect(board.connections[0]).toMatchObject({ label: 'next', lineStyle: 'dashed', arrows: 'both', color: 'red' })

    await call('update_text_block', { object_id: text.object_id, markdown: 'More', mode: 'append', style: 'plain' })
    expect((await call('get_object', { object_id: text.object_id })).markdown).toBe('# Plan\n\nShip it\n\nMore')
    await call('update_objects', { objects: [{ object_id: shape.object_id, x: 500, color: 'green', order: 'back' }] })
    expect(api.getObject(shape.object_id)).toMatchObject({ x: 500, color: 'green' })
    const dup = await call('duplicate_objects', { object_ids: [text.object_id, shape.object_id] })
    expect(dup.object_ids).toHaveLength(2)
    const del = await call('delete_objects', { object_ids: [text.object_id], connection_ids: [] })
    expect(del.deleted_objects).toBe(1)
    board = await call('get_whiteboard', { whiteboard_id: wb.id })
    expect(board.objects).toHaveLength(5)
    expect(board.connections).toHaveLength(1) // the copied connector between the duplicates

    const section = await call('add_section', { whiteboard_id: wb.id, title: 'Group', object_ids: dup.object_ids })
    expect(api.getObject(section.object_id)!.kind).toBe('section')
    await call('update_whiteboard', { whiteboard_id: wb.id, name: 'Edited', properties: [{ key: 'Owner', value: 'Ada' }] })
    expect(api.getWhiteboard(wb.id)!.whiteboard).toMatchObject({ name: 'Edited', properties: [{ key: 'Owner', value: 'Ada' }] })

    const bad = await client.callTool({ name: 'add_link', arguments: { whiteboard_id: wb.id, url: 'file:///etc/passwd' } })
    expect(bad.isError).toBe(true)
    const noFiles = await client.callTool({ name: 'add_file', arguments: { whiteboard_id: wb.id, data_base64: 'AAAA', mime: 'image/png' } })
    expect(noFiles.isError).toBe(true)
  })
})
