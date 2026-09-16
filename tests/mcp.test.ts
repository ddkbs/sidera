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
    const linked = await call('create_card', { title: 'Follow-up', markdown: 'See [[Ship MCP]] and [[Nope]]' })
    const shipped = await call('get_card', { card_id: card.id })
    expect(shipped.backlinks).toEqual([{ cardId: linked.id, title: 'Follow-up' }])
    expect((await call('get_card', { card_id: linked.id })).markdown).toBe('See [[Ship MCP]] and [[Nope]]')
    await call('append_to_journal', { markdown: '- did a thing', date: '2026-09-16' })
    expect((await call('get_journal', { date: '2026-09-16' })).markdown).toBe('- did a thing')
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
})
