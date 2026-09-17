import type Anthropic from '@anthropic-ai/sdk'
import { mergeSources } from '@shared/ai'
import type { ChatSource } from '@shared/api'

/** Anthropic's server-side web search tool (runs on Anthropic's side; billed per search). */
export const ANTHROPIC_WEB_SEARCH_TOOL: Anthropic.Beta.BetaWebSearchTool20250305 = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 }

/** `web_search_result_location` citations on text blocks, deduped by URL (first cited text wins). */
export function extractAnthropicSources(content: Anthropic.Beta.BetaContentBlock[]): ChatSource[] {
  const found: ChatSource[] = []
  for (const block of content) {
    if (block.type !== 'text') continue
    for (const c of block.citations ?? []) {
      if (c.type === 'web_search_result_location') found.push({ url: c.url, title: c.title ?? undefined, citedText: c.cited_text || undefined })
    }
  }
  return mergeSources([], found)
}

/** The error code of a failed `web_search_tool_result`, or null when the search returned results. */
export function webSearchResultError(block: Anthropic.Beta.BetaContentBlock): Anthropic.Beta.BetaWebSearchToolResultErrorCode | null {
  if (block.type !== 'web_search_tool_result' || Array.isArray(block.content)) return null
  return block.content.error_code
}

export function describeWebSearchErrorCode(code: Anthropic.Beta.BetaWebSearchToolResultErrorCode): string {
  switch (code) {
    case 'max_uses_exceeded':
      return 'Search limit reached'
    case 'too_many_requests':
      return 'Search rate limited'
    case 'query_too_long':
      return 'Search query too long'
    case 'unavailable':
      return 'Web search unavailable'
    default:
      return 'Search failed'
  }
}

/** Friendlier message for API errors caused by web search (e.g. not enabled for the organization); null if unrelated. */
export function describeAnthropicWebSearchApiError(message: string): string | null {
  if (!/web[_ ]?search/i.test(message)) return null
  return `Web search isn't available for this Anthropic API key — an admin can enable it in the Claude Console (organization privacy settings), or turn off "Allow web search". (${message})`
}
