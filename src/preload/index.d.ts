import type { CanvasApi, DbChangeScope, McpActivity } from '../shared/api'

declare global {
  interface Window {
    api: CanvasApi
    events: {
      onDbChanged(cb: (scopes: DbChangeScope[]) => void): () => void
      onMcpActivity(cb: (a: McpActivity) => void): () => void
    }
    platform: string
    files: { pathFor(file: File): string }
  }
}
export {}
