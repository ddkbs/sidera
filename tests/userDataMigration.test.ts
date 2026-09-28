import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateUserData } from '../src/main/userDataMigration'

const setup = () => {
  const appData = mkdtempSync(join(tmpdir(), 'sidera-userdata-'))
  return { appData, legacy: join(appData, 'CanvasCL'), target: join(appData, 'Sidera'), claude: join(appData, 'claude.json') }
}

describe('userData migration', () => {
  it('moves the legacy folder and rebases account + Claude Desktop paths', () => {
    const { appData, legacy, target, claude } = setup()
    mkdirSync(join(legacy, 'data'), { recursive: true })
    writeFileSync(join(legacy, 'data', 'sidera.db'), 'db')
    writeFileSync(join(legacy, 'accounts.json'), JSON.stringify({ version: 1, accounts: [{ id: 'a', dataDir: join(legacy, 'data') }] }))
    writeFileSync(claude, JSON.stringify({ other: 1, mcpServers: { x: { command: 'y' }, canvascl: { command: 'e', env: { CANVASCL_DATA_DIR: join(legacy, 'guest') } } } }))

    expect(migrateUserData(appData, 'Sidera', claude)).toBe(target)
    expect(existsSync(legacy)).toBe(false)
    expect(readFileSync(join(target, 'data', 'sidera.db'), 'utf8')).toBe('db')
    expect(JSON.parse(readFileSync(join(target, 'accounts.json'), 'utf8')).accounts[0].dataDir).toBe(join(target, 'data'))
    const cfg = JSON.parse(readFileSync(claude, 'utf8'))
    expect(cfg.other).toBe(1)
    expect(cfg.mcpServers.x).toEqual({ command: 'y' })
    expect(cfg.mcpServers.canvascl).toBeUndefined()
    expect(cfg.mcpServers.sidera.env).toEqual({ SIDERA_DATA_DIR: join(target, 'guest') })

    // idempotent
    expect(migrateUserData(appData, 'Sidera', claude)).toBe(target)
  })

  it('never overwrites an existing target and is a no-op on fresh installs', () => {
    const { appData, legacy, target, claude } = setup()
    expect(migrateUserData(appData, 'Sidera', claude)).toBe(target)
    mkdirSync(legacy)
    mkdirSync(target)
    expect(migrateUserData(appData, 'Sidera', claude)).toBe(legacy)
    expect(existsSync(legacy)).toBe(true)
  })
})
