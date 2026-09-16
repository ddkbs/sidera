import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const run = promisify(execFile)
const SERVER_NAME = 'canvascl'

export const claudeDesktopConfigPath = (): string => join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')

/** Command that launches this app as a headless stdio MCP server (works for dev and packaged builds). */
export function stdioLaunchSpec(dataDir: string): { command: string; args: string[]; env: Record<string, string> } {
  return {
    command: process.execPath,
    args: app.isPackaged ? ['--mcp-stdio'] : [app.getAppPath(), '--mcp-stdio'],
    env: { CANVASCL_DATA_DIR: dataDir }
  }
}

type DesktopConfig = { mcpServers?: Record<string, unknown> } & Record<string, unknown>

function readDesktopConfig(): DesktopConfig {
  const file = claudeDesktopConfigPath()
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')) as DesktopConfig
}

export function isInClaudeDesktop(): boolean {
  try {
    return !!readDesktopConfig().mcpServers?.[SERVER_NAME]
  } catch {
    return false
  }
}

/** Adds (or updates) the CanvasCL server in Claude Desktop's config. Keeps a .bak of the previous file. */
export function addToClaudeDesktop(spec: ReturnType<typeof stdioLaunchSpec>): { ok: boolean; message: string } {
  const file = claudeDesktopConfigPath()
  let config: DesktopConfig
  try {
    config = readDesktopConfig()
  } catch {
    return { ok: false, message: `Couldn't parse ${file} — fix or remove it first.` }
  }
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file)) copyFileSync(file, file + '.bak')
  config.mcpServers = { ...(config.mcpServers ?? {}), [SERVER_NAME]: spec }
  writeFileSync(file, JSON.stringify(config, null, 2))
  return { ok: true, message: 'Added to Claude Desktop — restart Claude Desktop to load the tools.' }
}

async function findClaudeCli(): Promise<string | null> {
  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]
  for (const c of candidates) if (existsSync(c)) return c
  try {
    // GUI apps don't inherit the shell PATH — ask a login shell.
    const { stdout } = await run('/bin/zsh', ['-lc', 'command -v claude'])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function isInClaudeCode(): Promise<boolean | null> {
  const cli = await findClaudeCli()
  if (!cli) return null
  try {
    const { stdout } = await run(cli, ['mcp', 'get', SERVER_NAME])
    return stdout.includes(SERVER_NAME)
  } catch {
    return false
  }
}

/** Registers the HTTP endpoint for Claude Code at user scope (available in every project). */
export async function addToClaudeCode(url: string): Promise<{ ok: boolean; message: string }> {
  const cli = await findClaudeCli()
  if (!cli) return { ok: false, message: 'Claude Code CLI not found. Install it, or copy the command manually.' }
  try {
    await run(cli, ['mcp', 'add', '--scope', 'user', '--transport', 'http', SERVER_NAME, url])
    return { ok: true, message: 'Added to Claude Code (all projects). Start a new session to use the tools.' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/already exists/i.test(msg)) return { ok: true, message: 'Claude Code already has CanvasCL configured.' }
    return { ok: false, message: msg.split('\n')[0] }
  }
}
