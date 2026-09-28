import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import Database from 'better-sqlite3'
import { CHAT_EVENT, FULLSCREEN_CHANGED, type AskUserAnswer } from '@shared/api'
import { getProviderMeta, resolveBaseUrl, type AiProviderId } from '@shared/ai'
import {
  GUEST_NAMESPACE,
  namespacedKey,
  type AccountPatch,
  type AuthResult,
  type AuthStatus,
  type NewAccountInput,
  type SessionInfo,
  type SessionKind
} from '@shared/auth'
import { APP_NAME } from '@shared/brand'
import { SETTINGS_CHANGED, type SettingsPatch } from '@shared/settings'
import { AccountRegistry, type StoredAccount } from './accounts'
import { applyCaptureShortcut, hideCaptureWindow, showCaptureWindow, teardownCapture, toAccelerator } from './capture'
import { createTray, destroyTray } from './tray'
import { addToClaudeCode, addToClaudeDesktop, isInClaudeCode, isInClaudeDesktop } from './integrations'
import { listModels as listOpenAiModels } from './ai/openaiCompatible'
import { registerIpc } from './ipc'
import { startStdioMcp } from './mcp/server'
import { Session } from './session'
import { hardenWindow, rendererUrl } from './windowSecurity'

const STDIO = process.argv.includes('--mcp-stdio')
// The data folder stays at its pre-rename location so a product rename never moves anyone's data;
// set before setName, which would otherwise derive userData from the new name.
app.setPath('userData', join(app.getPath('appData'), 'CanvasCL'))
app.setName(APP_NAME)
/** Dev/test escape hatch: open this folder directly, no accounts, no sign-in screen (devShot, tests, stdio). */
const DEV_DATA_DIR = process.env.CANVASCL_DATA_DIR
/** Dev-only: account registry in a scratch folder, WITH the sign-in screen (to verify the auth flow). */
const AUTH_ROOT = !app.isPackaged && !DEV_DATA_DIR ? process.env.CANVASCL_AUTH_ROOT : undefined
// Automated UI checks get their own browser profile so they never collide with a running app (localStorage lock, cache).
if (process.env.CANVASCL_SHOT && DEV_DATA_DIR) app.setPath('userData', join(DEV_DATA_DIR, 'userdata'))
if (AUTH_ROOT) app.setPath('userData', join(AUTH_ROOT, 'userdata'))
const registry = new AccountRegistry(AUTH_ROOT ?? app.getPath('userData'))

let win: BrowserWindow | null = null
let session: Session | null = null
let sessionInfo: SessionInfo | null = null
let accountId: string | null = null

const requireSession = (): Session => {
  if (!session) throw new Error('Not signed in')
  return session
}

if (STDIO) {
  app.dock?.hide()
  process.stdin.on('end', () => app.quit())
  // Serves the account that was signed in most recently (or the pinned CANVASCL_DATA_DIR).
  app.whenReady().then(() => {
    const dataDir = DEV_DATA_DIR ?? registry.activeDataDir() ?? registry.legacyDir
    session = new Session({ dataDir, kind: DEV_DATA_DIR ? 'dev' : 'account', version: app.getVersion(), window: () => null, interactive: false })
    return startStdioMcp(session.services, app.getVersion())
  })
} else {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'canvascl-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
  ])
  void bootstrap()
}

// ─── session lifecycle ────────────────────────────────────────────────────────────────────────────

/** Reads who used the pre-accounts data folder, so the "Welcome back" screen can prefill the name. */
function peekLegacyProfile(dataDir: string): { name?: string | null; color?: string | null } | null {
  let activeId: string | undefined
  try {
    activeId = (JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as { activeProfileId?: string }).activeProfileId
  } catch {
    activeId = undefined
  }
  const db = new Database(join(dataDir, 'canvascl.db'), { readonly: true, fileMustExist: true })
  try {
    const rows = db.prepare('SELECT id, name, color FROM profiles ORDER BY created_at').all() as { id: string; name: string; color: string }[]
    return rows.find((r) => r.id === activeId) ?? rows[0] ?? null
  } finally {
    db.close()
  }
}

const storageNamespaceFor = (kind: SessionKind, acc: StoredAccount | null): string =>
  kind === 'guest' ? GUEST_NAMESPACE : kind === 'dev' || !acc || acc.dataDir === registry.legacyDir ? '' : acc.id

async function openSession(kind: SessionKind, dataDir: string, acc: StoredAccount | null = null): Promise<void> {
  await closeSession()
  const s = new Session({ dataDir, kind, version: app.getVersion(), window: () => win })
  session = s
  accountId = acc?.id ?? null
  sessionInfo = { kind, account: acc ? registry.toPublic(acc) : null, storageNamespace: storageNamespaceFor(kind, acc) }
  if (acc) syncProfileFromAccount(s, acc)
  else if (kind === 'guest') syncProfileFromAccount(s, { name: 'Guest', color: 'gray' })
  await s.restartMcp()
  const qc = s.settings.get().quickCapture
  applyCaptureShortcut(qc.enabled ? qc.accelerator : null)
}

/** The account's name & color are its identity: mirror them onto the knowledge base's active profile (authorship). */
function syncProfileFromAccount(s: Session, acc: Pick<StoredAccount, 'name' | 'color'>): void {
  try {
    const p = s.services.getActiveProfile()
    if (p.name !== acc.name || p.color !== acc.color) s.services.updateProfile({ id: p.id, name: acc.name, color: acc.color })
  } catch (e) {
    console.warn('[accounts] could not sync profile', e)
  }
}

/** Ends the current session. A guest session's workspace is wiped unless `keepGuest` (save-as-account). */
async function closeSession(keepGuest = false): Promise<void> {
  const s = session
  if (!s) return
  if (accountId) registry.setAvatar(accountId, s.avatarRelativePath())
  session = null
  sessionInfo = null
  accountId = null
  // the capture panel's renderer belongs to the old account: drop it with its global shortcut
  teardownCapture()
  await s.close()
  if (s.kind === 'guest' && !keepGuest) registry.wipeGuest()
}

/** Reload the main window so the renderer starts fresh for the new session (or the sign-in screen). */
function reloadWindows(): void {
  if (win && !win.isDestroyed()) win.webContents.reload()
  else if (app.isReady()) createWindow()
}

/** Removes renderer localStorage keys of a namespace (deleted account, previous guest). */
async function clearNamespace(namespace: string): Promise<void> {
  if (!namespace || !win || win.isDestroyed()) return
  const suffix = namespacedKey('', namespace)
  await win.webContents
    .executeJavaScript(`for (const k of Object.keys(localStorage)) if (k.endsWith(${JSON.stringify(suffix)})) localStorage.removeItem(k)`)
    .catch(() => undefined)
}

const failures = new Map<string, number>()
/** Slows down repeated wrong passwords (local brute-force deterrent, not real security). */
async function throttle(id: string): Promise<void> {
  const n = failures.get(id) ?? 0
  if (n) await new Promise((r) => setTimeout(r, Math.min(250 * 2 ** n, 4000)))
}

const fail = (e: unknown): AuthResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) })

async function signInTo(acc: StoredAccount, staySignedIn: boolean): Promise<AuthResult> {
  if (!existsSync(acc.dataDir)) return { ok: false, error: 'This account’s data folder is missing.' }
  if (sessionInfo?.kind === 'guest') await clearNamespace(GUEST_NAMESPACE)
  registry.markSignedIn(acc.id, staySignedIn)
  await openSession('account', acc.dataDir, registry.get(acc.id) ?? acc)
  reloadWindows()
  return { ok: true }
}

function registerAuthIpc(): void {
  const noAccounts = (): AuthResult | null => (DEV_DATA_DIR ? { ok: false, error: 'Accounts are disabled while CANVASCL_DATA_DIR is set.' } : null)

  ipcMain.on('auth:sessionSync', (e) => (e.returnValue = sessionInfo))
  ipcMain.handle('auth:status', (): AuthStatus => ({ session: sessionInfo, lastAccountId: registry.lastAccountId }))
  ipcMain.handle('auth:listAccounts', () => registry.list())

  ipcMain.handle('auth:createAccount', async (_e, input: NewAccountInput): Promise<AuthResult> => {
    const blocked = noAccounts()
    if (blocked) return blocked
    try {
      return await signInTo(registry.create(input), input.staySignedIn ?? true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('auth:setupAccount', async (_e, id: string, input: NewAccountInput): Promise<AuthResult> => {
    try {
      return await signInTo(registry.finishSetup(id, input), input.staySignedIn ?? true)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('auth:signIn', async (_e, id: string, password?: string, staySignedIn = true): Promise<AuthResult> => {
    const blocked = noAccounts()
    if (blocked) return blocked
    const acc = registry.get(id)
    if (!acc) return { ok: false, error: 'Account not found' }
    if (acc.needsSetup) return { ok: false, error: 'Finish setting up this account first' }
    await throttle(id)
    if (!registry.verifyPassword(id, password)) {
      failures.set(id, (failures.get(id) ?? 0) + 1)
      return { ok: false, error: 'Wrong password' }
    }
    failures.delete(id)
    try {
      return await signInTo(acc, staySignedIn)
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('auth:continueAsGuest', async (): Promise<AuthResult> => {
    const blocked = noAccounts()
    if (blocked) return blocked
    try {
      await closeSession()
      await clearNamespace(GUEST_NAMESPACE)
      registry.signedOut()
      await openSession('guest', registry.prepareGuest())
      reloadWindows()
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('auth:saveGuestAsAccount', async (_e, input: NewAccountInput): Promise<AuthResult> => {
    if (session?.kind !== 'guest') return { ok: false, error: 'Not in a guest session' }
    try {
      registry.validate(input)
    } catch (e) {
      return fail(e)
    }
    // The database must be closed before its folder moves.
    await closeSession(true)
    try {
      const acc = registry.saveGuestAsAccount(input)
      // keep the guest's tabs & UI state: copy them to the new account's namespace
      await win?.webContents
        .executeJavaScript(
          `for (const k of Object.keys(localStorage)) if (k.endsWith(${JSON.stringify(namespacedKey('', GUEST_NAMESPACE))})) { localStorage.setItem(k.slice(0, -${GUEST_NAMESPACE.length + 1}) + ${JSON.stringify(namespacedKey('', acc.id))}, localStorage.getItem(k)); localStorage.removeItem(k) }`
        )
        .catch(() => undefined)
      return await signInTo(acc, input.staySignedIn ?? true)
    } catch (e) {
      // e.g. the move failed: reopen the guest workspace untouched
      if (existsSync(registry.guestDir)) await openSession('guest', registry.guestDir)
      reloadWindows()
      return fail(e)
    }
  })

  ipcMain.handle('auth:signOut', async () => {
    if (DEV_DATA_DIR) return
    await closeSession()
    await clearNamespace(GUEST_NAMESPACE)
    registry.signedOut()
    reloadWindows()
  })

  ipcMain.handle('auth:updateAccount', (_e, patch: AccountPatch): AuthResult => {
    if (!accountId || !session) return { ok: false, error: 'Not signed in to an account' }
    try {
      const acc = registry.update(accountId, patch)
      if (patch.name !== undefined || patch.color !== undefined) syncProfileFromAccount(session, acc)
      sessionInfo = { ...sessionInfo!, account: registry.toPublic(acc) }
      return { ok: true }
    } catch (e) {
      return fail(e)
    }
  })

  ipcMain.handle('auth:deleteAccount', async (_e, id: string, password?: string): Promise<AuthResult> => {
    const acc = registry.get(id)
    if (!acc) return { ok: false, error: 'Account not found' }
    await throttle(id)
    if (!registry.verifyPassword(id, password)) {
      failures.set(id, (failures.get(id) ?? 0) + 1)
      return { ok: false, error: 'Wrong password' }
    }
    failures.delete(id)
    const wasActive = accountId === id
    if (wasActive) await closeSession()
    try {
      // Never hard-delete someone's knowledge base: it goes to the Trash and can be put back.
      if (existsSync(acc.dataDir)) await shell.trashItem(acc.dataDir)
    } catch (e) {
      if (wasActive) await openSession('account', acc.dataDir, acc)
      return fail(e)
    }
    registry.remove(id)
    await clearNamespace(storageNamespaceFor('account', acc))
    if (wasActive) reloadWindows()
    return { ok: true }
  })
}

// ─── app ──────────────────────────────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  await app.whenReady()

  protocol.handle('canvascl-file', async (req) => {
    // canvascl-file://files/<id> — ids live in the path because hostnames are lower-cased
    const id = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
    const f = session?.services.getFile(id)
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

  registerIpc(() => requireSession().handlers)
  registerAuthIpc()

  const chat = (): Session['chat'] => requireSession().chat
  const keys = (): Session['keys'] => requireSession().keys
  const settings = (): Session['settings'] => requireSession().settings
  ipcMain.handle('chat:send', (_e, text: string) => {
    const s = requireSession()
    return s.chat.send(text, (ev) => s.send(CHAT_EVENT, ev))
  })
  ipcMain.handle('chat:stop', () => chat().stop())
  ipcMain.handle('chat:reset', () => chat().reset())
  ipcMain.handle('chat:hasKey', () => keys().hasKey(settings().get().ai.provider))
  ipcMain.handle('chat:setKey', (_e, key: string | null) => keys().set(settings().get().ai.provider, key))
  ipcMain.handle('chat:getProviderStatus', () =>
    (['anthropic', 'openai', 'gemini', 'mistral', 'xai', 'openrouter', 'ollama', 'custom'] as AiProviderId[]).map((provider) => ({
      provider,
      hasKey: getProviderMeta(provider).needsKey ? keys().hasKey(provider) : true,
      keyReadError: getProviderMeta(provider).needsKey && !keys().hasKey(provider) && keys().hadDecryptError()
    }))
  )
  ipcMain.handle('chat:setProviderKey', (_e, provider: AiProviderId, key: string | null) => keys().set(provider, key))
  ipcMain.handle('chat:answerQuestions', (_e, requestId: string, answers: AskUserAnswer[]) => chat().answerQuestions(requestId, answers))
  ipcMain.handle('chat:skipQuestions', (_e, requestId: string) => chat().skipQuestions(requestId))
  ipcMain.handle('chat:listModels', async (_e, provider: AiProviderId, baseUrl?: string) => {
    if (provider === 'anthropic') {
      const client = new (await import('@anthropic-ai/sdk')).default({ apiKey: keys().resolve('anthropic') ?? undefined })
      const page = await client.models.list()
      const ids: string[] = []
      for await (const m of page) ids.push(m.id)
      return ids.sort()
    }
    return listOpenAiModels(keys().resolve(provider), resolveBaseUrl(provider, baseUrl))
  })

  // Sidera Draw (iPad companion). Only the main window may open a LAN session.
  const fromMain = (e: Electron.IpcMainInvokeEvent): boolean => !!win && !win.isDestroyed() && e.sender === win.webContents
  ipcMain.handle('draw:start', (e, whiteboardId: unknown, address?: unknown) => {
    if (!fromMain(e) || typeof whiteboardId !== 'string' || whiteboardId.length > 64) throw new Error('Invalid request')
    return requireSession().draw.start(whiteboardId, typeof address === 'string' ? address : undefined)
  })
  ipcMain.handle('draw:cancel', (e) => (fromMain(e) ? session?.draw.close('cancelled') : undefined))

  // Signed out there is no capture target: open the main window (sign-in screen) instead.
  ipcMain.handle('app:openCapture', () => (session ? showCaptureWindow() : showMain()))
  ipcMain.handle('app:hideCapture', () => hideCaptureWindow())
  ipcMain.handle('app:isFullScreen', () => win?.isFullScreen() ?? false)

  ipcMain.handle('app:getSettings', () => settings().get())
  ipcMain.handle('app:setSettings', async (_e, patch: SettingsPatch) => {
    const s = requireSession()
    const before = s.settings.get()
    const next = s.settings.set(patch)
    if (patch.quickCapture) {
      const ok = applyCaptureShortcut(next.quickCapture.enabled ? next.quickCapture.accelerator : null)
      if (!ok) {
        const reverted = s.settings.set({ quickCapture: { enabled: false } })
        s.send(SETTINGS_CHANGED, reverted)
        throw new Error(`Could not register "${next.quickCapture.accelerator}" — it may already be used by another app.`)
      }
    }
    if (before.mcp.httpEnabled !== next.mcp.httpEnabled || before.mcp.port !== next.mcp.port) await s.restartMcp()
    s.send(SETTINGS_CHANGED, next)
    return next
  })
  ipcMain.handle('app:getDataInfo', () => {
    const { dataDir, filesDir } = requireSession()
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
  ipcMain.handle('app:revealDataDir', () => shell.openPath(requireSession().dataDir))
  ipcMain.handle('app:getMcpConnections', async () => {
    const s = requireSession()
    return { desktop: isInClaudeDesktop(), code: await isInClaudeCode(), httpUrl: s.mcpUrl, stdio: s.stdioSpec() }
  })
  ipcMain.handle('app:connectClaude', async (_e, target: 'desktop' | 'code') => {
    const s = requireSession()
    if (target === 'desktop') {
      if (s.kind === 'guest') return { ok: false, message: 'Save the guest workspace as an account before connecting Claude Desktop.' }
      return addToClaudeDesktop(s.stdioSpec())
    }
    if (!s.mcpUrl) return { ok: false, message: 'Enable the HTTP MCP server first (Settings → MCP).' }
    return addToClaudeCode(s.mcpUrl)
  })

  if (DEV_DATA_DIR) await openSession('dev', DEV_DATA_DIR)
  else {
    registry.migrateLegacy(peekLegacyProfile)
    const auto = registry.autoSignInAccount()
    if (auto && existsSync(auto.dataDir)) {
      registry.markSignedIn(auto.id, true)
      await openSession('account', auto.dataDir, auto)
    }
  }

  createWindow()
  // the hidden capture panel is also a BrowserWindow — only the main window counts here
  app.on('activate', () => (!win || win.isDestroyed()) && createWindow())
  if (!process.env.CANVASCL_SHOT)
    createTray({
      captureAccelerator: () => {
        const qc = session?.settings.get().quickCapture
        return qc?.enabled ? toAccelerator(qc.accelerator) : null
      },
      canCapture: () => !!session,
      openMain: showMain,
      openSettings: () => {
        showMain()
        if (session) win?.webContents.send('app:open-settings')
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
    title: APP_NAME,
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
  const w = win
  w.once('ready-to-show', () => w.show())
  w.on('enter-full-screen', () => w.webContents.send(FULLSCREEN_CHANGED, true))
  w.on('leave-full-screen', () => w.webContents.send(FULLSCREEN_CHANGED, false))
  // First open of a fresh knowledge base: show the welcome board (once).
  w.webContents.on('did-finish-load', () => {
    const s = session
    if (!s?.welcomeBoardId || !sessionInfo || process.env.CANVASCL_SHOT) return
    const key = JSON.stringify(namespacedKey('canvascl.ui', sessionInfo.storageNamespace))
    const ui = JSON.stringify(JSON.stringify({ view: { type: 'whiteboard', id: s.welcomeBoardId } }))
    s.welcomeBoardId = null
    void w.webContents.executeJavaScript(`localStorage.getItem(${key}) || (localStorage.setItem(${key}, ${ui}), location.reload())`)
  })
  if (!app.isPackaged && process.env.CANVASCL_SHOT) void devShot(w)
  w.on('closed', () => (win = null))
  hardenWindow(w, rendererUrl())
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(join(__dirname, '../renderer/index.html'))
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && !STDIO) app.quit()
})
app.on('will-quit', () => {
  teardownCapture()
  destroyTray()
})
app.on('before-quit', () => {
  // closes the database synchronously; the guest workspace survives a quit and is wiped on the next guest start
  if (session && accountId) registry.setAvatar(accountId, session.avatarRelativePath())
  void session?.close()
})

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
