import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrations } from './migrations'
import * as schema from './schema'

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

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
