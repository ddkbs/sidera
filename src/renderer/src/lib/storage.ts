import { namespacedKey } from '@shared/auth'

/**
 * localStorage key scoped to the signed-in account, so tabs, sidebar and view preferences never leak
 * between accounts (all accounts share one browser origin). The migrated first account and dev folders
 * keep the bare key.
 */
export const storageKey = (key: string): string => namespacedKey(key, window.auth?.session?.storageNamespace ?? '')

/** Key of the persisted UI state (tabs, sidebar, chat, PDF pane). */
export const UI_KEY = storageKey('canvascl.ui')
