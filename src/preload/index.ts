import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { SETTINGS_CHANGED, type AppSettings } from '@shared/settings'
import type { AiProviderId } from '@shared/ai'
import type { AuthBridge, SessionInfo } from '@shared/auth'
import {
  API_METHODS,
  CHAT_EVENT,
  type AppBridge,
  type AskUserAnswer,
  DB_CHANGED,
  MCP_ACTIVITY,
  type ChatBridge,
  type ChatEvent,
  type CanvasApi,
  type DbChangeScope,
  type McpActivity
} from '@shared/api'

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
  },
  /** menu-bar icon → "Settings…" */
  onOpenSettings(cb: () => void): () => void {
    const listener = (): void => cb()
    ipcRenderer.on('app:open-settings', listener)
    return () => ipcRenderer.removeListener('app:open-settings', listener)
  }
}

const chat: ChatBridge = {
  send: (text) => ipcRenderer.invoke('chat:send', text),
  stop: () => ipcRenderer.invoke('chat:stop'),
  reset: () => ipcRenderer.invoke('chat:reset'),
  hasKey: () => ipcRenderer.invoke('chat:hasKey'),
  setKey: (key) => ipcRenderer.invoke('chat:setKey', key),
  getProviderStatus: () => ipcRenderer.invoke('chat:getProviderStatus'),
  setProviderKey: (provider: AiProviderId, key) => ipcRenderer.invoke('chat:setProviderKey', provider, key),
  listModels: (provider: AiProviderId, baseUrl?: string) => ipcRenderer.invoke('chat:listModels', provider, baseUrl),
  answerQuestions: (requestId: string, answers: AskUserAnswer[]) => ipcRenderer.invoke('chat:answerQuestions', requestId, answers),
  skipQuestions: (requestId: string) => ipcRenderer.invoke('chat:skipQuestions', requestId),
  onEvent(cb) {
    const listener = (_: unknown, e: ChatEvent): void => cb(e)
    ipcRenderer.on(CHAT_EVENT, listener)
    return () => ipcRenderer.removeListener(CHAT_EVENT, listener)
  }
}

const appBridge: AppBridge = {
  getSettings: () => ipcRenderer.invoke('app:getSettings'),
  setSettings: (patch) => ipcRenderer.invoke('app:setSettings', patch),
  onSettingsChanged(cb) {
    const listener = (_: unknown, s: AppSettings): void => cb(s)
    ipcRenderer.on(SETTINGS_CHANGED, listener)
    return () => ipcRenderer.removeListener(SETTINGS_CHANGED, listener)
  },
  getDataInfo: () => ipcRenderer.invoke('app:getDataInfo'),
  revealDataDir: () => ipcRenderer.invoke('app:revealDataDir'),
  getMcpConnections: () => ipcRenderer.invoke('app:getMcpConnections'),
  connectClaude: (target) => ipcRenderer.invoke('app:connectClaude', target),
  openCapture: () => ipcRenderer.invoke('app:openCapture'),
  hideCapture: () => ipcRenderer.invoke('app:hideCapture')
}

// Taken once per page load: main reloads every window when the session changes.
const session = ipcRenderer.sendSync('auth:sessionSync') as SessionInfo | null

const auth: AuthBridge = {
  session,
  status: () => ipcRenderer.invoke('auth:status'),
  listAccounts: () => ipcRenderer.invoke('auth:listAccounts'),
  createAccount: (input) => ipcRenderer.invoke('auth:createAccount', input),
  setupAccount: (id, input) => ipcRenderer.invoke('auth:setupAccount', id, input),
  signIn: (id, password, staySignedIn) => ipcRenderer.invoke('auth:signIn', id, password, staySignedIn),
  continueAsGuest: () => ipcRenderer.invoke('auth:continueAsGuest'),
  saveGuestAsAccount: (input) => ipcRenderer.invoke('auth:saveGuestAsAccount', input),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  updateAccount: (patch) => ipcRenderer.invoke('auth:updateAccount', patch),
  deleteAccount: (id, password) => ipcRenderer.invoke('auth:deleteAccount', id, password)
}

contextBridge.exposeInMainWorld('auth', auth)
contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('app', appBridge)
contextBridge.exposeInMainWorld('chat', chat)
contextBridge.exposeInMainWorld('events', events)
contextBridge.exposeInMainWorld('platform', process.platform)
contextBridge.exposeInMainWorld('files', { pathFor: (f: File) => webUtils.getPathForFile(f) })

export type CanvasEvents = typeof events
