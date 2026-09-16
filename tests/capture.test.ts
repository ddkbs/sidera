import { describe, expect, it, vi } from 'vitest'

const registered: string[] = []
const unregistered: string[] = []

vi.mock('electron', () => ({
  BrowserWindow: class {},
  globalShortcut: {
    register: vi.fn((accelerator: string, _cb: () => void) => {
      registered.push(accelerator)
      return accelerator !== 'Bad+Accelerator'
    }),
    unregister: vi.fn((accelerator: string) => unregistered.push(accelerator))
  },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } })
  }
}))

describe('capture: shortcut accelerator conversion', () => {
  it('maps our binding format to Electron accelerators', async () => {
    const { toAccelerator } = await import('../src/main/capture')
    expect(toAccelerator('Ctrl+Alt+Space')).toBe('Control+Alt+Space')
    expect(toAccelerator('Mod+Shift+N')).toBe('CommandOrControl+Shift+N')
    expect(toAccelerator('Mod+K')).toBe('CommandOrControl+K')
  })
})

describe('capture: global shortcut lifecycle', () => {
  it('registers, swaps and tears down the global shortcut, reporting failure', async () => {
    const { applyCaptureShortcut, teardownCapture } = await import('../src/main/capture')

    expect(applyCaptureShortcut('Ctrl+Alt+Space')).toBe(true)
    expect(registered).toContain('Control+Alt+Space')

    // switching accelerators unregisters the previous one first
    expect(applyCaptureShortcut('Ctrl+Alt+K')).toBe(true)
    expect(unregistered).toContain('Control+Alt+Space')
    expect(registered).toContain('Control+Alt+K')

    // disabling unregisters without registering a new one
    expect(applyCaptureShortcut(null)).toBe(true)
    expect(unregistered).toContain('Control+Alt+K')

    teardownCapture()
  })

  it('reports registration failure (e.g. accelerator already in use)', async () => {
    const { applyCaptureShortcut } = await import('../src/main/capture')
    expect(applyCaptureShortcut('Bad+Accelerator')).toBe(false)
  })
})
