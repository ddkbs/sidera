import Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { nanoid } from 'nanoid'
import type { AskUserAnswer, ChatEvent } from '@shared/api'
import { resolveBaseUrl, supportsWebSearch, type AiProviderId } from '@shared/ai'
import { APP_NAME } from '@shared/brand'
import { todayISO } from '@shared/util'
import type { Services } from '../services'
import { createMcpServer, type ToolCallListener } from '../mcp/tools'
import { ASK_USER_TOOL_NAME, answersToToolResult, askUserAnthropicTool, askUserOaTool, parseAskUserInput } from './askUser'
import { OpenAiCompatibleAgent, type OaToolDef } from './openaiCompatible'
import {
  ANTHROPIC_WEB_SEARCH_TOOL,
  describeAnthropicWebSearchApiError,
  describeWebSearchErrorCode,
  extractAnthropicSources,
  webSearchResultError
} from './anthropicWebSearch'

const MAX_TURNS = 20

const SYSTEM = `You are the assistant built into ${APP_NAME}, a local-first visual knowledge base (cards, whiteboards, tags with table/kanban views).
You act on the user's knowledge base through the provided tools. Search before creating to avoid duplicates. When you create or change something, say briefly what you did and name the cards or whiteboards involved.
Use ask_user_questions when a request is ambiguous and a few choices would clarify it; don't overuse it.
Keep answers concise and use Markdown.`

const WEB_SEARCH_LINE = 'You can search the web with the web_search tool for current or external information; cite the sources you used.'

/** System prompt for one request (pure — exported for tests). */
export function systemPrompt(webSearch: boolean, today: string): string {
  return `${SYSTEM}${webSearch ? `\n${WEB_SEARCH_LINE}` : ''}\nToday is ${today}.`
}

type Emit = (event: ChatEvent) => void

/** What the caller (main/index.ts) resolves from AppSettings + the key store on every send. */
export interface ActiveAiConfig {
  provider: AiProviderId
  model: string
  baseUrl?: string
  apiKey: string | null
  /** AppSettings.ai.webSearch — only honoured for providers that support native web search. */
  webSearch?: boolean
}

/**
 * In-app chat agent. Uses the exact same tool surface as the external MCP server
 * by connecting an MCP client to an in-process server instance. Routes to the
 * Anthropic SDK loop for `provider: 'anthropic'`, and to the OpenAI-compatible
 * loop (openai/gemini/mistral/xai/openrouter/ollama/custom) otherwise.
 */
export class ChatAgent {
  private messages: Anthropic.Beta.BetaMessageParam[] = []
  private tools: Anthropic.Beta.BetaTool[] | null = null
  private oaTools: OaToolDef[] | null = null
  private mcp: Client | null = null
  private abort: AbortController | null = null
  private oa: OpenAiCompatibleAgent | null = null
  private lastProvider: AiProviderId | null = null
  private lastModel: string | null = null
  /** Resolvers for `ask_user_questions` calls currently paused, waiting on the renderer. */
  private pendingAsks = new Map<string, (outcome: AskUserAnswer[] | 'skipped') => void>()
  /** The `emit` of the in-flight `send()` call — used by paused tool calls, which can outlive a single send(). */
  private currentEmit: Emit | null = null

  constructor(
    private api: Services,
    private version: string,
    private getConfig: () => ActiveAiConfig,
    private onCall?: ToolCallListener
  ) {}

  reset(): void {
    this.abort?.abort()
    this.releasePendingAsks()
    this.messages = []
    this.oa?.reset()
  }

  stop(): void {
    this.abort?.abort()
    this.releasePendingAsks()
    this.oa?.stop()
  }

  /** The renderer answered a pending `ask` event. */
  answerQuestions(requestId: string, answers: AskUserAnswer[]): void {
    this.pendingAsks.get(requestId)?.(answers)
  }

  /** The renderer skipped a pending `ask` event. */
  skipQuestions(requestId: string): void {
    this.pendingAsks.get(requestId)?.('skipped')
  }

  /** Unblock any tool calls still waiting on an answer (stop/reset/abort) so the loop can't hang forever. */
  private releasePendingAsks(): void {
    for (const resolve of this.pendingAsks.values()) resolve('skipped')
    this.pendingAsks.clear()
  }

  /** Emits an `ask` event and pauses until the renderer answers or skips, returning the tool result text. */
  private async askUser(questions: ReturnType<typeof parseAskUserInput>): Promise<string> {
    if (questions.length === 0) return answersToToolResult(questions, 'skipped')
    const requestId = nanoid()
    const outcome = await new Promise<AskUserAnswer[] | 'skipped'>((resolve) => {
      this.pendingAsks.set(requestId, resolve)
      this.currentEmit?.({ type: 'ask', requestId, questions })
    })
    this.pendingAsks.delete(requestId)
    return answersToToolResult(questions, outcome)
  }

  private async connect(): Promise<void> {
    if (this.mcp) return
    const server = createMcpServer(this.api, this.version, this.onCall)
    const client = new Client({ name: 'canvascl-chat', version: this.version })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(a), client.connect(b)])
    const { tools } = await client.listTools()
    this.tools = [
      ...tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        // Inputs stream as generated; the MCP server validates them with zod before running.
        eager_input_streaming: true
      })),
      askUserAnthropicTool
    ]
    this.oaTools = [...tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema as Record<string, unknown> })), askUserOaTool]
    this.mcp = client
  }

  async send(text: string, emit: Emit): Promise<void> {
    const cfg = this.getConfig()
    // Switching provider or model starts a fresh conversation — histories aren't
    // cross-compatible between providers/models.
    if ((this.lastProvider && this.lastProvider !== cfg.provider) || (this.lastModel && this.lastModel !== cfg.model)) this.reset()
    this.lastProvider = cfg.provider
    this.lastModel = cfg.model

    if (!cfg.apiKey && cfg.provider !== 'ollama') {
      emit({ type: 'error', message: `Add your ${cfg.provider === 'anthropic' ? 'Anthropic' : cfg.provider} API key in Settings first.` })
      return
    }
    await this.connect()
    this.currentEmit = emit
    const webSearch = !!cfg.webSearch && supportsWebSearch(cfg.provider)

    if (cfg.provider === 'anthropic') {
      return this.sendAnthropic(cfg, text, emit, webSearch)
    }
    this.oa ??= new OpenAiCompatibleAgent(this.oaTools!, async (name, args) => {
      if (name === ASK_USER_TOOL_NAME) return { content: await this.askUser(parseAskUserInput(args)), isError: false }
      this.onCall?.(name, args)
      const res = await this.mcp!.callTool({ name, arguments: args })
      const content = (res.content as { type: string; text?: string }[]).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('\n')
      return { content, isError: res.isError === true }
    })
    const baseUrl = resolveBaseUrl(cfg.provider, cfg.baseUrl)
    return this.oa.send({ apiKey: cfg.apiKey, baseUrl, model: cfg.model, provider: cfg.provider, system: systemPrompt(webSearch, todayISO()), webSearch }, text, emit)
  }

  private async sendAnthropic(cfg: ActiveAiConfig, text: string, emit: Emit, webSearch: boolean): Promise<void> {
    const client = new Anthropic({ apiKey: cfg.apiKey! })
    this.abort = new AbortController()
    this.messages.push({ role: 'user', content: text })
    let jsonRetries = 0

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const stream = client.beta.messages.stream(
          {
            model: cfg.model,
            max_tokens: 64000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            thinking: { type: 'adaptive' },
            system: systemPrompt(webSearch, todayISO()),
            tools: webSearch ? [...this.tools!, ANTHROPIC_WEB_SEARCH_TOOL] : this.tools!,
            messages: this.messages
          },
          { signal: this.abort.signal }
        )
        stream.on('text', (delta) => emit({ type: 'text', delta }))
        if (webSearch) {
          stream.on('streamEvent', (ev) => {
            if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use' && ev.content_block.name === 'web_search') emit({ type: 'search' })
          })
          stream.on('contentBlock', (block) => {
            if (block.type === 'server_tool_use' && block.name === 'web_search') {
              const query = (block.input as { query?: unknown }).query
              if (typeof query === 'string' && query) emit({ type: 'search', query })
            }
            const code = webSearchResultError(block)
            if (code) emit({ type: 'search', error: describeWebSearchErrorCode(code) })
          })
        }

        let message: Anthropic.Beta.BetaMessage
        try {
          message = await stream.finalMessage()
          jsonRetries = 0
        } catch (err) {
          // Only unparseable streamed tool input is retried; API errors / aborts propagate.
          if (err instanceof Anthropic.APIError || this.abort.signal.aborted || jsonRetries++ >= 2) throw err
          continue
        }

        // Kept unchanged — server_tool_use / web_search_tool_result blocks must be replayed as-is.
        this.messages.push({ role: 'assistant', content: message.content })
        const sources = extractAnthropicSources(message.content)
        if (sources.length) emit({ type: 'sources', sources })

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
              if (tool.name === ASK_USER_TOOL_NAME) {
                const content = await this.askUser(parseAskUserInput(tool.input))
                return { type: 'tool_result', tool_use_id: tool.id, content }
              }
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
      } else if (err instanceof Anthropic.APIError && webSearch && describeAnthropicWebSearchApiError(err.message)) {
        emit({ type: 'error', message: describeAnthropicWebSearchApiError(err.message)! })
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
