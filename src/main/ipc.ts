import { ipcMain } from 'electron'
import { API_METHODS } from '@shared/api'
import type { Handlers } from './session'

/**
 * Every API method → `api:<name>`. Handlers are resolved per call so the active session (account) can be
 * swapped without re-registering; `resolve` throws while nobody is signed in.
 */
export function registerIpc(resolve: () => Handlers): void {
  for (const name of API_METHODS) {
    ipcMain.handle(`api:${name}`, (_e, ...args: unknown[]) => (resolve()[name] as (...a: unknown[]) => unknown)(...args))
  }
}
