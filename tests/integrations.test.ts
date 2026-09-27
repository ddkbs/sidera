import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => '/app' } }))

describe('Claude Desktop integration', () => {
  const realHome = process.env.HOME
  let home: string
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'canvascl-home-'))
    process.env.HOME = home
  })
  afterEach(() => {
    process.env.HOME = realHome
  })

  it('merges into an existing config, keeps other servers and writes a backup', async () => {
    const { addToClaudeDesktop, claudeDesktopConfigPath, isInClaudeDesktop } = await import('../src/main/integrations')
    const file = claudeDesktopConfigPath()
    expect(file.startsWith(home)).toBe(true)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify({ mcpServers: { other: { command: 'x' } }, theme: 'dark' }))
    expect(isInClaudeDesktop()).toBe(false)

    const spec = { command: '/Applications/CanvasCL.app/Contents/MacOS/CanvasCL', args: ['--mcp-stdio'], env: { CANVASCL_DATA_DIR: '/data' } }
    expect(addToClaudeDesktop(spec).ok).toBe(true)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written).toEqual({ mcpServers: { other: { command: 'x' }, sidera: spec }, theme: 'dark' })
    expect(existsSync(file + '.bak')).toBe(true)
    expect(isInClaudeDesktop()).toBe(true)
  })

  it('removes a stale pre-rename "canvascl" entry when (re)connecting', async () => {
    const { addToClaudeDesktop, claudeDesktopConfigPath } = await import('../src/main/integrations')
    const file = claudeDesktopConfigPath()
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, JSON.stringify({ mcpServers: { canvascl: { command: 'old' }, other: { command: 'x' } } }))
    const spec = { command: 'new', args: [], env: {} }
    expect(addToClaudeDesktop(spec).ok).toBe(true)
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written.mcpServers).toEqual({ other: { command: 'x' }, sidera: spec })
  })

  it('creates the config when Claude Desktop has none, and refuses to clobber invalid JSON', async () => {
    const { addToClaudeDesktop, claudeDesktopConfigPath } = await import('../src/main/integrations')
    const spec = { command: 'c', args: [], env: {} }
    expect(addToClaudeDesktop(spec).ok).toBe(true)
    writeFileSync(claudeDesktopConfigPath(), '{ broken')
    expect(addToClaudeDesktop(spec).ok).toBe(false)
    expect(readFileSync(claudeDesktopConfigPath(), 'utf8')).toBe('{ broken')
  })
})
