import type { AiProviderId } from './ai'
import { LANGS, type Lang } from './i18n'

export type ThemePref = 'light' | 'dark' | 'system'
export type FontPref = 'geist' | 'system'
export const FONT_VALUES: FontPref[] = ['geist', 'system']

export interface OnboardingSettings {
  /** the welcome slides were finished or skipped — they are only shown automatically while this is false */
  welcomeSeen: boolean
  /** ms epoch when the guided spotlight tour was last finished (null = never) */
  tourCompletedAt: number | null
}

export interface AppSettings {
  /** UI language; null = follow the system language (see `resolveLang`) */
  language: Lang | null
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
  /** First-run onboarding. Lives in settings.json so it follows the user (per account once accounts land). */
  onboarding: OnboardingSettings
  /** Active AI provider + model for the in-app "Ask AI" assistant. */
  ai: { provider: AiProviderId; model: string; baseUrl?: string; /** Let the assistant use the provider's native web search (OpenAI/Anthropic only; costs extra). */ webSearch: boolean }
  /** Profile that authors comments etc. Created on first start when null. */
  activeProfileId: string | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: null,
  theme: 'system',
  font: 'geist',
  fontSize: 15,
  restoreLastView: true,
  editor: { spellcheck: true },
  canvas: { showMinimap: true, snapToGrid: false },
  mcp: { httpEnabled: true, port: 3845 },
  shortcuts: {},
  quickCapture: { enabled: true, accelerator: 'Ctrl+Alt+Space' },
  onboarding: { welcomeSeen: false, tourCompletedAt: null },
  ai: { provider: 'anthropic', model: 'claude-opus-5', webSearch: false },
  activeProfileId: null
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }
export type SettingsPatch = DeepPartial<AppSettings>

/** Merge a (possibly stale/partial) settings object over defaults, one level deep for nested groups. */
export function mergeSettings(base: AppSettings, patch: SettingsPatch | undefined | null): AppSettings {
  if (!patch) return base
  patch = migrateLegacy(patch)
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    // Drop legacy/unknown font values (e.g. removed 'jost'/'futura') so old settings.json files
    // fall back to the current default instead of pointing at a font that no longer exists.
    if (k === 'font' && !FONT_VALUES.includes(v as FontPref)) continue
    if (k === 'language' && v !== null && !LANGS.includes(v as Lang)) continue
    const current = (base as unknown as Record<string, unknown>)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' && k !== 'shortcuts' ? { ...current, ...v } : v
  }
  return out as unknown as AppSettings
}

/** Pre-onboarding settings files (and older devShot scripts) used a flat `tourCompleted` flag. */
function migrateLegacy(patch: SettingsPatch): SettingsPatch {
  const { tourCompleted, ...rest } = patch as SettingsPatch & { tourCompleted?: boolean }
  if (typeof tourCompleted !== 'boolean') return patch
  return { ...rest, onboarding: { welcomeSeen: tourCompleted, ...rest.onboarding } }
}

export const SETTINGS_CHANGED = 'settings:changed'
