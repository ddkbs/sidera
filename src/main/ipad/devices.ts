import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { DEVICE_ID_BYTES, cleanDeviceName } from '@shared/sync/protocol'
import { KEY_BYTES, toB64u } from '@shared/sync/crypto'
import type { PairedDevice } from '@shared/ipad'

/** Encryption at rest for the device keys (`fileSecretBox` in the app; null = plain file, tests only). */
export interface SecretBox {
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

interface StoredDevice extends PairedDevice {
  /** base64url device key */
  key: string
}

/**
 * Paired iPads of one data folder (`ipad-devices.bin`). Each holds its own random 256-bit key, created by the Mac at
 * pairing; revoking deletes it, so that device can never authenticate again.
 */
export class DeviceStore {
  private devices: StoredDevice[] = []

  constructor(
    private file: string,
    private box: SecretBox | null
  ) {
    this.load()
  }

  private load(): void {
    if (!existsSync(this.file)) return
    try {
      const raw = readFileSync(this.file)
      const json = this.box ? this.box.decrypt(raw) : raw.toString('utf8')
      const list = JSON.parse(json) as StoredDevice[]
      this.devices = Array.isArray(list) ? list.filter((d) => d && typeof d.id === 'string' && typeof d.key === 'string') : []
    } catch {
      // unreadable (e.g. written by an older, Keychain-based version): behave as if nothing was paired — devices simply pair again
      this.devices = []
    }
  }

  private save(): void {
    const json = JSON.stringify(this.devices)
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, this.box ? this.box.encrypt(json) : json, { mode: 0o600 })
    renameSync(tmp, this.file)
  }

  list(): PairedDevice[] {
    return this.devices.map(({ key: _key, ...d }) => d)
  }

  /** Secret of a device (base64url), or null if unknown / revoked. */
  keyOf(id: string): string | null {
    return this.devices.find((d) => d.id === id)?.key ?? null
  }

  get(id: string): PairedDevice | null {
    const d = this.devices.find((x) => x.id === id)
    if (!d) return null
    const { key: _key, ...rest } = d
    return rest
  }

  add(name: string): { id: string; key: string } {
    const d: StoredDevice = { id: toB64u(randomBytes(DEVICE_ID_BYTES)), key: toB64u(randomBytes(KEY_BYTES)), name: cleanDeviceName(name), createdAt: Date.now(), lastSeenAt: Date.now() }
    this.devices.push(d)
    this.save()
    return { id: d.id, key: d.key }
  }

  touch(id: string, name?: string): void {
    const d = this.devices.find((x) => x.id === id)
    if (!d) return
    d.lastSeenAt = Date.now()
    if (name) d.name = cleanDeviceName(name)
    this.save()
  }

  remove(id: string): boolean {
    const before = this.devices.length
    this.devices = this.devices.filter((d) => d.id !== id)
    if (this.devices.length === before) return false
    this.save()
    return true
  }
}
