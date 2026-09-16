import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron'
import { nanoid } from 'nanoid'
import { CHAT_EVENT, DB_CHANGED, MCP_ACTIVITY, type DbChangeScope } from '@shared/api'
import { existsSync, readFileSync, rmSync, writeFileSync as writeFileSyncFs } from 'node:fs'
import { ChatAgent } from './ai/chat'
import { openDatabase } from './db/client'
import { registerIpc } from './ipc'
import { startHttpMcp, startStdioMcp } from './mcp/server'
import { createServices } from './services'
import { exportCards, importCards } from './services/markdown'
import { seedWelcome } from './services/seed'

const STDIO = process.argv.includes('--mcp-stdio')
const dataDir = process.env.CANVASCL_DATA_DIR ?? join(app.getPath('userData'), 'data')
const filesDir = join(dataDir, 'files')
mkdirSync(filesDir, { recursive: true })

let win: BrowserWindow | null = null
let changeTimer: NodeJS.Timeout | null = null
const pending = new Set<DbChangeScope>()
const emit = (scope: DbChangeScope): void => {
  pending.add(scope)
  if (changeTimer) return
  changeTimer = setTimeout(() => {
    win?.webContents.send(DB_CHANGED, [...pending])
    pending.clear()
    changeTimer = null
  }, 30)
}

const db = openDatabase(join(dataDir, 'canvascl.db'))
const services = createServices(db, emit)

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.md': 'text/markdown', '.txt': 'text/plain'
}

if (STDIO) {
  app.dock?.hide()
  process.stdin.on('end', () => app.quit())
  app.whenReady().then(() => startStdioMcp(services, app.getVersion()))
} else {
  protocol.registerSchemesAsPrivileged([{ scheme: 'canvascl-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }])
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  protocol.handle('canvascl-file', async (req) => {
    // canvascl-file://files/<id> — ids live in the path because hostnames are lower-cased
    const id = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
    const f = services.getFile(id)
    if (!f) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(f.path).toString())
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Content-Type', f.mime)
    return new Response(res.body, { status: res.status, headers })
  })

  let mcpUrl: string | null = null
  registerIpc({
    ...services,
    async importFiles(paths) {
      let filePaths = (paths ?? []).filter((p) => MIME[extname(p).toLowerCase()])
      if (!paths) {
        const res = await dialog.showOpenDialog(win!, {
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Documents & images', extensions: Object.keys(MIME).map((e) => e.slice(1)) }]
        })
        if (res.canceled) return []
        filePaths = res.filePaths
      }
      return Promise.all(
        filePaths.map(async (p) => {
          const ext = extname(p).toLowerCase()
          const dest = join(filesDir, nanoid() + ext)
          await copyFile(p, dest)
          const { size } = await stat(dest)
          return services.registerFile({ name: basename(p), mime: MIME[ext] ?? 'application/octet-stream', path: dest, size })
        })
      )
    },
    async getFileUrl(id) {
      return services.getFile(id) ? `canvascl-file://files/${encodeURIComponent(id)}` : null
    },
    async exportMarkdown() {
      const res = await dialog.showOpenDialog(win!, { title: 'Export cards as Markdown', properties: ['openDirectory', 'createDirectory'] })
      if (res.canceled || !res.filePaths[0]) return null
      const dir = join(res.filePaths[0], `CanvasCL export ${new Date().toISOString().slice(0, 10)}`)
      const files = exportCards(services)
      for (const f of files) {
        const target = join(dir, f.name)
        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, f.content, 'utf8')
      }
      return { count: files.length, dir }
    },
    async importMarkdown() {
      const res = await dialog.showOpenDialog(win!, {
        title: 'Import Markdown files',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
      })
      if (res.canceled) return { count: 0 }
      const files = await Promise.all(res.filePaths.map(async (p) => ({ name: basename(p), content: await readFile(p, 'utf8') })))
      return { count: importCards(services, files) }
    },
    async getMcpInfo() {
      return { running: !!mcpUrl, url: mcpUrl, stdioCommand: `"${process.execPath}" --mcp-stdio` }
    }
  })

  const reportActivity = (tool: string, args: Record<string, unknown>): void => {
    win?.webContents.send(MCP_ACTIVITY, { tool, args: JSON.stringify(args).slice(0, 200), at: Date.now() })
  }
  const keyFile = join(dataDir, 'anthropic-key.bin')
  const getApiKey = (): string | null => {
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
    if (!existsSync(keyFile) || !safeStorage.isEncryptionAvailable()) return null
    try {
      return safeStorage.decryptString(readFileSync(keyFile))
    } catch {
      return null
    }
  }
  const chat = new ChatAgent(services, app.getVersion(), getApiKey, reportActivity)
  ipcMain.handle('chat:send', (_e, text: string) => chat.send(text, (ev) => win?.webContents.send(CHAT_EVENT, ev)))
  ipcMain.handle('chat:stop', () => chat.stop())
  ipcMain.handle('chat:reset', () => chat.reset())
  ipcMain.handle('chat:hasKey', () => !!getApiKey())
  ipcMain.handle('chat:setKey', (_e, key: string | null) => {
    if (!key) return void (existsSync(keyFile) && rmSync(keyFile))
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain encryption unavailable')
    writeFileSyncFs(keyFile, safeStorage.encryptString(key.trim()))
  })

  const mcp = await startHttpMcp(services, app.getVersion(), reportActivity)
  mcpUrl = mcp?.url ?? null

  // Detect writes from other processes (e.g. `--mcp-stdio` instances) and refresh the UI
  let dataVersion = db.$client.pragma('data_version', { simple: true })
  setInterval(() => {
    const v = db.$client.pragma('data_version', { simple: true })
    if (v !== dataVersion) {
      dataVersion = v
      emit('all')
    }
  }, 1500)

  if (seedWelcome(services) && !process.env.CANVASCL_SHOT) {
    const board = services.listWhiteboards()[0]
    // open the welcome board on first launch
    app.once('browser-window-created', (_e, w) =>
      w.webContents.once('did-finish-load', () =>
        w.webContents.executeJavaScript(
          `localStorage.getItem('canvascl.ui') || (localStorage.setItem('canvascl.ui', JSON.stringify({ view: { type: 'whiteboard', id: ${JSON.stringify(board.id)} } })), location.reload())`
        )
      )
    )
  }

  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#fafafa',
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: false, contextIsolation: true }
  })
  win.once('ready-to-show', () => win?.show())
  if (!app.isPackaged && process.env.CANVASCL_SHOT) void devShot(win)
  win.on('closed', () => (win = null))
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !STDIO) app.quit()
})
app.on('before-quit', () => db.$client.close())

/** Dev-only: run a script in the renderer, capture a screenshot, optionally quit. Used for automated UI checks. */
async function devShot(w: BrowserWindow): Promise<void> {
  const { readFile, writeFile } = await import('node:fs/promises')
  w.webContents.on('console-message', (e) => e.level !== 'info' && e.level !== 'debug' && console.log(`[renderer:${e.level}]`, e.message.slice(0, 400)))
  await new Promise((r) => w.webContents.once('did-finish-load', () => r(null)))
  await new Promise((r) => setTimeout(r, 1500))
  const steps = process.env.CANVASCL_SCRIPT ? (await readFile(process.env.CANVASCL_SCRIPT, 'utf8')).split('\n---\n') : ['']
  for (const [i, step] of steps.entries()) {
    const cmd = step.trim().match(/^@(click|dblclick|drag|key|type)\s+(.*)$/)
    if (cmd) {
      w.focus()
      w.webContents.focus()
      const [, kind, rest] = cmd
      if (kind === 'click' || kind === 'dblclick') {
        const [x, y] = rest.split(/\s+/).map(Number)
        const clickCount = kind === 'dblclick' ? 2 : 1
        w.webContents.sendInputEvent({ type: 'mouseMove', x, y })
        for (let c = 1; c <= clickCount; c++) {
          w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: c })
          w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: c })
        }
      } else if (kind === 'drag') {
        const [x1, y1, x2, y2] = rest.split(/\s+/).map(Number)
        w.webContents.sendInputEvent({ type: 'mouseDown', x: x1, y: y1, button: 'left', clickCount: 1 })
        for (let s = 1; s <= 10; s++)
          w.webContents.sendInputEvent({ type: 'mouseMove', x: x1 + ((x2 - x1) * s) / 10, y: y1 + ((y2 - y1) * s) / 10, button: 'left' })
        w.webContents.sendInputEvent({ type: 'mouseUp', x: x2, y: y2, button: 'left', clickCount: 1 })
      } else if (kind === 'key') {
        const parts = rest.split('+')
        const keyCode = parts.pop()!
        const modifiers = parts as ('meta' | 'shift' | 'alt' | 'control')[]
        w.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        w.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      } else {
        for (const ch of rest) w.webContents.sendInputEvent({ type: 'char', keyCode: ch })
      }
    } else if (step.trim()) {
      try {
        const out = await w.webContents.executeJavaScript(step)
        if (out !== undefined) console.log(`[shot] step ${i}:`, JSON.stringify(out))
      } catch (e) {
        console.log(`[shot] step ${i} failed:`, e)
      }
    }
    await new Promise((r) => setTimeout(r, 900))
    const img = await w.webContents.capturePage()
    await writeFile(process.env.CANVASCL_SHOT!.replace('.png', `-${i}.png`), img.toPNG())
  }
  if (process.env.CANVASCL_QUIT) app.quit()
}
