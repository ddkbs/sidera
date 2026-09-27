import type { AiProviderId } from './ai'

export type ThemePref = 'light' | 'dark' | 'system'
export type FontPref = 'geist' | 'system'
export const FONT_VALUES: FontPref[] = ['geist', 'system']

export interface AppSettings {
  theme: ThemePref
  font: FontPref
  fontSize: number
  restoreLastView: boolean
  editor: { spellcheck: boolean }
  canvas: { showMinimap: boolean; snapToGrid: boolean }
  mcp: { httpEnabled: boolean; port: number }
  /** command id → key binding (e.g. "Mod+Shift+K"); only overrides are stored */
  shortcuts: Record<string, string>
  /** System-wide shortcut that opens the quick-capture window, even while the app is backgrounded. */
  quickCapture: { enabled: boolean; accelerator: string }
  /** whether the first-launch guided tour has been finished or skipped */
  tourCompleted: boolean
  /** Active AI provider + model for the in-app "Ask AI" assistant. */
  ai: { provider: AiProviderId; model: string; baseUrl?: string; /** Let the assistant use the provider's native web search (OpenAI/Anthropic only; costs extra). */ webSearch: boolean }
  /** Profile that authors comments etc. Created on first start when null. */
  activeProfileId: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  font: 'geist',
  fontSize: 15,
  restoreLastView: true,
  editor: { spellcheck: true },
  canvas: { showMinimap: true, snapToGrid: false },
  mcp: { httpEnabled: true, port: 3845 },
  shortcuts: {},
  quickCapture: { enabled: true, accelerator: 'Ctrl+Alt+Space' },
  tourCompleted: false,
  ai: { provider: 'anthropic', model: 'claude-opus-5', webSearch: false },
  activeProfileId: null
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }
export type SettingsPatch = DeepPartial<AppSettings>

/** Merge a (possibly stale/partial) settings object over defaults, one level deep for nested groups. */
export function mergeSettings(base: AppSettings, patch: SettingsPatch | undefined | null): AppSettings {
  if (!patch) return base
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    // Drop legacy/unknown font values (e.g. removed 'jost'/'futura') so old settings.json files
    // fall back to the current default instead of pointing at a font that no longer exists.
    if (k === 'font' && !FONT_VALUES.includes(v as FontPref)) continue
    const current = (base as unknown as Record<string, unknown>)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' && k !== 'shortcuts' ? { ...current, ...v } : v
  }
  return out as unknown as AppSettings
}

export const SETTINGS_CHANGED = 'settings:changed'
