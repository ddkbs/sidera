import { namespacedKey } from '@shared/auth'

const LEGACY_PREFIX = 'canvascl.'
const CURRENT_PREFIX = 'sidera.'

/**
 * One-time, idempotent copy of every localStorage key from the pre-rename `canvascl.` prefix (e.g.
 * `canvascl.ui@<account>`) to `sidera.` — skipped per-key if the new key is already set — then removes
 * the old key. Runs as a side effect of importing this module, which every localStorage key in the app
 * goes through (via `storageKey`/`UI_KEY`), so it always runs before anything reads a renamed key.
 */
function migrateLegacyStorageKeys(): void {
  try {
    for (const oldKey of Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_PREFIX))) {
      const newKey = CURRENT_PREFIX + oldKey.slice(LEGACY_PREFIX.length)
      if (localStorage.getItem(newKey) === null) {
        const value = localStorage.getItem(oldKey)
        if (value !== null) localStorage.setItem(newKey, value)
      }
      localStorage.removeItem(oldKey)
    }
  } catch {
    // localStorage unavailable (private mode, tests) — nothing to migrate.
  }
}
migrateLegacyStorageKeys()

/**
 * localStorage key scoped to the signed-in account, so tabs, sidebar and view preferences never leak
 * between accounts (all accounts share one browser origin). The migrated first account and dev folders
 * keep the bare key.
 */
export const storageKey = (key: string): string => namespacedKey(key, window.auth?.session?.storageNamespace ?? '')

/** Key of the persisted UI state (tabs, sidebar, chat, PDF pane). */
export const UI_KEY = storageKey('sidera.ui')
