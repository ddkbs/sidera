import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { API_METHODS, CHAT_EVENT, DB_CHANGED, MCP_ACTIVITY, type ChatBridge, type ChatEvent, type CanvasApi, type DbChangeScope, type McpActivity } from '@shared/api'

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

const chat: ChatBridge = {
  send: (text) => ipcRenderer.invoke('chat:send', text),
  stop: () => ipcRenderer.invoke('chat:stop'),
  reset: () => ipcRenderer.invoke('chat:reset'),
  hasKey: () => ipcRenderer.invoke('chat:hasKey'),
  setKey: (key) => ipcRenderer.invoke('chat:setKey', key),
  onEvent(cb) {
    const listener = (_: unknown, e: ChatEvent): void => cb(e)
    ipcRenderer.on(CHAT_EVENT, listener)
    return () => ipcRenderer.removeListener(CHAT_EVENT, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('chat', chat)
contextBridge.exposeInMainWorld('events', events)
contextBridge.exposeInMainWorld('platform', process.platform)
contextBridge.exposeInMainWorld('files', { pathFor: (f: File) => webUtils.getPathForFile(f) })

export type CanvasEvents = typeof events
