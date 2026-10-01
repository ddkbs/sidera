import { API_METHODS, type AppBridge, type CanvasApi, type ChatBridge } from '@shared/api'
import type { AuthBridge } from '@shared/auth'
import { FILE_PROTOCOL, LEGACY_FILE_PROTOCOL } from '@shared/fileProtocol'
import { DEFAULT_SETTINGS, mergeSettings, type AppSettings } from '@shared/settings'
import type { FileRecord } from '@shared/types'
import type { SyncClient } from './client'
import { encodeImage } from './images'

/**
 * The desktop renderer talks to `window.api` / `window.app` / `window.events` (preload). On the iPad the same code runs
 * against these shims: every API call becomes an encrypted `call` over the SyncClient (the Mac decides what is
 * allowed), files arrive through the same channel as blob: URLs, and the Electron-only bridges are inert.
 */

const blobUrls = new Map<string, Promise<string>>()

/** blob: URL of an imported file, fetched once through the encrypted channel. */
export function fileBlobUrl(client: SyncClient, id: string): Promise<string> {
  let p = blobUrls.get(id)
  if (!p) {
    p = client.file(id).then(({ mime, data }) => {
      const bin = atob(data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return URL.createObjectURL(new Blob([bytes], { type: mime }))
    })
    p.catch(() => blobUrls.delete(id))
    blobUrls.set(id, p)
  }
  return p
}

/** Lets the user pick photos (camera, Photos, Files), re-encodes them on the device and uploads them. */
function pickImages(client: SyncClient): Promise<FileRecord[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    const done = async (): Promise<void> => {
      const files = [...(input.files ?? [])]
      input.remove()
      const out: FileRecord[] = []
      for (const f of files) {
        try {
          const img = await encodeImage(f)
          out.push((await client.call('importFileData', [{ name: f.name || 'Photo', mime: img.mime, dataBase64: img.data }])) as FileRecord)
        } catch (e) {
          console.warn('[sidera-ipad] image skipped', e)
        }
      }
      resolve(out)
    }
    input.addEventListener('change', () => void done(), { once: true })
    input.addEventListener('cancel', () => (input.remove(), resolve([])), { once: true })
    input.click()
  })
}

const FILE_SRC = new RegExp(`^(?:${FILE_PROTOCOL}|${LEGACY_FILE_PROTOCOL})://files/(.+)$`)

/** Images inside card content still point at sidera-file:// URLs: swap them for blob: URLs as they appear. */
function rewriteFileImages(client: SyncClient): void {
  const fix = (img: HTMLImageElement): void => {
    const m = FILE_SRC.exec(img.getAttribute('src') ?? '')
    if (!m) return
    let id: string
    try {
      id = decodeURIComponent(m[1])
    } catch {
      return
    }
    img.removeAttribute('src')
    void fileBlobUrl(client, id).then((url) => (img.src = url), () => undefined)
  }
  const scan = (root: ParentNode): void => root.querySelectorAll<HTMLImageElement>('img[src*="-file://"]').forEach(fix)
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof HTMLImageElement) fix(r.target)
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLImageElement) fix(n)
        else if (n instanceof Element) scan(n)
      })
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
}

export function installBridge(client: SyncClient): void {
  const api = Object.fromEntries(API_METHODS.map((name) => [name, (...args: unknown[]) => client.call(name, args)])) as unknown as CanvasApi
  api.getFileUrl = (id) => fileBlobUrl(client, id)
  api.importFiles = (paths) => (paths ? Promise.resolve([]) : pickImages(client))
  api.openFile = () => Promise.reject(new Error('Open this file on your Mac'))

  let settings: AppSettings = mergeSettings(DEFAULT_SETTINGS, client.settings ?? undefined)
  const settingsCbs = new Set<(s: AppSettings) => void>()
  client.on('settings', (s) => {
    settings = mergeSettings(settings, s)
    settingsCbs.forEach((cb) => cb(settings))
  })
  const app: AppBridge = {
    getSettings: async () => settings,
    // local only: the iPad never changes the Mac's settings
    setSettings: async (patch) => (settings = mergeSettings(settings, patch)),
    onSettingsChanged: (cb) => (settingsCbs.add(cb), () => void settingsCbs.delete(cb)),
    getDataInfo: () => Promise.reject(new Error('Not available on iPad')),
    revealDataDir: async () => undefined,
    getMcpConnections: () => Promise.reject(new Error('Not available on iPad')),
    connectClaude: async () => ({ ok: false, message: 'Not available on iPad' }),
    openCapture: async () => undefined,
    hideCapture: async () => undefined,
    isFullScreen: async () => false
  }
  const off = (): (() => void) => () => undefined
  const events = {
    onDbChanged: (cb: Parameters<Window['events']['onDbChanged']>[0]) => client.on('changed', cb),
    onMcpActivity: off,
    onOpenSettings: off,
    onFullscreenChanged: off
  }
  const chat: ChatBridge = {
    send: async () => undefined,
    stop: async () => undefined,
    reset: async () => undefined,
    hasKey: async () => false,
    setKey: async () => undefined,
    getProviderStatus: async () => [],
    setProviderKey: async () => undefined,
    listModels: async () => [],
    answerQuestions: async () => undefined,
    skipQuestions: async () => undefined,
    onEvent: off
  }
  const auth = { session: { kind: 'dev', account: null, storageNamespace: 'ipad' } } as unknown as AuthBridge
  Object.assign(window, { api, app, events, chat, auth, platform: 'ipad', files: { pathFor: () => '' } })
  rewriteFileImages(client)
}
