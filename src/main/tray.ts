import { Menu, nativeImage, Tray } from 'electron'
import { showCaptureWindow } from './capture'
import { TRAY_ICON_1X, TRAY_ICON_2X } from './trayIcon'

let tray: Tray | null = null

interface TrayActions {
  /** current quick-capture accelerator (Electron format) for the menu hint, or null when disabled */
  captureAccelerator: () => string | null
  openMain: () => void
  openSettings: () => void
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
  tray.setToolTip('CanvasCL')
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: 'Quick Capture', accelerator: actions.captureAccelerator() ?? undefined, click: () => showCaptureWindow(tray?.getBounds()) },
      { label: 'Open CanvasCL', click: actions.openMain },
      { type: 'separator' },
      { label: 'Settings…', click: actions.openSettings },
      { type: 'separator' },
      { label: 'Quit CanvasCL', role: 'quit' }
    ])
  tray.on('click', () => showCaptureWindow(tray?.getBounds()))
  tray.on('right-click', () => tray?.popUpContextMenu(menu()))
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
