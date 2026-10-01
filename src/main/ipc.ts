import { ipcMain } from 'electron'
import { API_METHODS } from '@shared/api'
import type { ApiMethod } from '@shared/api'
import type { Handlers } from './session'

/**
 * Every API method → `api:<name>`. Handlers are resolved per call so the active session (account) can be
 * swapped without re-registering; `resolve` throws while nobody is signed in. `after` runs after every successful call
 * (Sidera for iPad hears about desktop writes through it).
 */
export function registerIpc(resolve: () => Handlers, after?: (name: ApiMethod) => void): void {
  for (const name of API_METHODS) {
    ipcMain.handle(`api:${name}`, async (_e, ...args: unknown[]) => {
      const result = await (resolve()[name] as (...a: unknown[]) => unknown)(...args)
      after?.(name)
      return result
    })
  }
}
