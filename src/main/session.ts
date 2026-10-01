import { mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'
import { dialog, safeStorage, shell, type BrowserWindow } from 'electron'
import { nanoid } from 'nanoid'
import { DB_CHANGED, MCP_ACTIVITY, type ApiMethod, type CanvasApi, type DbChangeScope } from '@shared/api'
import type { AiProviderId } from '@shared/ai'
import type { SessionKind } from '@shared/auth'
import { APP_NAME } from '@shared/brand'
import { fileUrl } from '@shared/fileProtocol'
import { withSourceHeader } from '@shared/html'
import { IPAD_STATUS_EVENT } from '@shared/ipad'
import { SETTINGS_CHANGED, type AppSettings } from '@shared/settings'
import { mirroredSettings, writeScopes } from '@shared/sync/protocol'
import { ChatAgent } from './ai/chat'
import { IpadController } from './ipad/controller'
import { KeyStore } from './ai/keys'
import { DB_FILENAME, migrateDbFilename, openDatabase, type DB } from './db/client'
import { stdioLaunchSpec } from './integrations'
import { startHttpMcp } from './mcp/server'
import { createServices, type Services } from './services'
import { IMPORT_MIME } from './services/files'
import { exportCards, importCards } from './services/markdown'
import { seedWelcome } from './services/seed'
import { SettingsStore } from './settings'
import { downloadImage, fetchLinkPreview, fetchPageForClip } from './web'

const OPENABLE_EXTS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif', '.md', '.txt'])

export interface SessionOptions {
  dataDir: string
  kind: SessionKind
  version: string
  /** the main window (may be null while it is closed) */
  window: () => BrowserWindow | null
  /** false for the headless `--mcp-stdio` mode: no HTTP server, no watchers */
  interactive?: boolean
}

export type Handlers = { [K in keyof CanvasApi]: (...args: Parameters<CanvasApi[K]>) => unknown }

/**
 * Everything that belongs to one open data folder (an account, the guest workspace or a dev folder):
 * database, settings, API keys, services, chat agent, HTTP MCP server and the external-write watcher.
 * Created on sign-in, torn down with `close()` on sign-out / account switch.
 */
export class Session {
  readonly dataDir: string
  readonly filesDir: string
  readonly kind: SessionKind
  readonly db: DB
  readonly settings: SettingsStore
  readonly keys: KeyStore
  readonly services: Services
  readonly chat: ChatAgent
  readonly handlers: Handlers
  /** Sidera for iPad: paired devices + the LAN server while a board is shared (separate from MCP) */
  readonly ipad: IpadController
  /** whiteboard seeded on first open — the window opens it once */
  welcomeBoardId: string | null = null
  mcpUrl: string | null = null

  private mcpServer: Server | null = null
  private changeTimer: NodeJS.Timeout | null = null
  private pending = new Set<DbChangeScope>()
  /** desktop-renderer writes the services don't announce (e.g. drags): only the iPad needs to hear about them */
  private ipadPending = new Set<DbChangeScope>()
  private ipadTimer: NodeJS.Timeout | null = null
  private watcher: NodeJS.Timeout | null = null
  private closed = false

  constructor(private opts: SessionOptions) {
    this.dataDir = opts.dataDir
    this.kind = opts.kind
    this.filesDir = join(this.dataDir, 'files')
    mkdirSync(this.filesDir, { recursive: true })
    migrateDbFilename(this.dataDir)
    this.db = openDatabase(join(this.dataDir, DB_FILENAME))
    this.settings = new SettingsStore(this.dataDir)
    this.services = createServices(this.db, (s) => this.emit(s), {
      get: () => this.settings.get().activeProfileId,
      set: (id) => {
        if (this.settings.get().activeProfileId === id) return
        this.send(SETTINGS_CHANGED, this.settings.set({ activeProfileId: id }))
      }
    }, { filesDir: this.filesDir })
    // deleted cards/whiteboards stay restorable (undo) for 30 days
    this.services.purgeDeleted(30 * 24 * 60 * 60 * 1000)
    this.keys = new KeyStore(this.dataDir)
    this.chat = new ChatAgent(this.services, opts.version, () => this.activeAiConfig(), (tool, args) => this.reportActivity(tool, args))
    this.handlers = this.buildHandlers()
    this.ipad = new IpadController({
      dataDir: this.dataDir,
      services: this.services,
      box: safeStorage.isEncryptionAvailable() ? { encrypt: (t) => safeStorage.encryptString(t), decrypt: (b) => safeStorage.decryptString(b) } : null,
      call: async (method, args) => (this.handlers[method] as (...a: unknown[]) => unknown)(...args),
      readFile: (id) => this.readFileForDevice(id),
      settings: () => mirroredSettings(this.settings.get()),
      onWrite: (scopes) => scopes.forEach((sc) => this.emit(sc)),
      sendStatus: (st) => this.send(IPAD_STATUS_EVENT, st)
    })

    if (opts.interactive !== false) {
      // Detect writes from other processes (e.g. `--mcp-stdio` instances) and refresh the UI
      let dataVersion = this.db.$client.pragma('data_version', { simple: true })
      this.watcher = setInterval(() => {
        const v = this.db.$client.pragma('data_version', { simple: true })
        if (v !== dataVersion) {
          dataVersion = v
          this.emit('all')
        }
      }, 1500)
      if (seedWelcome(this.services)) this.welcomeBoardId = this.services.listWhiteboards()[0]?.id ?? null
      void this.ipad.autostart()
    }
  }

  send(channel: string, payload: unknown): void {
    if (this.closed) return
    // (ipad is created after the services, which may already announce a profile)
    if (channel === SETTINGS_CHANGED) this.ipad?.pushSettings(mirroredSettings(payload as AppSettings))
    const w = this.opts.window()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }

  private emit(scope: DbChangeScope): void {
    if (this.closed) return
    this.pending.add(scope)
    if (this.changeTimer) return
    this.changeTimer = setTimeout(() => {
      const scopes = [...this.pending]
      this.send(DB_CHANGED, scopes)
      this.ipad.notifyChanged(scopes)
      this.pending.clear()
      this.changeTimer = null
    }, 30)
  }

  /** After every desktop-renderer API call (IPC): writes reach a connected iPad even when the services stay quiet. */
  noteRendererCall(method: ApiMethod): void {
    const scopes = this.closed ? null : writeScopes(method)
    if (!scopes) return
    scopes.forEach((sc) => this.ipadPending.add(sc))
    if (this.ipadTimer) return
    this.ipadTimer = setTimeout(() => {
      this.ipadTimer = null
      const list = [...this.ipadPending]
      this.ipadPending.clear()
      if (!this.closed) this.ipad.notifyChanged(list)
    }, 30)
  }

  /** Bytes of an imported file for the iPad (looked up by id; must live in the files dir). */
  private async readFileForDevice(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
    const file = this.services.getFile(id)
    if (!file) return null
    const rel = relative(this.filesDir, file.path)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
    return { mime: file.mime, bytes: await readFile(file.path) }
  }

  reportActivity(tool: string, args: Record<string, unknown>): void {
    this.send(MCP_ACTIVITY, { tool, args: JSON.stringify(args).slice(0, 200), at: Date.now() })
  }

  activeAiConfig(): { provider: AiProviderId; model: string; baseUrl?: string; apiKey: string | null; webSearch: boolean } {
    const ai = this.settings.get().ai
    return { provider: ai.provider, model: ai.model, baseUrl: ai.baseUrl, apiKey: this.keys.resolve(ai.provider), webSearch: ai.webSearch === true }
  }

  /** Claude Desktop launch spec. Accounts follow whoever is signed in; dev/guest folders are pinned. */
  stdioSpec(): ReturnType<typeof stdioLaunchSpec> {
    return stdioLaunchSpec(this.kind === 'account' ? null : this.dataDir)
  }

  async restartMcp(): Promise<void> {
    await this.stopMcp()
    if (this.closed) return
    const { httpEnabled } = this.settings.get().mcp
    if (!httpEnabled) return
    // SIDERA_MCP_PORT overrides the setting (parallel dev/test runs)
    const port = Number(process.env.SIDERA_MCP_PORT) || this.settings.get().mcp.port
    const started = await startHttpMcp(this.services, this.opts.version, (tool, args) => this.reportActivity(tool, args), port)
    // signed out while the server was starting
    if (this.closed) {
      started?.server.close()
      return
    }
    this.mcpServer = started?.server ?? null
    this.mcpUrl = started?.url ?? null
  }

  /** Stops the HTTP server right away (in-flight sockets are dropped); resolves once it has fully closed. */
  private stopMcp(): Promise<void> {
    const server = this.mcpServer
    this.mcpServer = null
    this.mcpUrl = null
    if (!server) return Promise.resolve()
    const done = new Promise<void>((r) => server.close(() => r()))
    // Streamable HTTP clients may hold keep-alive sockets: drop them so close() resolves promptly.
    server.closeAllConnections()
    return done
  }

  /** Path of the active profile's picture relative to the data folder (for the account tile), if any. */
  avatarRelativePath(): string | null {
    try {
      const fileId = this.services.getActiveProfile().avatarFileId
      const file = fileId ? this.services.getFile(fileId) : null
      if (!file) return null
      const rel = relative(this.dataDir, file.path)
      return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : null
    } catch {
      return null
    }
  }

  /** Tears everything down. The database is closed synchronously, so this is safe to fire from before-quit. */
  close(): Promise<void> {
    if (this.closed) return Promise.resolve()
    this.closed = true
    this.chat.stop()
    if (this.watcher) clearInterval(this.watcher)
    if (this.changeTimer) clearTimeout(this.changeTimer)
    if (this.ipadTimer) clearTimeout(this.ipadTimer)
    this.watcher = this.changeTimer = this.ipadTimer = null
    this.pending.clear()
    const stopped = Promise.all([this.stopMcp(), this.ipad.shutdown('signed-out')]).then(() => undefined)
    this.db.$client.close()
    return stopped
  }

  private buildHandlers(): Handlers {
    const { services, filesDir } = this
    const win = (): BrowserWindow | undefined => this.opts.window() ?? undefined
    const showOpen = (options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> => {
      const w = win()
      return w ? dialog.showOpenDialog(w, options) : dialog.showOpenDialog(options)
    }
    return {
      ...services,
      async importFiles(paths) {
        let filePaths = (paths ?? []).filter((p) => IMPORT_MIME[extname(p).toLowerCase()])
        if (!paths) {
          const res = await showOpen({
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Documents & images', extensions: Object.keys(IMPORT_MIME).map((e) => e.slice(1)) }]
          })
          if (res.canceled) return []
          filePaths = res.filePaths
        }
        return filePaths.map((p) => services.importFileFromPath(p))
      },
      async importFileData({ name, mime, dataBase64 }) {
        return services.importFileBytes({ name, mime, bytes: Buffer.from(dataBase64, 'base64') })
      },
      async getFileUrl(id) {
        return services.getFile(id) ? fileUrl(id) : null
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
          return fileUrl(file.id)
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
        const res = await showOpen({ title: 'Export cards as Markdown', properties: ['openDirectory', 'createDirectory'] })
        if (res.canceled || !res.filePaths[0]) return null
        const dir = join(res.filePaths[0], `${APP_NAME} export ${new Date().toISOString().slice(0, 10)}`)
        const files = exportCards(services)
        for (const f of files) {
          const target = join(dir, f.name)
          await mkdir(dirname(target), { recursive: true })
          await writeFile(target, f.content, 'utf8')
        }
        return { count: files.length, dir }
      },
      async importMarkdown() {
        const res = await showOpen({
          title: 'Import Markdown files',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
        })
        if (res.canceled) return { count: 0 }
        const files = await Promise.all(res.filePaths.map(async (p) => ({ name: basename(p), content: await readFile(p, 'utf8') })))
        return { count: importCards(services, files) }
      },
      getMcpInfo: async () => {
        const spec = this.stdioSpec()
        const env = Object.entries(spec.env).map(([k, v]) => `${k}="${v}" `).join('')
        return { running: !!this.mcpUrl, url: this.mcpUrl, stdioCommand: env + [spec.command, ...spec.args].map((a) => `"${a}"`).join(' ') }
      }
    }
  }
}
