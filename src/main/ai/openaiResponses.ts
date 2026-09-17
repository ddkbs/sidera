import type OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import type {
  FunctionTool,
  Response,
  ResponseFunctionToolCall,
  ResponseFunctionWebSearch,
  ResponseInputItem,
  ResponseOutputItem,
  Tool,
  WebSearchTool
} from 'openai/resources/responses/responses'
import { mergeSources } from '@shared/ai'
import type { ChatEvent, ChatSource } from '@shared/api'
import { sanitizeSchema, type OaToolDef, type ToolCaller } from './openaiCompatible'

/**
 * OpenAI Responses API loop — used only for provider `openai` with web search enabled, because
 * Chat Completions has no general web search tool. Helpers are pure and unit-tested.
 */

const MAX_TURNS = 20

/** Our MCP-derived tools as Responses function tools, plus OpenAI's hosted `web_search` tool. */
export function toResponsesTools(tools: OaToolDef[]): Tool[] {
  const fns: FunctionTool[] = tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description ?? '',
    parameters: sanitizeSchema(t.inputSchema, 'openai') as Record<string, unknown>,
    // Our schemas aren't written for strict mode (optional props, no additionalProperties: false everywhere).
    strict: false
  }))
  const web: WebSearchTool = { type: 'web_search' }
  return [...fns, web]
}

/** Output items that are valid to replay as input on the next turn (kept unchanged). */
export function outputToInput(output: ResponseOutputItem[]): ResponseInputItem[] {
  return output.filter((i) => i.type === 'message' || i.type === 'function_call' || i.type === 'web_search_call' || i.type === 'reasoning') as ResponseInputItem[]
}

/** `url_citation` annotations on output_text parts, deduped by URL. */
export function extractResponsesSources(output: ResponseOutputItem[]): ChatSource[] {
  const found: ChatSource[] = []
  for (const item of output) {
    if (item.type !== 'message') continue
    for (const part of item.content) {
      if (part.type !== 'output_text') continue
      for (const a of part.annotations ?? []) if (a.type === 'url_citation') found.push({ url: a.url, title: a.title || undefined })
    }
  }
  return mergeSources([], found)
}

/** Human-readable query of a web_search_call (undefined for page opens without a query). */
export function webSearchQuery(item: ResponseFunctionWebSearch): string | undefined {
  const a = item.action
  if (!a) return undefined
  if (a.type === 'search') return a.query || a.queries?.[0] || undefined
  if (a.type === 'open_page') return a.url ?? undefined
  if (a.type === 'find_in_page') return a.pattern
  return undefined
}

/** Chat Completions history → Responses input (when the web search toggle is switched on mid-conversation). */
export function chatHistoryToResponsesInput(history: ChatCompletionMessageParam[]): ResponseInputItem[] {
  const out: ResponseInputItem[] = []
  for (const m of history) {
    if (m.role === 'user' && typeof m.content === 'string') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      if (typeof m.content === 'string' && m.content) out.push({ role: 'assistant', content: m.content })
      for (const tc of m.tool_calls ?? []) {
        if (tc.type === 'function') out.push({ type: 'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments })
      }
    } else if (m.role === 'tool' && typeof m.content === 'string') out.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content })
  }
  return out
}

/** Responses input → Chat Completions history (toggle switched off). Web search calls and reasoning are dropped. */
export function responsesInputToChatHistory(input: ResponseInputItem[]): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = []
  const lastAssistant = (): Extract<ChatCompletionMessageParam, { role: 'assistant' }> | null => {
    const last = out[out.length - 1]
    return last?.role === 'assistant' ? last : null
  }
  for (const item of input) {
    const type = 'type' in item ? item.type : undefined
    if ((type === 'message' || type === undefined) && 'role' in item && 'content' in item) {
      const text =
        typeof item.content === 'string'
          ? item.content
          : (item.content as { type: string; text?: string }[]).map((p) => (p.type === 'output_text' || p.type === 'input_text' ? (p.text ?? '') : '')).join('')
      if (item.role === 'user') out.push({ role: 'user', content: text })
      else if (item.role === 'assistant' && text) {
        const prev = lastAssistant()
        if (prev && !prev.tool_calls?.length) prev.content = `${prev.content ?? ''}${text}`
        else out.push({ role: 'assistant', content: text })
      }
    } else if (type === 'function_call') {
      const fc = item as ResponseFunctionToolCall
      const call: ChatCompletionMessageToolCall = { id: fc.call_id, type: 'function', function: { name: fc.name, arguments: fc.arguments } }
      const prev = lastAssistant()
      if (prev) prev.tool_calls = [...(prev.tool_calls ?? []), call]
      else out.push({ role: 'assistant', content: null, tool_calls: [call] })
    } else if (type === 'function_call_output') {
      const fo = item as ResponseInputItem.FunctionCallOutput
      out.push({ role: 'tool', tool_call_id: fo.call_id ?? '', content: typeof fo.output === 'string' ? fo.output : '' })
    }
  }
  return out
}

/** Keep history valid after an error/abort: answer every function_call that has no output yet. */
export function closeDanglingCalls(input: ResponseInputItem[]): void {
  const answered = new Set(input.filter((i) => 'type' in i && i.type === 'function_call_output').map((i) => (i as ResponseInputItem.FunctionCallOutput).call_id))
  for (const i of [...input]) {
    if ('type' in i && i.type === 'function_call' && !answered.has(i.call_id)) input.push({ type: 'function_call_output', call_id: i.call_id, output: 'Error: cancelled' })
  }
}

type Emit = (event: ChatEvent) => void

/** Runs the tool loop against the Responses API, mutating `input` with every turn's items. Throws API errors. */
export async function runResponsesLoop(opts: {
  client: OpenAI
  model: string
  instructions: string
  tools: OaToolDef[]
  input: ResponseInputItem[]
  callTool: ToolCaller
  emit: Emit
  signal: AbortSignal
}): Promise<void> {
  const { client, input, emit } = opts
  const tools = toResponsesTools(opts.tools)
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = await client.responses.create({ model: opts.model, instructions: opts.instructions, input, tools, stream: true }, { signal: opts.signal })
    let response: Response | null = null
    for await (const ev of stream) {
      if (ev.type === 'response.output_text.delta') emit({ type: 'text', delta: ev.delta })
      else if (ev.type === 'response.output_item.added' && ev.item.type === 'web_search_call') emit({ type: 'search' })
      else if (ev.type === 'response.output_item.done' && ev.item.type === 'web_search_call') {
        const query = webSearchQuery(ev.item)
        if (ev.item.status === 'failed') emit({ type: 'search', error: 'Search failed' })
        else if (query) emit({ type: 'search', query })
      } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') response = ev.response
      else if (ev.type === 'response.failed') throw new Error(ev.response.error?.message ?? 'The response failed.')
      else if (ev.type === 'error') throw new Error(ev.message)
    }
    if (!response) throw new Error('The response ended unexpectedly.')

    input.push(...outputToInput(response.output))
    const sources = extractResponsesSources(response.output)
    if (sources.length) emit({ type: 'sources', sources })

    const calls = response.output.filter((i): i is ResponseFunctionToolCall => i.type === 'function_call')
    if (!calls.length) break
    for (const call of calls) {
      emit({ type: 'tool', name: call.name })
      let output: string
      try {
        const args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {}
        output = (await opts.callTool(call.name, args)).content
      } catch (e) {
        output = e instanceof SyntaxError ? 'Error: invalid JSON in tool arguments' : String(e)
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output })
    }
  }
}
