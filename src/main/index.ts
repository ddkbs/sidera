import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { nanoid } from 'nanoid'
import { CHAT_EVENT, DB_CHANGED, MCP_ACTIVITY, type AskUserAnswer, type DbChangeScope } from '@shared/api'
import { getProviderMeta, resolveBaseUrl, type AiProviderId } from '@shared/ai'
import { withSourceHeader } from '@shared/html'
import { SETTINGS_CHANGED, type SettingsPatch } from '@shared/settings'
import { SettingsStore } from './settings'
import { applyCaptureShortcut, hideCaptureWindow, showCaptureWindow, teardownCapture, toAccelerator } from './capture'
import { createTray, destroyTray } from './tray'
import { addToClaudeCode, addToClaudeDesktop, isInClaudeCode, isInClaudeDesktop, stdioLaunchSpec } from './integrations'
import { existsSync } from 'node:fs'
import { ChatAgent } from './ai/chat'
import { KeyStore } from './ai/keys'
import { listModels as listOpenAiModels } from './ai/openaiCompatible'
import { openDatabase } from './db/client'
import { registerIpc } from './ipc'
import { startHttpMcp, startStdioMcp } from './mcp/server'
import { createServices } from './services'
import { exportCards, importCards } from './services/markdown'
import { seedWelcome } from './services/seed'
import { downloadImage, fetchLinkPreview, fetchPageForClip } from './web'
import { hardenWindow, rendererUrl } from './windowSecurity'

const STDIO = process.argv.includes('--mcp-stdio')
// One stable data folder for dev and packaged builds: ~/Library/Application Support/CanvasCL
app.setName('CanvasCL')
// Automated UI checks get their own browser profile so they never collide with a running app (localStorage lock, cache).
if (process.env.CANVASCL_SHOT && process.env.CANVASCL_DATA_DIR) app.setPath('userData', join(process.env.CANVASCL_DATA_DIR, 'userdata'))
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
const settings = new SettingsStore(dataDir)
const services = createServices(db, emit, {
  get: () => settings.get().activeProfileId,
  set: (id) => {
    if (settings.get().activeProfileId === id) return
    win?.webContents.send(SETTINGS_CHANGED, settings.set({ activeProfileId: id }))
  }
})
// deleted cards/whiteboards stay restorable (undo) for 30 days
services.purgeDeleted(30 * 24 * 60 * 60 * 1000)

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain'
}
// importFileData (paste/drop of raw bytes, e.g. a clipboard image) accepts the same mimes as importFiles plus a few more image types
const EXT_BY_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME).map(([ext, mime]) => [mime, ext])),
  'image/bmp': '.bmp',
  'image/heic': '.heic',
  'image/heif': '.heif'
}
const DATA_MIME_ALLOWLIST = new Set([...Object.values(MIME), 'image/bmp', 'image/heic', 'image/heif'])
const MAX_IMPORT_BYTES = 25 * 1024 * 1024
const OPENABLE_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif', '.md', '.txt'])

if (STDIO) {
  app.dock?.hide()
  process.stdin.on('end', () => app.quit())
  app.whenReady().then(() => startStdioMcp(services, app.getVersion()))
} else {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'canvascl-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
  ])
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
    // Imported/downloaded files are untrusted: never let an SVG (or sniffed HTML) run script if opened as a document.
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Content-Security-Policy', "default-src 'none'; img-src data: canvascl-file:; style-src 'unsafe-inline'; sandbox")
    return new Response(res.body, { status: res.status, headers })
  })

  let mcpUrl: string | null = null
  let mcpServer: import('node:http').Server | null = null
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
    async importFileData({ name, mime, dataBase64 }) {
      if (!DATA_MIME_ALLOWLIST.has(mime)) throw new Error(`Unsupported file type: ${mime}`)
      const buf = Buffer.from(dataBase64, 'base64')
      if (buf.length > MAX_IMPORT_BYTES) throw new Error('File too large (max 25 MB)')
      const ext = extname(name || '').toLowerCase() || EXT_BY_MIME[mime] || ''
      const dest = join(filesDir, nanoid() + ext)
      await writeFile(dest, buf)
      return services.registerFile({ name: name?.trim() || `pasted${ext}`, mime, path: dest, size: buf.length })
    },
    async getFileUrl(id) {
      return services.getFile(id) ? `canvascl-file://files/${encodeURIComponent(id)}` : null
    },
    async openFile(id) {
      // Only files we imported ourselves (looked up by id, must live in the files dir) — never a renderer-supplied path.
      const file = services.getFile(id)
      if (!file) throw new Error(`File not found: ${id}`)
      const rel = relative(filesDir, file.path)
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('File is outside the data folder')
      // SVG/HTML-ish files could run script in a browser: only hand inert document/image types to the OS.
      if (!OPENABLE_EXTS.has(extname(file.path).toLowerCase())) throw new Error('This file type cannot be opened externally')
      const err = await shell.openPath(file.path)
      if (err) throw new Error(err)
    },
    async fetchLinkPreview(url) {
      const preview = await fetchLinkPreview(url)
      // The renderer's CSP only allows local images: cache og:image and favicon in the data dir (also works offline
      // and doesn't ping the site every time a board is opened).
      const cache = async (remote: string | undefined, label: string): Promise<string | undefined> => {
        if (!remote) return undefined
        const img = await downloadImage(remote)
        if (!img) return undefined
        const dest = join(filesDir, nanoid() + img.ext)
        await writeFile(dest, img.bytes)
        const file = services.registerFile({ name: `${label}${img.ext}`, mime: img.mime, path: dest, size: img.bytes.byteLength })
        return `canvascl-file://files/${encodeURIComponent(file.id)}`
      }
      const host = (() => {
        try {
          return new URL(url).hostname
        } catch {
          return 'link'
        }
      })()
      const [image, favicon] = await Promise.all([cache(preview.image, `${host}-preview`), cache(preview.favicon, `${host}-favicon`)])
      return { ...preview, image, favicon, remoteImage: preview.image, remoteFavicon: preview.favicon }
    },
    async clipUrl(input) {
      const { title, markdown } = await fetchPageForClip(input.url)
      return services.createCard({ title, markdown: withSourceHeader(input.url, markdown), tagIds: input.tagIds })
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
      const spec = stdioLaunchSpec(dataDir)
      return { running: !!mcpUrl, url: mcpUrl, stdioCommand: [spec.command, ...spec.args].map((a) => `"${a}"`).join(' ') }
    }
  })

  const reportActivity = (tool: string, args: Record<string, unknown>): void => {
    win?.webContents.send(MCP_ACTIVITY, { tool, args: JSON.stringify(args).slice(0, 200), at: Date.now() })
  }
  const keys = new KeyStore(dataDir)
  const getActiveConfig = (): { provider: AiProviderId; model: string; baseUrl?: string; apiKey: string | null; webSearch: boolean } => {
    const ai = settings.get().ai
    return { provider: ai.provider, model: ai.model, baseUrl: ai.baseUrl, apiKey: keys.resolve(ai.provider), webSearch: ai.webSearch === true }
  }
  const chat = new ChatAgent(services, app.getVersion(), getActiveConfig, reportActivity)
  ipcMain.handle('chat:send', (_e, text: string) => chat.send(text, (ev) => win?.webContents.send(CHAT_EVENT, ev)))
  ipcMain.handle('chat:stop', () => chat.stop())
  ipcMain.handle('chat:reset', () => chat.reset())
  ipcMain.handle('chat:hasKey', () => keys.hasKey(settings.get().ai.provider))
  ipcMain.handle('chat:setKey', (_e, key: string | null) => keys.set(settings.get().ai.provider, key))
  ipcMain.handle('chat:getProviderStatus', () =>
    (['anthropic', 'openai', 'gemini', 'mistral', 'xai', 'openrouter', 'ollama', 'custom'] as AiProviderId[]).map((provider) => ({
      provider,
      hasKey: getProviderMeta(provider).needsKey ? keys.hasKey(provider) : true
    }))
  )
  ipcMain.handle('chat:setProviderKey', (_e, provider: AiProviderId, key: string | null) => keys.set(provider, key))
  ipcMain.handle('chat:answerQuestions', (_e, requestId: string, answers: AskUserAnswer[]) => chat.answerQuestions(requestId, answers))
  ipcMain.handle('chat:skipQuestions', (_e, requestId: string) => chat.skipQuestions(requestId))
  ipcMain.handle('chat:listModels', async (_e, provider: AiProviderId, baseUrl?: string) => {
    if (provider === 'anthropic') {
      const client = new (await import('@anthropic-ai/sdk')).default({ apiKey: keys.resolve('anthropic') ?? undefined })
      const page = await client.models.list()
      const ids: string[] = []
      for await (const m of page) ids.push(m.id)
      return ids.sort()
    }
    return listOpenAiModels(keys.resolve(provider), resolveBaseUrl(provider, baseUrl))
  })

  const restartMcp = async (): Promise<void> => {
    await new Promise<void>((r) => (mcpServer ? mcpServer.close(() => r()) : r()))
    mcpServer = null
    mcpUrl = null
    const { httpEnabled, port } = settings.get().mcp
    if (!httpEnabled) return
    const started = await startHttpMcp(services, app.getVersion(), reportActivity, port)
    mcpServer = started?.server ?? null
    mcpUrl = started?.url ?? null
  }
  await restartMcp()

  applyCaptureShortcut(settings.get().quickCapture.enabled ? settings.get().quickCapture.accelerator : null)
  ipcMain.handle('app:openCapture', () => showCaptureWindow())
  ipcMain.handle('app:hideCapture', () => hideCaptureWindow())

  ipcMain.handle('app:getSettings', () => settings.get())
  ipcMain.handle('app:setSettings', async (_e, patch: SettingsPatch) => {
    const before = settings.get()
    const next = settings.set(patch)
    if (patch.quickCapture) {
      const ok = applyCaptureShortcut(next.quickCapture.enabled ? next.quickCapture.accelerator : null)
      if (!ok) {
        const reverted = settings.set({ quickCapture: { enabled: false } })
        win?.webContents.send(SETTINGS_CHANGED, reverted)
        throw new Error(`Could not register "${next.quickCapture.accelerator}" — it may already be used by another app.`)
      }
    }
    if (before.mcp.httpEnabled !== next.mcp.httpEnabled || before.mcp.port !== next.mcp.port) await restartMcp()
    win?.webContents.send(SETTINGS_CHANGED, next)
    return next
  })
  ipcMain.handle('app:getDataInfo', () => {
    const dbPath = join(dataDir, 'canvascl.db')
    const size = (p: string): number => (existsSync(p) ? statSync(p).size : 0)
    return {
      dataDir,
      dbPath,
      filesDir,
      dbBytes: size(dbPath) + size(dbPath + '-wal'),
      fileCount: readdirSync(filesDir).length,
      version: app.getVersion()
    }
  })
  ipcMain.handle('app:revealDataDir', () => shell.openPath(dataDir))
  ipcMain.handle('app:getMcpConnections', async () => ({
    desktop: isInClaudeDesktop(),
    code: await isInClaudeCode(),
    httpUrl: mcpUrl,
    stdio: stdioLaunchSpec(dataDir)
  }))
  ipcMain.handle('app:connectClaude', async (_e, target: 'desktop' | 'code') => {
    if (target === 'desktop') return addToClaudeDesktop(stdioLaunchSpec(dataDir))
    if (!mcpUrl) return { ok: false, message: 'Enable the HTTP MCP server first (Settings → MCP).' }
    return addToClaudeCode(mcpUrl)
  })

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
  // the hidden capture panel is also a BrowserWindow — only the main window counts here
  app.on('activate', () => (!win || win.isDestroyed()) && createWindow())
  if (!process.env.CANVASCL_SHOT)
    createTray({
      captureAccelerator: () => (settings.get().quickCapture.enabled ? toAccelerator(settings.get().quickCapture.accelerator) : null),
      openMain: showMain,
      openSettings: () => {
        showMain()
        win?.webContents.send('app:open-settings')
      }
    })
}

function showMain(): void {
  if (!win || win.isDestroyed()) createWindow()
  else {
    if (win.isMinimized()) win.restore()
    win.show()
  }
  app.focus({ steal: true })
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: !process.env.CANVASCL_SHOT
    }
  })
  win.once('ready-to-show', () => win?.show())
  if (!app.isPackaged && process.env.CANVASCL_SHOT) void devShot(win)
  win.on('closed', () => (win = null))
  hardenWindow(win, rendererUrl())
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !STDIO) app.quit()
})
app.on('will-quit', () => {
  teardownCapture()
  destroyTray()
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
        // "@click 120 300" | "@click .css-selector" | "@click text=Mindmap"
        let [x, y] = rest.split(/\s+/).map(Number)
        if (Number.isNaN(x) || Number.isNaN(y)) {
          const pos = (await w.webContents.executeJavaScript(`(() => {
            const q = ${JSON.stringify(rest)};
            const el = q.startsWith('text=')
              ? [...document.querySelectorAll('button,[role=menuitem],[data-topic],a,span,div')].reverse().find((e) => e.textContent.trim() === q.slice(5))
              : document.querySelector(q);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
          })()`)) as [number, number] | null
          if (!pos) {
            console.log(`[shot] step ${i}: target not found: ${rest}`)
            continue
          }
          ;[x, y] = pos
        }
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
    let img: Electron.NativeImage | null = null
    for (let attempt = 0; attempt < 4 && !img; attempt++) {
      try {
        w.webContents.invalidate()
        img = await w.webContents.capturePage()
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!img) {
      console.log(`[shot] step ${i}: capture failed`)
      continue
    }
    await writeFile(process.env.CANVASCL_SHOT!.replace('.png', `-${i}.png`), img.toPNG())
    // Dev-only: also snapshot any other visible window (e.g. the quick-capture window), for verification scripts.
    for (const other of BrowserWindow.getAllWindows()) {
      if (other === w || !other.isVisible()) continue
      try {
        const otherImg = await other.webContents.capturePage()
        await writeFile(process.env.CANVASCL_SHOT!.replace('.png', `-${i}-extra.png`), otherImg.toPNG())
      } catch (e) {
        console.log(`[shot] step ${i}: extra window capture failed:`, e)
      }
    }
  }
  if (process.env.CANVASCL_QUIT) {
    // flush localStorage so follow-up runs start where this one ended
    await w.webContents.session.flushStorageData()
    app.exit(0)
  }
}
