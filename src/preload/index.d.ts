import type { AuthBridge } from '../shared/auth'
import type { DrawBridge } from '../shared/draw'
import type { AppBridge, CanvasApi, ChatBridge, DbChangeScope, McpActivity } from '../shared/api'

declare global {
  interface Window {
    api: CanvasApi
    auth: AuthBridge
    events: {
      onDbChanged(cb: (scopes: DbChangeScope[]) => void): () => void
      onMcpActivity(cb: (a: McpActivity) => void): () => void
      onOpenSettings(cb: () => void): () => void
      onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void
    }
    platform: string
    chat: ChatBridge
    draw: DrawBridge
    app: AppBridge
    files: { pathFor(file: File): string }
  }
}
export {}
