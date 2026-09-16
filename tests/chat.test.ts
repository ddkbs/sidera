import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/api'
import { ChatAgent } from '../src/main/ai/chat'
import { openDatabase } from '../src/main/db/client'
import { createServices } from '../src/main/services'

describe('chat agent', () => {
  it('reports a helpful error when no API key is configured', async () => {
    const agent = new ChatAgent(createServices(openDatabase(':memory:')), 'test', () => ({
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: null
    }))
    const events: ChatEvent[] = []
    await agent.send('hello', (e) => events.push(e))
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('API key') }])
  })

  it('reports a helpful error when no key is configured for an OpenAI-compatible provider', async () => {
    const agent = new ChatAgent(createServices(openDatabase(':memory:')), 'test', () => ({
      provider: 'openai',
      model: 'gpt-5.1',
      apiKey: null
    }))
    const events: ChatEvent[] = []
    await agent.send('hello', (e) => events.push(e))
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('API key') }])
  })
})
