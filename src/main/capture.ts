import { join } from 'node:path'
import { BrowserWindow, globalShortcut, screen, type Rectangle } from 'electron'
import { hardenWindow, rendererUrl } from './windowSecurity'

const WIDTH = 560
const HEIGHT = 220

let win: BrowserWindow | null = null
let registeredAccelerator: string | null = null

/** "Ctrl+Alt+Space" (our shortcut-recorder format) → "Control+Alt+Space" (Electron accelerator). */
export function toAccelerator(binding: string): string {
  const KEY: Record<string, string> = { Esc: 'Escape', Space: 'Space', Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right' }
  const MOD: Record<string, string> = { Mod: 'CommandOrControl', Ctrl: 'Control', Alt: 'Alt', Shift: 'Shift' }
  const parts = binding.split('+')
  const key = parts.pop() ?? ''
  return [...parts.map((m) => MOD[m] ?? m), KEY[key] ?? key].join('+')
}

function createCaptureWindow(): BrowserWindow {
  const w = new BrowserWindow({
    // macOS NSPanel with NSWindowStyleMaskNonactivatingPanel: takes keyboard focus and floats over any app
    // (incl. full-screen ones) WITHOUT activating CanvasCL — so the main window never jumps to the front.
    type: 'panel',
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    vibrancy: 'popover',
    webPreferences: { preload: join(__dirname, '../preload/index.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  hardenWindow(w, rendererUrl())
  w.setAlwaysOnTop(true, 'screen-saver')
  // skipTransformProcessType: without it Electron briefly turns the app into a UIElement process, which
  // strips the traffic-light buttons from the main window after the first capture.
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  w.on('blur', () => w.isVisible() && w.hide())
  w.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL + '#capture')
  else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'capture' })
  return w
}

/**
 * Show the quick-capture panel over whatever app is in front. Centered on the cursor's screen, or right
 * below `anchor` (the menu-bar icon's bounds) when opened from the tray.
 */
export function showCaptureWindow(anchor?: Rectangle): void {
  if (!win || win.isDestroyed()) win = createCaptureWindow()
  if (win.isVisible()) return void win.hide()
  const point = anchor ? { x: anchor.x, y: anchor.y } : screen.getCursorScreenPoint()
  const { x, y, width, height } = screen.getDisplayNearestPoint(point).workArea
  const bounds = anchor
    ? { x: Math.round(Math.min(Math.max(anchor.x + anchor.width / 2 - WIDTH / 2, x + 8), x + width - WIDTH - 8)), y: y + 6 }
    : { x: Math.round(x + (width - WIDTH) / 2), y: Math.round(y + (height - HEIGHT) / 3) }
  win.setBounds({ ...bounds, width: WIDTH, height: HEIGHT })
  win.show()
  win.webContents.focus()
}

export function hideCaptureWindow(): void {
  win?.hide()
}

/**
 * (Re)registers the global shortcut for quick capture. Pass `null` to disable it.
 * Returns false if Electron could not claim the accelerator (e.g. already used by another app).
 */
export function applyCaptureShortcut(binding: string | null): boolean {
  if (registeredAccelerator) {
    globalShortcut.unregister(registeredAccelerator)
    registeredAccelerator = null
  }
  if (!binding) return true
  const accelerator = toAccelerator(binding)
  const ok = globalShortcut.register(accelerator, () => showCaptureWindow())
  if (ok) registeredAccelerator = accelerator
  return ok
}

export function teardownCapture(): void {
  if (registeredAccelerator) globalShortcut.unregister(registeredAccelerator)
  registeredAccelerator = null
  win?.destroy()
  win = null
}
