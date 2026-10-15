import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileSecretBox } from '../src/main/secretBox'

describe('file secret box (no Keychain)', () => {
  it('round-trips, keeps the key private and survives a restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidera-box-'))
    const enc = fileSecretBox(dir).encrypt('sk-test-123')
    expect(enc.toString('utf8')).not.toContain('sk-test-123')
    expect(statSync(join(dir, 'secret.key')).mode & 0o777).toBe(0o600)
    expect(fileSecretBox(dir).decrypt(enc)).toBe('sk-test-123')
  })

  it('rejects other formats and tampering', () => {
    const box = fileSecretBox(mkdtempSync(join(tmpdir(), 'sidera-box-')))
    expect(() => box.decrypt(Buffer.from('v10-keychain-blob'))).toThrow()
    const enc = box.encrypt('x')
    enc[enc.length - 1] ^= 1
    expect(() => box.decrypt(enc)).toThrow()
  })

})
