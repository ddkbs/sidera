import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The app's folder name before the rename to Sidera. Referenced only by this one-time migration. */
export const LEGACY_USERDATA_NAME = 'CanvasCL'

/** Rewrites every string that starts with `from` (a path prefix) to start with `to`, recursively. */
function rebase<T>(value: T, from: string, to: string): T {
  if (typeof value === 'string') return (value === from || value.startsWith(from + '/') ? to + value.slice(from.length) : value) as T
  if (Array.isArray(value)) return value.map((v) => rebase(v, from, to)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebase(v, from, to)])) as T
  }
  return value
}

function rewriteJson(file: string, fn: (json: Record<string, unknown>) => Record<string, unknown>): void {
  if (!existsSync(file)) return
  try {
    const json = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const next = JSON.stringify(fn(json), null, 2)
    if (next !== JSON.stringify(json, null, 2)) writeFileSync(file, next, { mode: 0o600 })
  } catch {
    // unreadable/corrupt file: leave it alone, never block startup
  }
}

/**
 * One-time, idempotent move of `<appData>/CanvasCL` → `<appData>/<name>` before anything opens it.
 * Absolute data-folder paths in accounts.json and a pinned data folder in Claude Desktop's MCP config are
 * rebased as well, and the pre-rename `canvascl` MCP entry is renamed. Returns the userData folder to use:
 * the legacy one only if moving it failed (or both exist, so nothing is ever overwritten).
 */
export function migrateUserData(appData: string, name: string, claudeDesktopConfig: string): string {
  const legacy = join(appData, LEGACY_USERDATA_NAME)
  const target = join(appData, name)
  if (!existsSync(legacy)) return target
  if (existsSync(target)) return legacy
  try {
    renameSync(legacy, target)
  } catch {
    return legacy
  }
  rewriteJson(join(target, 'accounts.json'), (reg) => rebase(reg, legacy, target))
  rewriteJson(claudeDesktopConfig, (config) => {
    const servers = config.mcpServers as Record<string, { env?: Record<string, string> }> | undefined
    if (!servers) return config
    const next = { ...servers }
    if (next.canvascl && !next.sidera) next.sidera = next.canvascl
    delete next.canvascl
    const env = next.sidera?.env
    if (env?.CANVASCL_DATA_DIR) {
      const { CANVASCL_DATA_DIR, ...rest } = env
      next.sidera = { ...next.sidera, env: { ...rest, SIDERA_DATA_DIR: CANVASCL_DATA_DIR } }
    }
    return { ...config, mcpServers: rebase(next, legacy, target) }
  })
  return target
}
