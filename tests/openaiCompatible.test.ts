import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/api'
import { OpenAiCompatibleAgent, sanitizeSchema } from '../src/main/ai/openaiCompatible'

describe('sanitizeSchema', () => {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    properties: {
      count: { type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 100, default: 1 },
      nested: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } } }
    },
    required: ['count']
  }

  it('always strips $schema', () => {
    const out = sanitizeSchema(schema, 'openai') as Record<string, unknown>
    expect(out.$schema).toBeUndefined()
    expect(out.additionalProperties).toBe(false)
  })

  it('strips gemini-unsupported keywords recursively', () => {
    const out = sanitizeSchema(schema, 'gemini') as any
    expect(out.additionalProperties).toBeUndefined()
    expect(out.properties.count.exclusiveMinimum).toBeUndefined()
    expect(out.properties.count.exclusiveMaximum).toBeUndefined()
    expect(out.properties.count.default).toBeUndefined()
    expect(out.properties.nested.additionalProperties).toBeUndefined()
    expect(out.required).toEqual(['count'])
  })

  it('leaves other providers untouched besides $schema', () => {
    const out = sanitizeSchema(schema, 'mistral') as any
    expect(out.additionalProperties).toBe(false)
    expect(out.properties.count.exclusiveMinimum).toBe(0)
  })
})

/** Emulates the OpenAI streaming chat-completions SSE format for two turns:
 *  turn 1 streams a tool call (list_tags), turn 2 streams plain text. */
function startFakeServer(): { server: Server; port: number; requests: number[] } {
  let call = 0
  const requests: number[] = []
  const server = createServer((_req, res) => {
    call++
    requests.push(call)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (call === 1) {
      send({ choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'list_tags', arguments: '' } }] }, finish_reason: null }] })
      send({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] }, finish_reason: null }] })
      send({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
    } else {
      send({ choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }] })
      send({ choices: [{ index: 0, delta: { content: ' world' }, finish_reason: 'stop' }] })
    }
    res.write('data: [DONE]\n\n')
    res.end()
  })
  return { server, port: 0, requests }
}

describe('OpenAiCompatibleAgent', () => {
  let server: Server | null = null

  afterEach(() => {
    server?.close()
    server = null
  })

  it('executes a streamed tool call via the MCP client, then streams the final text', async () => {
    const fake = startFakeServer()
    server = fake.server
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    const calledTools: { name: string; args: Record<string, unknown> }[] = []
    const agent = new OpenAiCompatibleAgent([{ name: 'list_tags', description: 'List tags', inputSchema: { type: 'object', properties: {} } }], async (name, args) => {
      calledTools.push({ name, args })
      return { content: '[]', isError: false }
    })

    const events: ChatEvent[] = []
    await agent.send({ apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'test-model', provider: 'openai', system: 'system prompt' }, 'what tags do I have?', (e) =>
      events.push(e)
    )

    expect(calledTools).toEqual([{ name: 'list_tags', args: {} }])
    expect(events).toEqual([
      { type: 'tool', name: 'list_tags' },
      { type: 'text', delta: 'Hello' },
      { type: 'text', delta: ' world' },
      { type: 'done' }
    ])
    expect(fake.requests.length).toBe(2)
  })
})
