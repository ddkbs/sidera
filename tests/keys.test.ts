import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let available = true
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from('OK:' + s),
    // Simulate a Keychain item that no longer decrypts (e.g. after a rename) unless it's our own marker.
    decryptString: (b: Buffer) => {
      const s = b.toString()
      if (s.startsWith('OK:')) return s.slice(3)
      throw new Error('decryption failed')
    }
  }
}))

describe('KeyStore', () => {
  let dir: string
  beforeEach(() => {
    available = true
    dir = mkdtempSync(join(tmpdir(), 'sidera-keys-'))
  })
  afterEach(() => vi.resetModules())

  it('treats an undecryptable key file as "no key stored", without throwing', async () => {
    writeFileSync(join(dir, 'ai-keys.bin'), 'garbage-not-decryptable')
    const { KeyStore } = await import('../src/main/ai/keys')
    const store = new KeyStore(dir)
    expect(store.hasKey('anthropic')).toBe(false)
    expect(store.hadDecryptError()).toBe(true)
  })

  it('has no decrypt error when there is simply no key file', async () => {
    const { KeyStore } = await import('../src/main/ai/keys')
    const store = new KeyStore(dir)
    expect(store.hadDecryptError()).toBe(false)
  })

  it('reads back a key it just set (round-trip through the mocked safeStorage)', async () => {
    const { KeyStore } = await import('../src/main/ai/keys')
    const store = new KeyStore(dir)
    store.set('anthropic', 'sk-test')
    expect(store.getStored('anthropic')).toBe('sk-test')
    expect(store.hadDecryptError()).toBe(false)
  })
})
