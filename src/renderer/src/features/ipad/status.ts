import { useSyncExternalStore } from 'react'
import type { IpadStatus } from '@shared/ipad'

/** Desktop side of Sidera for iPad: one shared snapshot of the main process' iPad server status. */

const EMPTY: IpadStatus = { enabled: false, running: false, origin: null, address: null, connected: [], devices: [] }
let snapshot = EMPTY
const listeners = new Set<() => void>()
let subscribed = false

const set = (s: IpadStatus): void => {
  snapshot = s
  listeners.forEach((l) => l())
}

function ensure(): void {
  if (subscribed || !window.ipad) return
  subscribed = true
  window.ipad.onStatus(set)
  void window.ipad.status().then(set, () => undefined)
}

export function useIpadStatus(): IpadStatus {
  ensure()
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot
  )
}

export const setIpadStatus = set
