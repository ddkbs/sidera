import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DB_FILENAME, hasDbFile, migrateDbFilename, openDatabase } from '../src/main/db/client'

const scratch = () => mkdtempSync(join(tmpdir(), 'sidera-db-filename-'))

describe('DB filename migration (CanvasCL → Sidera)', () => {
  it('renames a pre-rename canvascl.db (and its -wal/-shm siblings) to sidera.db', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'canvascl.db'), 'data')
    writeFileSync(join(dir, 'canvascl.db-wal'), 'wal')
    writeFileSync(join(dir, 'canvascl.db-shm'), 'shm')

    migrateDbFilename(dir)

    expect(existsSync(join(dir, 'canvascl.db'))).toBe(false)
    expect(existsSync(join(dir, 'canvascl.db-wal'))).toBe(false)
    expect(existsSync(join(dir, 'canvascl.db-shm'))).toBe(false)
    expect(readFileSync(join(dir, DB_FILENAME), 'utf8')).toBe('data')
    expect(readFileSync(join(dir, DB_FILENAME + '-wal'), 'utf8')).toBe('wal')
    expect(readFileSync(join(dir, DB_FILENAME + '-shm'), 'utf8')).toBe('shm')
  })

  it('is idempotent: a second call is a no-op once migrated', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'canvascl.db'), 'data')
    migrateDbFilename(dir)
    expect(() => migrateDbFilename(dir)).not.toThrow()
    expect(readFileSync(join(dir, DB_FILENAME), 'utf8')).toBe('data')
  })

  it('never overwrites an existing sidera.db with a stale legacy one', () => {
    const dir = scratch()
    writeFileSync(join(dir, 'canvascl.db'), 'old')
    writeFileSync(join(dir, DB_FILENAME), 'current')

    migrateDbFilename(dir)

    expect(readFileSync(join(dir, DB_FILENAME), 'utf8')).toBe('current')
    expect(existsSync(join(dir, 'canvascl.db'))).toBe(true)
  })

  it('is a no-op on a fresh folder with no database at all', () => {
    const dir = scratch()
    expect(() => migrateDbFilename(dir)).not.toThrow()
    expect(existsSync(join(dir, DB_FILENAME))).toBe(false)
  })

  it('hasDbFile detects either the current or the legacy filename', () => {
    const dir = scratch()
    expect(hasDbFile(dir)).toBe(false)
    writeFileSync(join(dir, 'canvascl.db'), 'x')
    expect(hasDbFile(dir)).toBe(true)
  })

  it('opening the database after migration keeps existing data (cards survive the rename)', () => {
    const dir = scratch()
    // Seed a real database under the old name, then simulate an update: migrate + reopen under the new name.
    const seeded = openDatabase(join(dir, 'canvascl.db'))
    seeded.$client.close()
    migrateDbFilename(dir)
    const reopened = openDatabase(join(dir, DB_FILENAME))
    expect(reopened.$client.pragma('user_version', { simple: true })).toBeGreaterThan(0)
    reopened.$client.close()
    expect(existsSync(join(dir, 'canvascl.db'))).toBe(false)
  })
})
