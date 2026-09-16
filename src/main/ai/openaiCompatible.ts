import OpenAI, { APIError } from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ChatEvent } from '@shared/api'
import type { AiProviderId } from '@shared/ai'

const MAX_TURNS = 20

type Emit = (event: ChatEvent) => void

export interface OaToolDef {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
}

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<{ content: string; isError: boolean }>

/**
 * Strip JSON-schema keywords that a given OpenAI-compatible provider's function-calling
 * implementation chokes on. Pure — safe to unit test without a network or provider.
 */
export function sanitizeSchema(schema: unknown, provider: AiProviderId): unknown {
  if (Array.isArray(schema)) return schema.map((s) => sanitizeSchema(s, provider))
  if (schema === null || typeof schema !== 'object') return schema

  const GEMINI_DROP = new Set(['additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum', 'default'])
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === '$schema') continue
    if (provider === 'gemini' && GEMINI_DROP.has(key)) continue
    out[key] = sanitizeSchema(value, provider)
  }
  return out
}

interface PendingCall {
  id: string
  name: string
  args: string
}

/**
 * Streaming tool-use loop against any OpenAI-compatible chat completions endpoint
 * (OpenAI, Gemini, Mistral, xAI, OpenRouter, Ollama, or a custom base URL).
 * Tools always come from the MCP client — never redefined here.
 */
export class OpenAiCompatibleAgent {
  private history: ChatCompletionMessageParam[] = []
  private abort: AbortController | null = null

  constructor(
    private tools: OaToolDef[],
    private callTool: ToolCaller
  ) {}

  reset(): void {
    this.abort?.abort()
    this.history = []
  }

  stop(): void {
    this.abort?.abort()
  }

  async send(
    cfg: { apiKey: string | null; baseUrl: string; model: string; provider: AiProviderId; system: string },
    text: string,
    emit: Emit
  ): Promise<void> {
    const client = new OpenAI({ apiKey: cfg.apiKey || 'not-needed', baseURL: cfg.baseUrl })
    this.abort = new AbortController()
    this.history.push({ role: 'user', content: text })

    const tools: ChatCompletionTool[] = this.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: sanitizeSchema(t.inputSchema, cfg.provider) as Record<string, unknown>
      }
    }))

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = await client.chat.completions.create(
          {
            model: cfg.model,
            stream: true,
            messages: [{ role: 'system', content: cfg.system }, ...this.history],
            tools: tools.length ? tools : undefined
          },
          { signal: this.abort.signal }
        )

        let text = ''
        const calls = new Map<number, PendingCall>()

        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) {
            text += delta.content
            emit({ type: 'text', delta: delta.content })
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const entry = calls.get(tc.index) ?? { id: '', name: '', args: '' }
              if (tc.id) entry.id = tc.id
              if (tc.function?.name) entry.name += tc.function.name
              if (tc.function?.arguments) entry.args += tc.function.arguments
              calls.set(tc.index, entry)
            }
          }
        }

        const toolCalls = [...calls.values()]
        this.history.push({
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length
            ? { tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args } })) }
            : {})
        })

        if (!toolCalls.length) break

        for (const call of toolCalls) {
          emit({ type: 'tool', name: call.name })
          let args: Record<string, unknown>
          try {
            args = call.args ? (JSON.parse(call.args) as Record<string, unknown>) : {}
          } catch {
            this.history.push({ role: 'tool', tool_call_id: call.id, content: 'Error: invalid JSON in tool arguments' })
            continue
          }
          try {
            const res = await this.callTool(call.name, args)
            this.history.push({ role: 'tool', tool_call_id: call.id, content: res.content })
          } catch (e) {
            this.history.push({ role: 'tool', tool_call_id: call.id, content: String(e) })
          }
        }
      }
      emit({ type: 'done' })
    } catch (err) {
      if (this.abort?.signal.aborted) {
        emit({ type: 'done' })
      } else {
        emit({ type: 'error', message: describeError(err, cfg.provider) })
      }
      const last = this.history[this.history.length - 1]
      if (last?.role === 'assistant' && 'tool_calls' in last && last.tool_calls?.length) this.history.pop()
    } finally {
      this.abort = null
    }
  }
}

function describeError(err: unknown, provider: AiProviderId): string {
  if (err instanceof APIError) {
    if (err.status === 401) return 'Invalid API key.'
    if (err.status === 429) return 'Rate limited — try again in a moment.'
    if (err.status === 404) return 'Model not found for this provider.'
    return `API error ${err.status ?? ''}: ${err.message}`
  }
  const message = err instanceof Error ? err.message : String(err)
  if (provider === 'ollama' && /ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) {
    return 'Could not connect to Ollama. Is Ollama running?'
  }
  return message
}

/** GET /models via the OpenAI SDK — used by the Settings "Load models" action. */
export async function listModels(apiKey: string | null, baseUrl: string): Promise<string[]> {
  const client = new OpenAI({ apiKey: apiKey || 'not-needed', baseURL: baseUrl })
  const page = await client.models.list()
  const ids: string[] = []
  for await (const model of page) ids.push(model.id)
  return ids.sort()
}
