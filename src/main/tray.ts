import { APP_NAME } from '@shared/brand'
import { Menu, nativeImage, Tray } from 'electron'
import { showCaptureWindow } from './capture'
import { TRAY_ICON_1X, TRAY_ICON_2X } from './trayIcon'

let tray: Tray | null = null

interface TrayActions {
  /** current quick-capture accelerator (Electron format) for the menu hint, or null when disabled */
  captureAccelerator: () => string | null
  /** false while signed out: quick capture has no knowledge base to write to, so the main window opens instead */
  canCapture: () => boolean
  openMain: () => void
  openSettings: () => void
  /** runs in the main window's renderer (opens it first) */
  command: (type: 'new-whiteboard' | 'new-card' | 'search') => void
  /** boards for "Screenshot to Board", most recently edited first */
  boards: () => { id: string; name: string }[]
  screenshotTo: (whiteboardId: string) => void
}

function icon(): Electron.NativeImage {
  const img = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_1X, 'base64'), { scaleFactor: 1 })
  img.addRepresentation({ scaleFactor: 2, buffer: Buffer.from(TRAY_ICON_2X, 'base64') })
  img.setTemplateImage(true) // macOS tints it for light/dark menu bars
  return img
}

/** Menu-bar icon: left click opens quick capture right under the icon, right click shows the menu. */
export function createTray(actions: TrayActions): void {
  if (tray || process.platform !== 'darwin') return
  tray = new Tray(icon())
  const capture = (): void => (actions.canCapture() ? showCaptureWindow(tray?.getBounds()) : actions.openMain())
  tray.setToolTip(APP_NAME)
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Quick Capture', enabled: actions.canCapture(), accelerator: actions.captureAccelerator() ?? undefined, click: capture },
      { label: 'New Whiteboard', enabled: actions.canCapture(), click: () => actions.command('new-whiteboard') },
      { label: 'New Card', enabled: actions.canCapture(), click: () => actions.command('new-card') },
      { label: 'Search…', enabled: actions.canCapture(), click: () => actions.command('search') },
      {
        label: 'Screenshot to Board',
        enabled: actions.canCapture(),
        submenu: actions.canCapture()
          ? actions.boards().slice(0, 15).map((b) => ({ label: b.name || 'Untitled', click: () => actions.screenshotTo(b.id) }))
          : []
      },
      { type: 'separator' },
      { label: `Open ${APP_NAME}`, click: actions.openMain },
      { type: 'separator' },
      { label: 'Settings…', click: actions.openSettings },
      { type: 'separator' },
      { label: `Quit ${APP_NAME}`, role: 'quit' }
    ])
  tray.on('click', capture)
  tray.on('right-click', () => tray?.popUpContextMenu(menu()))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
