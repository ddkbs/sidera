import { ipcMain } from 'electron'
import { API_METHODS, type CanvasApi } from '@shared/api'

type Handlers = { [K in keyof CanvasApi]: (...args: Parameters<CanvasApi[K]>) => unknown }

export function registerIpc(handlers: Handlers): void {
  for (const name of API_METHODS) {
    const fn = handlers[name] as (...args: unknown[]) => unknown
    ipcMain.handle(`api:${name}`, (_e, ...args: unknown[]) => fn(...args))
  }
}
