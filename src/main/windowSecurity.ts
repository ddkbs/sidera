import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { shell, type BrowserWindow } from 'electron'
import { isSafeExternalUrl } from './netGuard'

/** The page every app window loads (dev server in development, bundled index.html otherwise). */
export function rendererUrl(): string {
  return process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

/**
 * Lock a window to the app's own page: new windows are denied (safe http(s)/mailto links open in the
 * default browser), top-level navigation away from `appUrl` is blocked, and <webview> is never attached.
 */
export function hardenWindow(win: BrowserWindow, appUrl: string): void {
  const openOutside = (url: string): void => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: 'deny' }
  })
  const page = (url: string): string => {
    try {
      const u = new URL(url)
      u.hash = ''
      return u.href
    } catch {
      return ''
    }
  }
  win.webContents.on('will-navigate', (e, url) => {
    if (page(url) === page(appUrl)) return
    e.preventDefault()
    openOutside(url)
  })
  win.webContents.on('will-attach-webview', (e) => e.preventDefault())
}
