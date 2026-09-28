import { existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrations } from './migrations'
import * as schema from './schema'

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

/** Current database filename, inside a data folder. */
export const DB_FILENAME = 'sidera.db'
// Filename from the CanvasCL era, before the rename to Sidera. Referenced only by the migration and
// legacy-detection helpers below — never used to open a database directly.
const LEGACY_DB_FILENAME = 'canvascl.db'

/** True if a database file (current or pre-rename name) exists in this data folder. */
export function hasDbFile(dataDir: string): boolean {
  return existsSync(join(dataDir, DB_FILENAME)) || existsSync(join(dataDir, LEGACY_DB_FILENAME))
}

/**
 * One-time, idempotent rename of the pre-rename `canvascl.db` file (and its `-wal`/`-shm` siblings) to
 * the current name, so existing users keep their data after updating. No-op once migrated, and no-op if
 * there's nothing to migrate (fresh install). Call before opening a data folder's database.
 */
export function migrateDbFilename(dataDir: string): void {
  const legacy = join(dataDir, LEGACY_DB_FILENAME)
  const current = join(dataDir, DB_FILENAME)
  if (existsSync(current) || !existsSync(legacy)) return
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(legacy + suffix)) renameSync(legacy + suffix, current + suffix)
  }
}

export function openDatabase(filename: string): DB {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  migrate(sqlite)
  return drizzle(sqlite, { schema }) as DB
}

export function migrate(sqlite: Database.Database): void {
  const current = sqlite.pragma('user_version', { simple: true }) as number
  for (let i = current; i < migrations.length; i++) {
    sqlite.transaction(() => {
      if (migrations[i].trim()) sqlite.exec(migrations[i])
      sqlite.pragma(`user_version = ${i + 1}`)
    })()
  }
}
