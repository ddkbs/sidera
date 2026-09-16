import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { API_METHODS, DB_CHANGED, MCP_ACTIVITY, type CanvasApi, type DbChangeScope, type McpActivity } from '@shared/api'

const api = Object.fromEntries(
  API_METHODS.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args)])
) as unknown as CanvasApi

const events = {
  onDbChanged(cb: (scopes: DbChangeScope[]) => void): () => void {
    const listener = (_: unknown, scopes: DbChangeScope[]): void => cb(scopes)
    ipcRenderer.on(DB_CHANGED, listener)
    return () => ipcRenderer.removeListener(DB_CHANGED, listener)
  },
  onMcpActivity(cb: (a: McpActivity) => void): () => void {
    const listener = (_: unknown, a: McpActivity): void => cb(a)
    ipcRenderer.on(MCP_ACTIVITY, listener)
    return () => ipcRenderer.removeListener(MCP_ACTIVITY, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('events', events)
contextBridge.exposeInMainWorld('platform', process.platform)
contextBridge.exposeInMainWorld('files', { pathFor: (f: File) => webUtils.getPathForFile(f) })

export type CanvasEvents = typeof events
