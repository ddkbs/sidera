/** AI provider metadata. Pure — no Electron imports. Shared by main (routing, key store) and renderer (Settings UI). */

export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'mistral' | 'xai' | 'openrouter' | 'ollama' | 'custom'

export interface AiProviderMeta {
  id: AiProviderId
  label: string
  /** Fixed base URL for this provider, or null when the user supplies one (ollama/custom). */
  baseUrl: string | null
  needsKey: boolean
  keyPlaceholder: string
  /** Docs URL for getting a key, or null when no key is needed. */
  keyDocsUrl: string | null
  /** 1-2 sensible default model suggestions; never a long stale list. */
  defaultModels: string[]
  /** Whether the base URL field should be shown/editable in the UI. */
  editableBaseUrl: boolean
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    baseUrl: null,
    needsKey: true,
    keyPlaceholder: 'sk-ant-…',
    keyDocsUrl: 'https://console.anthropic.com/settings/keys',
    defaultModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    editableBaseUrl: false
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    keyPlaceholder: 'sk-…',
    keyDocsUrl: 'https://platform.openai.com/api-keys',
    defaultModels: ['gpt-5.1', 'gpt-5-mini'],
    editableBaseUrl: false
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    needsKey: true,
    keyPlaceholder: 'AIza…',
    keyDocsUrl: 'https://aistudio.google.com/apikey',
    defaultModels: ['gemini-3-pro', 'gemini-3-flash'],
    editableBaseUrl: false
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    keyPlaceholder: 'API key',
    keyDocsUrl: 'https://console.mistral.ai/api-keys',
    defaultModels: ['mistral-large-latest'],
    editableBaseUrl: false
  },
  {
    id: 'xai',
    label: 'Grok (xAI)',
    baseUrl: 'https://api.x.ai/v1',
    needsKey: true,
    keyPlaceholder: 'xai-…',
    keyDocsUrl: 'https://console.x.ai',
    defaultModels: ['grok-4'],
    editableBaseUrl: false
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    keyPlaceholder: 'sk-or-…',
    keyDocsUrl: 'https://openrouter.ai/keys',
    defaultModels: ['anthropic/claude-opus-5', 'openai/gpt-5.1'],
    editableBaseUrl: false
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    needsKey: false,
    keyPlaceholder: '',
    keyDocsUrl: null,
    defaultModels: ['llama3.3', 'qwen2.5'],
    editableBaseUrl: true
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: null,
    needsKey: false,
    keyPlaceholder: 'API key (optional)',
    keyDocsUrl: null,
    defaultModels: [],
    editableBaseUrl: true
  }
]

export function getProviderMeta(id: AiProviderId): AiProviderMeta {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]
}

/** Resolve the effective base URL for a provider given its (possibly user-set) settings base URL. */
export function resolveBaseUrl(id: AiProviderId, settingsBaseUrl?: string): string {
  const meta = getProviderMeta(id)
  if (meta.baseUrl) return meta.baseUrl
  return settingsBaseUrl?.trim() || (id === 'ollama' ? 'http://127.0.0.1:11434/v1' : '')
}

/** Providers whose native web search the in-app assistant can use. */
export const WEB_SEARCH_PROVIDERS: readonly AiProviderId[] = ['openai', 'anthropic']

export function supportsWebSearch(provider: AiProviderId): boolean {
  return WEB_SEARCH_PROVIDERS.includes(provider)
}

/** Append `incoming` web sources to `existing`, dropping non-http(s) URLs and duplicates (by URL, first wins; later entries fill a missing title/citedText). Pure. */
export function mergeSources<T extends { url: string; title?: string; citedText?: string }>(existing: T[], incoming: T[]): T[] {
  const out = existing.map((s) => ({ ...s }))
  for (const src of incoming) {
    let url: URL
    try {
      url = new URL(src.url)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    const hit = out.find((s) => s.url === src.url)
    if (hit) {
      hit.title ||= src.title
      hit.citedText ||= src.citedText
    } else {
      const clean = { url: src.url } as T
      if (src.title) clean.title = src.title
      if (src.citedText) clean.citedText = src.citedText
      out.push(clean)
    }
  }
  return out
}
