import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import type { AiProviderId } from '@shared/ai'

/** Env var fallbacks, checked in order, per provider. */
const ENV_VARS: Record<AiProviderId, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  xai: ['XAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  ollama: [],
  custom: []
}

/**
 * Encrypted per-provider API key store, one file (`ai-keys.bin`) holding a JSON map,
 * encrypted at rest with Electron `safeStorage`. Migrates a legacy standalone
 * `anthropic-key.bin` (from before multi-provider support) on first load.
 */
export class KeyStore {
  private file: string
  private legacyFile: string
  private cache: Partial<Record<AiProviderId, string>> = {}
  /**
   * True when an encrypted key file exists but couldn't be decrypted — e.g. the macOS Keychain item
   * (named after the OS-level app name) doesn't match after a product rename, or Keychain access was
   * denied. Treated as "no key stored" rather than a crash; the UI can use this to show a one-time
   * "please re-enter your API key" hint instead of silently looking like the key was just never set.
   */
  private decryptError = false

  constructor(dataDir: string) {
    this.file = join(dataDir, 'ai-keys.bin')
    this.legacyFile = join(dataDir, 'anthropic-key.bin')
    this.load()
    this.migrateLegacy()
  }

  private load(): void {
    if (!existsSync(this.file) || !safeStorage.isEncryptionAvailable()) return
    try {
      const json = safeStorage.decryptString(readFileSync(this.file))
      const parsed = JSON.parse(json) as Record<string, string>
      this.cache = parsed
    } catch {
      this.cache = {}
      this.decryptError = true
    }
  }

  /** See `decryptError` above. */
  hadDecryptError(): boolean {
    return this.decryptError
  }

  private migrateLegacy(): void {
    if (!existsSync(this.legacyFile) || this.cache.anthropic || !safeStorage.isEncryptionAvailable()) return
    try {
      const key = safeStorage.decryptString(readFileSync(this.legacyFile))
      this.cache.anthropic = key
      this.save()
    } catch {
      // ignore corrupt legacy file
    } finally {
      try {
        rmSync(this.legacyFile)
      } catch {
        // ignore
      }
    }
  }

  private save(): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain encryption unavailable')
    writeFileSync(this.file, safeStorage.encryptString(JSON.stringify(this.cache)))
  }

  /** Stored (not env) key for a provider, or null. */
  getStored(provider: AiProviderId): string | null {
    return this.cache[provider] ?? null
  }

  set(provider: AiProviderId, key: string | null): void {
    if (!key) {
      delete this.cache[provider]
    } else {
      this.cache[provider] = key.trim()
    }
    this.save()
  }

  /** Env var, then stored key. Never sent to the renderer — main-process use only. */
  resolve(provider: AiProviderId): string | null {
    for (const v of ENV_VARS[provider]) {
      const val = process.env[v]
      if (val) return val
    }
    return this.getStored(provider)
  }

  hasKey(provider: AiProviderId): boolean {
    return !!this.resolve(provider)
  }
}
