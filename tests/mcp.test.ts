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
    await call('append_to_journal', { markdown: '- did a thing', date: '2026-09-16' })
    expect((await call('get_journal', { date: '2026-09-16' })).markdown).toBe('- did a thing')
  })
})
