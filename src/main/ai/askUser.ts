import type Anthropic from '@anthropic-ai/sdk'
import type { AskUserAnswer, AskUserQuestion } from '@shared/api'
import type { OaToolDef } from './openaiCompatible'

/**
 * `ask_user_questions` is a chat-local tool — it is a UI interaction (pause the loop, show a
 * questionnaire, wait for the renderer), not a data tool, so it is added only in the chat loop
 * (both provider paths) and never registered on the MCP server.
 */
export const ASK_USER_TOOL_NAME = 'ask_user_questions'

export const ASK_USER_TOOL_DESCRIPTION =
  'Ask the user one or more clarifying questions with structured choices before proceeding, when a request is ' +
  "ambiguous and a few options would clarify it. Each question is single-choice, multi-choice, or free text. " +
  'The conversation pauses until the user answers or skips — use sparingly, not for things you could reasonably infer.'

const ASK_USER_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Short stable id for this question, e.g. "format".' },
          question: { type: 'string' },
          type: { type: 'string', enum: ['single', 'multi', 'text'] },
          options: {
            type: 'array',
            description: 'Required for type "single"/"multi"; omit for "text".',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['label']
            }
          }
        },
        required: ['id', 'question', 'type']
      }
    }
  },
  required: ['questions']
} as const

export const askUserAnthropicTool: Anthropic.Beta.BetaTool = {
  name: ASK_USER_TOOL_NAME,
  description: ASK_USER_TOOL_DESCRIPTION,
  input_schema: ASK_USER_SCHEMA as unknown as Anthropic.Beta.BetaTool.InputSchema
}

export const askUserOaTool: OaToolDef = {
  name: ASK_USER_TOOL_NAME,
  description: ASK_USER_TOOL_DESCRIPTION,
  inputSchema: ASK_USER_SCHEMA
}

/**
 * Normalizes/validates the model's raw tool input into `AskUserQuestion[]`, dropping malformed
 * entries rather than throwing (streamed tool input can be sloppy). Pure — unit tested directly.
 */
export function parseAskUserInput(input: unknown): AskUserQuestion[] {
  const raw = input as { questions?: unknown } | null | undefined
  const list = Array.isArray(raw?.questions) ? (raw!.questions as unknown[]) : []
  const seen = new Set<string>()
  const out: AskUserQuestion[] = []

  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const q = item as Record<string, unknown>
    const type = q.type === 'single' || q.type === 'multi' || q.type === 'text' ? q.type : null
    const question = typeof q.question === 'string' ? q.question.trim() : ''
    if (!type || !question) continue

    let id = typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${out.length + 1}`
    if (seen.has(id)) id = `${id}_${out.length + 1}`
    seen.add(id)

    if (type === 'text') {
      out.push({ id, question, type })
      continue
    }

    const options = (Array.isArray(q.options) ? (q.options as unknown[]) : [])
      .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && typeof (o as Record<string, unknown>).label === 'string')
      .map((o) => ({ label: (o.label as string).trim(), description: typeof o.description === 'string' ? o.description : undefined }))
      .filter((o) => o.label.length > 0)
    if (options.length === 0) continue // a choice question with no valid choices can't be answered
    out.push({ id, question, type, options })
  }
  return out
}

/**
 * Renders the outcome of a pause (the user's answers, or a skip) into the text fed back to the
 * model as the tool result. Pure — unit tested directly.
 */
export function answersToToolResult(questions: AskUserQuestion[], outcome: AskUserAnswer[] | 'skipped'): string {
  if (outcome === 'skipped') {
    return 'The user skipped these questions. Proceed using your best judgement, or ask a narrower question if truly blocked.'
  }
  const byId = new Map(questions.map((q) => [q.id, q]))
  const lines = outcome.map((a) => {
    const question = byId.get(a.id)?.question ?? a.id
    const value = a.values.length ? a.values.join(', ') : '(skipped)'
    return `- ${question}: ${value}`
  })
  return `The user answered:\n${lines.join('\n')}`
}
