import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/api'
import { ChatAgent } from '../src/main/ai/chat'
import { openDatabase } from '../src/main/db/client'
import { createServices } from '../src/main/services'

describe('chat agent', () => {
  it('reports a helpful error when no API key is configured', async () => {
    const agent = new ChatAgent(createServices(openDatabase(':memory:')), 'test', () => null)
    const events: ChatEvent[] = []
    await agent.send('hello', (e) => events.push(e))
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('API key') }])
  })
})
