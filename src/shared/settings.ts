export type ThemePref = 'light' | 'dark' | 'system'
export type FontPref = 'jost' | 'futura' | 'geist' | 'system'

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
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  font: 'jost',
  fontSize: 15,
  restoreLastView: true,
  editor: { spellcheck: true },
  canvas: { showMinimap: true, snapToGrid: false },
  mcp: { httpEnabled: true, port: 3845 },
  shortcuts: {}
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] }
export type SettingsPatch = DeepPartial<AppSettings>

/** Merge a (possibly stale/partial) settings object over defaults, one level deep for nested groups. */
export function mergeSettings(base: AppSettings, patch: SettingsPatch | undefined | null): AppSettings {
  if (!patch) return base
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const current = (base as unknown as Record<string, unknown>)[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object' && k !== 'shortcuts' ? { ...current, ...v } : v
  }
  return out as unknown as AppSettings
}

export const SETTINGS_CHANGED = 'settings:changed'
