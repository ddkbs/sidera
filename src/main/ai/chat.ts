import Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { ChatEvent } from '@shared/api'
import { todayISO } from '@shared/util'
import type { Services } from '../services'
import { createMcpServer, type ToolCallListener } from '../mcp/tools'

const MODEL = 'claude-opus-5'
const MAX_TURNS = 20

const SYSTEM = `You are the assistant built into CanvasCL, a local-first visual knowledge base (cards, whiteboards, tags with table/kanban views, daily journal).
You act on the user's knowledge base through the provided tools. Search before creating to avoid duplicates. When you create or change something, say briefly what you did and name the cards or whiteboards involved.
Keep answers concise and use Markdown.`

type Emit = (event: ChatEvent) => void

/**
 * In-app chat agent. Uses the exact same tool surface as the external MCP server
 * by connecting an MCP client to an in-process server instance.
 */
export class ChatAgent {
  private messages: Anthropic.Beta.BetaMessageParam[] = []
  private tools: Anthropic.Beta.BetaTool[] | null = null
  private mcp: Client | null = null
  private abort: AbortController | null = null

  constructor(
    private api: Services,
    private version: string,
    private getApiKey: () => string | null,
    private onCall?: ToolCallListener
  ) {}

  reset(): void {
    this.abort?.abort()
    this.messages = []
  }

  stop(): void {
    this.abort?.abort()
  }

  private async connect(): Promise<void> {
    if (this.mcp) return
    const server = createMcpServer(this.api, this.version, this.onCall)
    const client = new Client({ name: 'canvascl-chat', version: this.version })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const { tools } = await client.listTools()
    this.tools = tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
      // Inputs stream as generated; the MCP server validates them with zod before running.
      eager_input_streaming: true
    }))
    this.mcp = client
  }

  async send(text: string, emit: Emit): Promise<void> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      emit({ type: 'error', message: 'Add your Anthropic API key in the chat settings first.' })
      return
    }
    await this.connect()
    const client = new Anthropic({ apiKey })
    this.abort = new AbortController()
    this.messages.push({ role: 'user', content: text })
    let jsonRetries = 0

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = client.beta.messages.stream(
          {
            model: MODEL,
            max_tokens: 64000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            system: `${SYSTEM}\nToday is ${todayISO()}.`,
            tools: this.tools!,
            messages: this.messages
          },
          { signal: this.abort.signal }
        )
        stream.on('text', (delta) => emit({ type: 'text', delta }))

        let message: Anthropic.Beta.BetaMessage
        try {
          message = await stream.finalMessage()
          jsonRetries = 0
        } catch (err) {
          // Only unparseable streamed tool input is retried; API errors / aborts propagate.
          if (err instanceof Anthropic.APIError || this.abort.signal.aborted || jsonRetries++ >= 2) throw err
          continue
        }

        this.messages.push({ role: 'assistant', content: message.content })

        if (message.stop_reason === 'refusal') {
          emit({ type: 'error', message: 'The request was declined.' })
          break
        }
        if (message.stop_reason === 'pause_turn') continue

        const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
        if (!toolUses.length) break
        if (message.stop_reason === 'max_tokens') {
          this.messages.pop()
          emit({ type: 'error', message: 'The response was cut off before a tool call completed.' })
          break
        }

        const results = await Promise.all(
          toolUses.map(async (tool): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
            emit({ type: 'tool', name: tool.name })
            try {
              const res = await this.mcp!.callTool({ name: tool.name, arguments: (tool.input ?? {}) as Record<string, unknown> })
              const content = (res.content as { type: string; text?: string }[])
                .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
                .join('\n')
              return { type: 'tool_result', tool_use_id: tool.id, content, is_error: res.isError === true }
            } catch (e) {
              return { type: 'tool_result', tool_use_id: tool.id, content: String(e), is_error: true }
            }
          })
        )
        this.messages.push({ role: 'user', content: results })
      }
      emit({ type: 'done' })
    } catch (err) {
      if (this.abort.signal.aborted) {
        emit({ type: 'done' })
      } else if (err instanceof Anthropic.AuthenticationError) {
        emit({ type: 'error', message: 'Invalid Anthropic API key.' })
      } else if (err instanceof Anthropic.RateLimitError) {
        emit({ type: 'error', message: 'Rate limited — try again in a moment.' })
      } else if (err instanceof Anthropic.APIError) {
        emit({ type: 'error', message: `API error ${err.status ?? ''}: ${err.message}` })
      } else {
        emit({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      }
      // Keep history valid: drop a dangling assistant tool_use turn without results
      const last = this.messages[this.messages.length - 1]
      if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) this.messages.pop()
    } finally {
      this.abort = null
    }
  }
}
