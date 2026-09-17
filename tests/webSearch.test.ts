import { createServer } from 'node:http'
import type Anthropic from '@anthropic-ai/sdk'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ResponseFunctionWebSearch, ResponseInputItem, ResponseOutputItem } from 'openai/resources/responses/responses'
import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/api'
import { OpenAiCompatibleAgent } from '../src/main/ai/openaiCompatible'
import { mergeSources, supportsWebSearch } from '@shared/ai'
import { DEFAULT_SETTINGS, mergeSettings } from '@shared/settings'
import {
  ANTHROPIC_WEB_SEARCH_TOOL,
  describeAnthropicWebSearchApiError,
  describeWebSearchErrorCode,
  extractAnthropicSources,
  webSearchResultError
} from '../src/main/ai/anthropicWebSearch'
import { systemPrompt } from '../src/main/ai/chat'
import {
  chatHistoryToResponsesInput,
  closeDanglingCalls,
  extractResponsesSources,
  outputToInput,
  responsesInputToChatHistory,
  toResponsesTools,
  webSearchQuery
} from '../src/main/ai/openaiResponses'

describe('web search settings & shared helpers', () => {
  it('defaults to off and survives partial patches', () => {
    expect(DEFAULT_SETTINGS.ai.webSearch).toBe(false)
    expect(mergeSettings(DEFAULT_SETTINGS, { ai: { webSearch: true } }).ai).toMatchObject({ provider: 'anthropic', webSearch: true })
  })

  it('is only supported for openai and anthropic', () => {
    expect(supportsWebSearch('openai')).toBe(true)
    expect(supportsWebSearch('anthropic')).toBe(true)
    expect(supportsWebSearch('gemini')).toBe(false)
    expect(supportsWebSearch('ollama')).toBe(false)
  })

  it('mergeSources dedupes by URL, fills gaps and drops non-http(s) URLs', () => {
    const merged = mergeSources(
      [{ url: 'https://a.com/x' }],
      [
        { url: 'https://a.com/x', title: 'A', citedText: 'quote' },
        { url: 'javascript:alert(1)', title: 'bad' },
        { url: 'file:///etc/passwd' },
        { url: 'not a url' },
        { url: 'http://b.org', title: 'B' },
        { url: 'http://b.org', title: 'B2' }
      ]
    )
    expect(merged).toEqual([
      { url: 'https://a.com/x', title: 'A', citedText: 'quote' },
      { url: 'http://b.org', title: 'B' }
    ])
  })

  it('adds the web search line to the system prompt only when enabled', () => {
    expect(systemPrompt(false, '2026-01-01')).not.toMatch(/web_search/)
    expect(systemPrompt(true, '2026-01-01')).toMatch(/web_search tool.*cite/)
    expect(systemPrompt(true, '2026-01-01')).toMatch(/Today is 2026-01-01\.$/)
  })
})

describe('anthropic web search', () => {
  it('uses the exact server tool definition', () => {
    expect(ANTHROPIC_WEB_SEARCH_TOOL).toEqual({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 })
  })

  const content = [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'canvascl release' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'srvtoolu_1',
      content: [{ type: 'web_search_result', url: 'https://example.com/a', title: 'Example A', encrypted_content: 'x', page_age: null }]
    },
    {
      type: 'text',
      text: 'It shipped.',
      citations: [
        { type: 'web_search_result_location', url: 'https://example.com/a', title: 'Example A', cited_text: 'Shipped today', encrypted_index: 'e1' },
        { type: 'web_search_result_location', url: 'https://example.com/a', title: 'Example A', cited_text: 'Other quote', encrypted_index: 'e2' },
        { type: 'char_location', cited_text: 'doc', document_index: 0, document_title: null, start_char_index: 0, end_char_index: 1, file_id: null }
      ]
    },
    { type: 'text', text: ' More.', citations: [{ type: 'web_search_result_location', url: 'https://news.test/b', title: null, cited_text: '', encrypted_index: 'e3' }] },
    { type: 'text', text: 'No citations', citations: null }
  ] as unknown as Anthropic.Beta.BetaContentBlock[]

  it('extracts web citations, deduped by URL', () => {
    expect(extractAnthropicSources(content)).toEqual([
      { url: 'https://example.com/a', title: 'Example A', citedText: 'Shipped today' },
      { url: 'https://news.test/b' }
    ])
  })

  it('detects web_search_tool_result errors', () => {
    expect(webSearchResultError(content[1])).toBeNull()
    const err = { type: 'web_search_tool_result', tool_use_id: 't', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } } as unknown as Anthropic.Beta.BetaContentBlock
    expect(webSearchResultError(err)).toBe('max_uses_exceeded')
    expect(describeWebSearchErrorCode('max_uses_exceeded')).toBe('Search limit reached')
    expect(describeWebSearchErrorCode('invalid_tool_input')).toBe('Search failed')
  })

  it('explains web-search API errors and ignores unrelated ones', () => {
    expect(describeAnthropicWebSearchApiError('web_search is not enabled for this organization')).toMatch(/Claude Console/)
    expect(describeAnthropicWebSearchApiError('overloaded')).toBeNull()
  })
})

describe('openai responses api', () => {
  it('maps MCP tools to Responses function tools plus web_search', () => {
    const tools = toResponsesTools([{ name: 'search_cards', description: 'Search', inputSchema: { $schema: 'x', type: 'object', properties: { q: { type: 'string' } } } }])
    expect(tools).toEqual([
      { type: 'function', name: 'search_cards', description: 'Search', parameters: { type: 'object', properties: { q: { type: 'string' } } }, strict: false },
      { type: 'web_search' }
    ])
  })

  const output = [
    { type: 'reasoning', id: 'rs_1', summary: [] },
    { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'weather berlin' } },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: 'Sunny [example](https://w.example/berlin).',
          annotations: [
            { type: 'url_citation', url: 'https://w.example/berlin', title: 'Berlin weather', start_index: 6, end_index: 40 },
            { type: 'url_citation', url: 'https://w.example/berlin', title: 'dup', start_index: 0, end_index: 1 },
            { type: 'file_citation', file_id: 'f', filename: 'f.txt', index: 0 }
          ]
        }
      ]
    },
    { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'create_card', arguments: '{"title":"Weather"}', status: 'completed' },
    { type: 'image_generation_call', id: 'ig_1', status: 'completed', result: null }
  ] as unknown as ResponseOutputItem[]

  it('extracts url_citation sources, deduped', () => {
    expect(extractResponsesSources(output)).toEqual([{ url: 'https://w.example/berlin', title: 'Berlin weather' }])
  })

  it('replays only known output item types, unchanged', () => {
    const input = outputToInput(output)
    expect(input.map((i) => ('type' in i ? i.type : ''))).toEqual(['reasoning', 'web_search_call', 'message', 'function_call'])
    expect(input[2]).toBe(output[2])
  })

  it('reads the query of a web_search_call', () => {
    expect(webSearchQuery(output[1] as ResponseFunctionWebSearch)).toBe('weather berlin')
    expect(webSearchQuery({ id: 'w', status: 'completed', type: 'web_search_call', action: { type: 'search', queries: ['a', 'b'] } })).toBe('a')
    expect(webSearchQuery({ id: 'w', status: 'completed', type: 'web_search_call', action: { type: 'open_page', url: 'https://x.y' } })).toBe('https://x.y')
  })

  const chat: ChatCompletionMessageParam[] = [
    { role: 'user', content: 'make a card' },
    { role: 'assistant', content: 'On it.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'create_card', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    { role: 'assistant', content: 'Done.' }
  ]

  it('converts chat history to Responses input', () => {
    expect(chatHistoryToResponsesInput(chat)).toEqual([
      { role: 'user', content: 'make a card' },
      { role: 'assistant', content: 'On it.' },
      { type: 'function_call', call_id: 'call_1', name: 'create_card', arguments: '{}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
      { role: 'assistant', content: 'Done.' }
    ])
  })

  it('round-trips chat history through Responses input', () => {
    expect(responsesInputToChatHistory(chatHistoryToResponsesInput(chat))).toEqual(chat)
  })

  it('converts Responses input with web search items back to chat history', () => {
    const input = [{ role: 'user', content: 'weather?' }, ...outputToInput(output), { type: 'function_call_output', call_id: 'call_1', output: 'created' }] as ResponseInputItem[]
    expect(responsesInputToChatHistory(input)).toEqual([
      { role: 'user', content: 'weather?' },
      {
        role: 'assistant',
        content: 'Sunny [example](https://w.example/berlin).',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'create_card', arguments: '{"title":"Weather"}' } }]
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'created' }
    ])
  })

  it('answers dangling function calls after an abort', () => {
    const input: ResponseInputItem[] = [
      { type: 'function_call', call_id: 'a', name: 'x', arguments: '{}' },
      { type: 'function_call', call_id: 'b', name: 'y', arguments: '{}' },
      { type: 'function_call_output', call_id: 'a', output: 'ok' }
    ]
    closeDanglingCalls(input)
    expect(input.slice(3)).toEqual([{ type: 'function_call_output', call_id: 'b', output: 'Error: cancelled' }])
  })
})

describe('OpenAiCompatibleAgent with web search (fake Responses SSE server)', () => {
  it('streams via the Responses API, runs function calls, emits search + sources, and falls back to chat history when toggled off', async () => {
    const bodies: { path: string; body: Record<string, unknown> }[] = []
    let call = 0
    const server = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        bodies.push({ path: req.url ?? '', body: JSON.parse(raw) })
        call++
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const send = (obj: Record<string, unknown>) => res.write(`event: ${obj.type}\ndata: ${JSON.stringify(obj)}\n\n`)
        if (req.url?.includes('/responses') && call === 1) {
          const ws = { type: 'web_search_call', id: 'ws_1', status: 'completed', action: { type: 'search', query: 'canvascl news' } }
          const fc = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'list_tags', arguments: '{}', status: 'completed' }
          send({ type: 'response.output_item.added', output_index: 0, sequence_number: 1, item: { ...ws, status: 'in_progress', action: { type: 'search' } } })
          send({ type: 'response.output_item.done', output_index: 0, sequence_number: 2, item: ws })
          send({ type: 'response.completed', sequence_number: 3, response: { id: 'r1', output: [ws, fc] } })
        } else if (req.url?.includes('/responses')) {
          const msg = {
            type: 'message',
            id: 'm1',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'News.', annotations: [{ type: 'url_citation', url: 'https://news.example/1', title: 'One', start_index: 0, end_index: 5 }] }]
          }
          send({ type: 'response.output_text.delta', delta: 'News.', item_id: 'm1', output_index: 0, content_index: 0, sequence_number: 1, logprobs: [] })
          send({ type: 'response.completed', sequence_number: 2, response: { id: 'r2', output: [msg] } })
        } else {
          res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\n`)
          res.write('data: [DONE]\n\n')
        }
        res.end()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    try {
      const agent = new OpenAiCompatibleAgent([{ name: 'list_tags', inputSchema: { type: 'object', properties: {} } }], async () => ({ content: '[]', isError: false }))
      const cfg = { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'gpt-test', provider: 'openai' as const, system: 'sys' }
      const events: ChatEvent[] = []
      await agent.send({ ...cfg, webSearch: true }, 'news?', (e) => events.push(e))

      expect(events).toEqual([
        { type: 'search' },
        { type: 'search', query: 'canvascl news' },
        { type: 'tool', name: 'list_tags' },
        { type: 'text', delta: 'News.' },
        { type: 'sources', sources: [{ url: 'https://news.example/1', title: 'One' }] },
        { type: 'done' }
      ])
      expect(bodies[0].path).toBe('/v1/responses')
      expect(bodies[0].body).toMatchObject({ model: 'gpt-test', instructions: 'sys', stream: true, input: [{ role: 'user', content: 'news?' }] })
      expect((bodies[0].body.tools as { type: string }[]).map((t) => t.type)).toEqual(['function', 'web_search'])
      expect((bodies[1].body.input as { type?: string }[]).map((i) => i.type)).toEqual([undefined, 'web_search_call', 'function_call', 'function_call_output'])

      // Toggle off: back to Chat Completions with the converted history.
      await agent.send(cfg, 'thanks', () => {})
      expect(bodies[2].path).toBe('/v1/chat/completions')
      expect(bodies[2].body.messages).toEqual([
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'news?' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_tags', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: '[]' },
        { role: 'assistant', content: 'News.' },
        { role: 'user', content: 'thanks' }
      ])
    } finally {
      server.close()
    }
  })
})
