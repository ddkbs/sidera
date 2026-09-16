import type { CanvasApi, DbChangeScope } from '../shared/api'

declare global {
  interface Window {
    api: CanvasApi
    events: { onDbChanged(cb: (scopes: DbChangeScope[]) => void): () => void }
    platform: string
  }
}
export {}
