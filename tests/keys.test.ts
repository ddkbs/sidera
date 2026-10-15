import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { KeyStore } from '../src/main/ai/keys'
import { fileSecretBox } from '../src/main/secretBox'

describe('KeyStore', () => {
  let dir: string
  const open = () => new KeyStore(dir, fileSecretBox(dir))
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sidera-keys-'))
  })

  it('treats an undecryptable key file (e.g. from the Keychain era) as "no key stored", without throwing', () => {
    writeFileSync(join(dir, 'ai-keys.bin'), 'v10-garbage-not-decryptable')
    const store = open()
    expect(store.hasKey('anthropic')).toBe(false)
    expect(store.hadDecryptError()).toBe(true)
  })

  it('has no decrypt error when there is simply no key file', () => {
    expect(open().hadDecryptError()).toBe(false)
  })

  it('stores keys encrypted and reads them back after a restart', () => {
    open().set('anthropic', 'sk-ant-test')
    expect(readFileSync(join(dir, 'ai-keys.bin')).toString('utf8')).not.toContain('sk-ant-test')
    const store = open()
    expect(store.getStored('anthropic')).toBe('sk-ant-test')
    expect(store.hadDecryptError()).toBe(false)
  })
})
