import { existsSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Pure decision logic for moving a user's Electron `userData` folder after a product rename
 * (e.g. CanvasCL → Sidera). `app.getPath('userData')` is derived from the OS-level app name, so a
 * rename can silently point Electron at a brand-new, empty folder while the old one — accounts.json,
 * accounts/, data/, guest/, settings.json, Chromium's own "Local Storage" (which is where renderer
 * localStorage actually lives) — is left behind, invisible to the app and to the user.
 *
 * Note: `src/main/index.ts` pins the OS-level app name with `app.setName('CanvasCL')`, independent of
 * `APP_NAME`, specifically so this scenario never happens in practice — the userData folder name never
 * changes even though the product is now called Sidera. This module exists as a defensive backstop
 * (and is unit-tested on its own) in case that pin is ever removed or the app ships under a
 * platform where the pin doesn't apply.
 */
export interface MigrationPaths {
  /** Folder the OS would have used under the previous product name. */
  oldDir: string
  /** Folder the OS uses under the current product name. */
  newDir: string
}

export interface MigrationDecision {
  migrate: boolean
  reason: string
}

/** True when a folder looks like it holds real CanvasCL/Sidera user data (accounts registry or the legacy single-user `data/` folder). */
function looksLikeUserData(dir: string): boolean {
  if (!existsSync(dir)) return false
  if (existsSync(join(dir, 'accounts.json'))) return true
  if (existsSync(join(dir, 'data'))) return true
  return false
}

/** True when a folder is missing or has nothing in it worth protecting. */
function isEmptyOrMissing(dir: string): boolean {
  if (!existsSync(dir)) return true
  try {
    return readdirSync(dir).length === 0
  } catch {
    return true
  }
}

/**
 * Decides whether `oldDir` should be moved to `newDir`. Never returns `migrate: true` when that
 * would risk overwriting real data already at `newDir` — the caller is safe to always call
 * `applyUserDataMigration` with this decision.
 */
export function planUserDataMigration({ oldDir, newDir }: MigrationPaths): MigrationDecision {
  if (oldDir === newDir) return { migrate: false, reason: 'old and new paths are the same' }
  if (!looksLikeUserData(oldDir)) return { migrate: false, reason: 'no old data to migrate' }
  if (looksLikeUserData(newDir)) return { migrate: false, reason: 'new location already has data — never overwrite it' }
  if (!isEmptyOrMissing(newDir)) return { migrate: false, reason: 'new location exists and is not empty — leave it alone' }
  return { migrate: true, reason: 'old data folder found, new location is empty or missing' }
}

/** Applies a `migrate: true` decision. Same-volume rename, so it's effectively instant and atomic. */
export function applyUserDataMigration({ oldDir, newDir }: MigrationPaths): void {
  renameSync(oldDir, newDir)
}

/** Runs the decision + move, logging what happened. No-op (and safe) when there is nothing to do. */
export function migrateUserDataIfNeeded(paths: MigrationPaths, log: (msg: string) => void = console.log): void {
  const decision = planUserDataMigration(paths)
  if (!decision.migrate) return
  try {
    applyUserDataMigration(paths)
    log(`[userData migration] moved ${paths.oldDir} -> ${paths.newDir}`)
  } catch (e) {
    log(`[userData migration] failed to move ${paths.oldDir} -> ${paths.newDir}: ${e instanceof Error ? e.message : String(e)}`)
  }
}
