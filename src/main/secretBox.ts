import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SecretBox } from './ipad/devices'

const MAGIC = Buffer.from('SDR1')
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * Encryption at rest for small secrets (AI keys, iPad device keys) without the macOS Keychain: AES-256-GCM under a
 * random key in `<dataDir>/secret.key` (0600). Protects against the files being copied out on their own (backups,
 * sync folders) and keeps them unreadable to other users; any process running as this user can read both, which is
 * the trade-off for never showing a Keychain password prompt (ad-hoc/self-signed builds change identity on update).
 */
export function fileSecretBox(dataDir: string): SecretBox {
  const keyFile = join(dataDir, 'secret.key')
  let key: Buffer | null = null
  const getKey = (): Buffer => {
    if (key) return key
    if (existsSync(keyFile)) {
      const k = readFileSync(keyFile)
      if (k.length === 32) return (key = k)
    }
    key = randomBytes(32)
    writeFileSync(keyFile, key, { mode: 0o600 })
    return key
  }
  return {
    encrypt(plain) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body])
    },
    decrypt(data) {
      // anything else is a file from before (Keychain-encrypted) or corrupt — callers treat it as "not stored"
      if (data.length < MAGIC.length + IV_BYTES + TAG_BYTES || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unknown secret format')
      const iv = data.subarray(MAGIC.length, MAGIC.length + IV_BYTES)
      const tag = data.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES)
      const decipher = createDecipheriv('aes-256-gcm', getKey(), iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8')
    }
  }
}
