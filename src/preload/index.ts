import { contextBridge, ipcRenderer } from 'electron'
import { API_METHODS, DB_CHANGED, type CanvasApi, type DbChangeScope } from '@shared/api'

const api = Object.fromEntries(
  API_METHODS.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args)])
) as unknown as CanvasApi

const events = {
  onDbChanged(cb: (scopes: DbChangeScope[]) => void): () => void {
    const listener = (_: unknown, scopes: DbChangeScope[]): void => cb(scopes)
    ipcRenderer.on(DB_CHANGED, listener)
    return () => ipcRenderer.removeListener(DB_CHANGED, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('events', events)
contextBridge.exposeInMainWorld('platform', process.platform)

export type CanvasEvents = typeof events
