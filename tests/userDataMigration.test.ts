import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateUserDataIfNeeded, planUserDataMigration } from '../src/main/userDataMigration'

const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'sidera-migration-'))
  return { root, oldDir: join(root, 'CanvasCL'), newDir: join(root, 'Sidera') }
}

describe('planUserDataMigration', () => {
  it('migrates when the old folder has an accounts registry and the new one is missing', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{}')
    expect(planUserDataMigration({ oldDir, newDir })).toEqual({ migrate: true, reason: expect.any(String) })
  })

  it('migrates when the old folder has the pre-accounts legacy data/ folder', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(join(oldDir, 'data'), { recursive: true })
    expect(planUserDataMigration({ oldDir, newDir }).migrate).toBe(true)
  })

  it('does nothing when there is no old data', () => {
    const { oldDir, newDir } = setup()
    expect(planUserDataMigration({ oldDir, newDir })).toEqual({ migrate: false, reason: expect.any(String) })
  })

  it('never migrates when the new folder already has real data (no overwrite)', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{"old":true}')
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, 'accounts.json'), '{"new":true}')
    expect(planUserDataMigration({ oldDir, newDir }).migrate).toBe(false)
  })

  it('does not migrate when the new folder exists but is non-empty for another reason', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{}')
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, 'some-other-file.txt'), 'x')
    expect(planUserDataMigration({ oldDir, newDir }).migrate).toBe(false)
  })

  it('does nothing when old and new paths are identical', () => {
    const { oldDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{}')
    expect(planUserDataMigration({ oldDir, newDir: oldDir }).migrate).toBe(false)
  })

  it('migrates into an empty (but existing) new folder', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{}')
    mkdirSync(newDir, { recursive: true })
    expect(planUserDataMigration({ oldDir, newDir }).migrate).toBe(true)
  })
})

describe('migrateUserDataIfNeeded', () => {
  it('actually moves the folder, preserving contents', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{"hello":"world"}')
    mkdirSync(join(oldDir, 'accounts', 'abc'), { recursive: true })
    writeFileSync(join(oldDir, 'accounts', 'abc', 'canvascl.db'), 'data')

    migrateUserDataIfNeeded({ oldDir, newDir }, () => {})

    expect(existsSync(oldDir)).toBe(false)
    expect(readFileSync(join(newDir, 'accounts.json'), 'utf8')).toBe('{"hello":"world"}')
    expect(readFileSync(join(newDir, 'accounts', 'abc', 'canvascl.db'), 'utf8')).toBe('data')
  })

  it('is a no-op, and logs nothing, when there is nothing to migrate', () => {
    const { oldDir, newDir } = setup()
    const logs: string[] = []
    migrateUserDataIfNeeded({ oldDir, newDir }, (m) => logs.push(m))
    expect(logs).toEqual([])
    expect(existsSync(newDir)).toBe(false)
  })

  it('never touches an existing account at the new location', () => {
    const { oldDir, newDir } = setup()
    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'accounts.json'), '{"old":true}')
    mkdirSync(newDir, { recursive: true })
    writeFileSync(join(newDir, 'accounts.json'), '{"new":true}')

    migrateUserDataIfNeeded({ oldDir, newDir }, () => {})

    expect(readFileSync(join(oldDir, 'accounts.json'), 'utf8')).toBe('{"old":true}')
    expect(readFileSync(join(newDir, 'accounts.json'), 'utf8')).toBe('{"new":true}')
  })
})
